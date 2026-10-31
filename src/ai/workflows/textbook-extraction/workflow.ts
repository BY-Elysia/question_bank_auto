import { transcriptionIssues } from '../../../modules/textbooks/domain/transcription-quality.js';
import { contextIssues } from './context-quality.js';
import { planPage } from './plan-page.js';
import { sourceAnswerCoverageIssues } from '../../../modules/textbooks/domain/content-quality.js';
import { extractRanges } from './extract-ranges.js';
import type { BookRepository } from '../../../modules/textbooks/ports/book.repository.js';
import type { Skills, SkillContext } from '../../ports/skills.js';
import { materialize, readingOrder } from './guards.js';
import { validateDocument } from '../../../modules/textbooks/domain/validation.js';
import { addEvent } from '../../../modules/jobs/application/job-events.js';

export class TextbookWorkflow {
  constructor(
    private store: BookRepository,
    private skills: Skills,
  ) {}
  async execute(context: SkillContext) {
    let book = await this.store.read(context.bookId);
    let job = book.jobs.find((j) => j.id === context.jobId)!;
    if (job.phase !== 'parse') return;
    for (let page = job.cursor; page <= job.endPage; page++) {
      context.signal.throwIfAborted();
      const { stage, boundary, queue, structure } = await planPage(
        this.skills,
        book,
        job,
        page,
        context,
      );
      if (boundary.complete.length) {
        await extractRanges(
          this.skills,
          {
            ranges: boundary.complete,
            excludedPending: boundary.pending,
            answerMode: 'extract_visible',
            feedback: '',
          },
          queue,
          context,
          async (part, ranges) => {
            stage.contents.push(...materialize(part, ranges));
            stage.issues.push(...part.issues);
            context.signal.throwIfAborted();
            await this.store.update(book.id, (current) => {
              const saved = current.jobs.find((j) => j.id === job.id)!;
              saved.stage = structuredClone(stage);
              saved.pending = [
                ...boundary.pending,
                ...boundary.complete.filter((r) => !stage.contents.some((c) => c.key === r.key)),
              ];
              saved.activeSectionId = structure.activeSectionId;
              addEvent(
                saved,
                `Validated range checkpoint: ${ranges.map((r) => r.key).join(', ')}; page ${page} remains uncommitted`,
              );
            });
          },
        );
      }

      for (const key of boundary.orphanedStarts) {
        const range = [...boundary.complete, ...boundary.pending].find((r) => r.key === key)!;
        stage.issues.push({
          code: 'MISSING_QUESTION_START',
          severity: 'warning',
          page: range.sources[0]!.page,
          contentId: stage.contents.find((c) => c.key === key)?.id ?? null,
          message: `Source begins with a continuation without its question stem: ${range.label}; visible fragment preserved without inventing missing text`,
        });
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
        stage.issues.push(...contextIssues(stage));
        stage.issues.push(...transcriptionIssues(stage.contents));
        stage.issues.push(...sourceAnswerCoverageIssues(stage.contents));
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
