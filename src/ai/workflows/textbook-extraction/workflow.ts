import type { WorkspaceRepository } from '../../../modules/textbooks/ports/workspace.repository.js';
import type { Skills, SkillContext } from '../../runtime/skill-runner.js';
import { BoundaryResult, StructureResult, LookaheadResult, ExtractResult } from './contracts.js';
import { checkBoundary, materialize, readingOrder } from './guards.js';
import { validateDocument } from '../../../modules/textbooks/domain/validation.js';
import { addEvent } from '../../../modules/jobs/application/job-events.js';

export class TextbookWorkflow {
  constructor(
    private store: WorkspaceRepository,
    private skills: Skills,
  ) {}
  async execute(context: SkillContext) {
    let book = await this.store.read(context.bookId);
    let job = book.jobs.find((j) => j.id === context.jobId)!;
    if (job.phase !== 'parse') return;
    for (let page = job.cursor; page <= job.endPage; page++) {
      context.signal.throwIfAborted();
      const stage = structuredClone(job.stage!);
      const structure = await this.skills.run(
        'textbook-structure-detect',
        { page, sections: stage.sections, activeSectionId: job.activeSectionId },
        StructureResult,
        [page],
        context,
      );
      for (const section of structure.sections) {
        if (section.source.page !== page)
          throw new Error('New sections must originate on current page');
        const existing = stage.sections.find((s) => s.id === section.id);
        if (existing && JSON.stringify(existing) !== JSON.stringify(section))
          throw new Error('Cannot redefine an existing section');
        if (!existing) stage.sections.push(section);
      }
      const structureErrors = validateDocument(
        { ...stage, contents: [] },
        book.pages.length,
      ).filter((i) => !['UNPROCESSED_PAGE'].includes(i.code));
      if (structureErrors.length)
        throw new Error(`Invalid structure: ${structureErrors[0]!.message}`);
      if (
        structure.activeSectionId &&
        !stage.sections.some((s) => s.id === structure.activeSectionId)
      )
        throw new Error('Unknown active section');
      const queue = [
        ...new Set([...job.pending.flatMap((r) => r.sources.map((s) => s.page)), page]),
      ].sort((a, b) => a - b);
      if (queue.length > Number(process.env.MAX_PENDING_PAGES ?? 12))
        throw new Error(
          'Pending page budget exceeded; no pages discarded. Review the long/incomplete content before retrying.',
        );
      let boundary: ReturnType<typeof BoundaryResult.parse> | undefined;
      let feedback = '';
      for (let attempt = 0; attempt < 2; attempt++) {
        boundary = await this.skills.run(
          'cross-page-reconcile',
          {
            mode: 'boundary',
            queue,
            pending: job.pending,
            processed: stage.contents.filter((c) => c.sources.some((s) => queue.includes(s.page))),
            sections: stage.sections,
            activeSectionId: structure.activeSectionId,
            feedback,
          },
          BoundaryResult,
          queue,
          context,
        );
        try {
          checkBoundary(boundary, queue, job.pending, stage);
          break;
        } catch (error) {
          feedback = String(error);
          boundary = undefined;
        }
      }
      if (!boundary) throw new Error(`Boundary conflict: ${feedback}`);
      // A preview may only change whether the formal queue's tail is complete.
      const tail = [...boundary.complete, ...boundary.pending].sort(readingOrder).at(-1);
      if (tail && page < book.pages.length) {
        let accepted = false;
        for (let attempt = 0; attempt < 2; attempt++) {
          const preview = await this.skills.run(
            'cross-page-reconcile',
            {
              mode: 'lookahead',
              queue,
              previewPage: page + 1,
              tail,
              instruction:
                'Only inspect whether this exact formal tail continues; do not introduce preview content.',
            },
            LookaheadResult,
            [...queue, page + 1],
            context,
          );
          if (preview.tailKey !== tail.key) continue;
          if (preview.continues && boundary.complete.some((r) => r.key === tail.key)) {
            boundary.complete = boundary.complete.filter((r) => r.key !== tail.key);
            boundary.pending.push(tail);
          }
          accepted = true;
          break;
        }
        if (!accepted) throw new Error('Lookahead disagreed with the formal tail twice');
      }
      if (boundary.complete.length) {
        let extracted = false;
        feedback = '';
        for (let attempt = 0; attempt < 3; attempt++) {
          const result = await this.skills.run(
            'page-content-extract',
            {
              ranges: boundary.complete,
              excludedPending: boundary.pending,
              answerMode: 'extract_visible',
              feedback,
            },
            ExtractResult,
            queue,
            context,
          );
          try {
            const contents = materialize(result, boundary.complete);
            stage.contents.push(...contents);
            stage.issues.push(...result.issues);
            extracted = true;
            break;
          } catch (error) {
            feedback = String(error);
          }
        }
        if (!extracted)
          throw new Error(`Extraction blocked without advancing checkpoint: ${feedback}`);
      }
      stage.processedPages = [...new Set([...stage.processedPages, page])].sort((a, b) => a - b);
      context.signal.throwIfAborted();
      book = await this.store.update(book.id, (current) => {
        const saved = current.jobs.find((j) => j.id === job.id)!;
        if (boundary!.pending.length && page === saved.endPage && page < current.pages.length) {
          let end = page + 1,
            changed = true;
          while (changed) {
            changed = false;
            for (const content of stage.contents)
              if (content.sources.some((s) => s.page >= page + 1 && s.page <= end)) {
                const next = Math.max(end, ...content.sources.map((s) => s.page));
                if (next !== end) {
                  end = next;
                  changed = true;
                }
              }
          }
          stage.contents = stage.contents.filter(
            (c) => !c.sources.some((s) => s.page >= page + 1 && s.page <= end),
          );
          stage.processedPages = stage.processedPages.filter((p) => p < page + 1 || p > end);
          saved.endPage = end;
        }
        saved.stage = stage;
        saved.pending = boundary!.pending;
        saved.cursor = page + 1;
        saved.activeSectionId = structure.activeSectionId;
        addEvent(
          saved,
          `Checkpoint page ${page}: ${boundary!.complete.length} complete, ${boundary!.pending.length} pending`,
        );
      });
      job = book.jobs.find((j) => j.id === job.id)!;
    }
    context.signal.throwIfAborted();
    await this.store.update(
      book.id,
      (current) => {
        const saved = current.jobs.find((j) => j.id === job.id)!;
        if (current.revision !== saved.baseRevision)
          throw new Error('Document changed during extraction');
        const stage = saved.stage!;
        for (const pending of saved.pending)
          stage.issues.push({
            code: 'INCOMPLETE_RANGE',
            severity: 'error',
            page: pending.sources[0]!.page,
            contentId: null,
            message: `Unclosed ${pending.key}: ${pending.label}; source pages preserved for repair`,
          });
        stage.contents.sort(readingOrder);
        stage.issues.push(...validateDocument(stage, current.pages.length));
        stage.issues = [
          ...new Map(stage.issues.map((issue) => [JSON.stringify(issue), issue])).values(),
        ];
        current.document = stage;
        for (const page of current.pages) {
          page.status = stage.processedPages.includes(page.number)
            ? 'processed'
            : page.width
              ? 'ready'
              : 'uploaded';
          page.blank =
            page.status === 'processed' &&
            !stage.contents.some((c) => c.sources.some((s) => s.page === page.number)) &&
            !saved.pending.some((r) => r.sources.some((s) => s.page === page.number));
        }
        saved.phase = 'review';
        saved.stage = null;
        saved.baseRevision = current.revision + 1;
        addEvent(saved, 'Parsed document committed; incomplete ranges remain review issues');
      },
      true,
    );
  }
}
