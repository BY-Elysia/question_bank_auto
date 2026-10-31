// Opt-in public-server textbook regression. Credentials and source materials stay outside Git.
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import sharp from 'sharp';
const base = process.env.LIVE_BASE_URL;
const imageDir = process.env.LIVE_IMAGE_DIR;
const root = process.env.LIVE_RESULT_DIR;
if (!base || !imageDir || !root || !process.env.LIVE_CREDENTIALS_FILE)
  throw Error('Set LIVE_BASE_URL, LIVE_IMAGE_DIR, LIVE_RESULT_DIR and LIVE_CREDENTIALS_FILE');
const { username, password } = JSON.parse(await fs.readFile(process.env.LIVE_CREDENTIALS_FILE));
const selected = process.env.LIVE_CASES?.split(',');
const cases = [
  { id: 'sequence-proof', files: ['32.jpg', '33.jpg'], hasAnswer: true },
  { id: 'derivative-boundary', files: ['80.jpg', '81.jpg'], hasAnswer: true },
  { id: 'missing-answers', files: [path.resolve(root, 'question-only.png')], hasAnswer: false },
].filter((c) => !selected || selected.includes(c.id));
const concurrency = Number(process.env.LIVE_CASE_CONCURRENCY ?? 3);
if (!cases.length || !Number.isInteger(concurrency) || concurrency < 1 || concurrency > 3)
  throw Error('Select valid LIVE_CASES and LIVE_CASE_CONCURRENCY (1..3)');
await fs.mkdir(root, { recursive: true, mode: 0o700 });
if (cases.some((c) => c.id === 'missing-answers'))
  await sharp(path.join(imageDir, '19.jpg'))
    .extract({ left: 20, top: 327, width: 601, height: 102 })
    .png()
    .toFile(path.join(root, 'question-only.png'));
async function run(c) {
  const deadline = Date.now() + 18 * 60000;
  const report = {
    case: c.id,
    files: c.files.map((f) => path.basename(f)),
    startedAt: new Date().toISOString(),
    attempts: [],
    checks: [],
  };
  const dir = path.join(root, c.id);
  await fs.mkdir(dir, { recursive: true });
  const login = await fetch(base + '/api/access/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!login.ok) throw Error('Login HTTP ' + login.status);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  async function api(url, body, method = body === undefined ? 'GET' : 'POST') {
    const r = await fetch(base + url, {
      method,
      headers: {
        Cookie: cookie,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw Error(`${url}: HTTP ${r.status}`);
    return r.status === 204 ? null : r.json();
  }
  let view;
  try {
    const form = new FormData();
    for (const file of c.files)
      form.append(
        'images',
        new Blob([await fs.readFile(path.isAbsolute(file) ? file : path.join(imageDir, file))], {
          type: file.endsWith('.png') ? 'image/png' : 'image/jpeg',
        }),
        path.basename(file),
      );
    const upload = await fetch(
      base + '/api/workspaces/images?title=' + encodeURIComponent('端测 10-31 · ' + c.id),
      { method: 'POST', headers: { Cookie: cookie }, body: form },
    );
    if (upload.status !== 201) throw Error('Upload HTTP ' + upload.status);
    const w = await upload.json();
    report.workspaceId = w.id;
    const url = '/api/workspaces/' + w.id;
    await api(url + '/extract', {
      metadata: {
        version: 'v1.1',
        courseId: '',
        textbookId: '',
        title: '数学分析教材习题详解',
        publisher: '',
        subject: '数学分析',
        hasAnswer: c.hasAnswer,
        answerHandlingMode: c.hasAnswer ? 'extract_visible' : 'generate_brief',
      },
      mode: 'sequential',
      cache: 'prefix',
    });
    let last = '';
    let resumed = false;
    do {
      await sleep(2500);
      view = await api(url);
      const state = JSON.stringify({
        case: c.id,
        status: view.workspace.status,
        chapters: view.chapters.map((c) => ({ status: c.status, cursor: c.cursor })),
      });
      if (state !== last) {
        console.log(state);
        last = state;
        await fs.writeFile(dir + '/progress.json', JSON.stringify(view, null, 2), { mode: 0o600 });
      }
      if (view.workspace.status === 'failed' && !resumed) {
        report.attempts.push({ status: 'failed', error: view.workspace.error });
        await api(url + '/resume', {});
        resumed = true;
        continue;
      }
      if (!['preparing', 'extracting'].includes(view.workspace.status)) break;
    } while (Date.now() < deadline);
    await fs.writeFile(dir + '/view.json', JSON.stringify(view, null, 2), { mode: 0o600 });
    report.attempts.push({ status: view.workspace.status, error: view.workspace.error });
    const contents = view.document.contents;
    const questions = contents.filter((c) => c.question);
    const check = (name, passed) => report.checks.push({ name, passed: Boolean(passed) });
    check(
      'Extraction reaches a reviewable terminal state',
      ['completed', 'needs_review'].includes(view.workspace.status),
    );
    check(
      'Question text is stored in structured fields',
      questions.length && questions.every((c) => c.text === ''),
    );
    check('Unique content IDs', new Set(contents.map((c) => c.id)).size === contents.length);
    if (c.id === 'sequence-proof') {
      const q = questions.filter((c) => c.question.label === '3');
      check(
        'Question 3 exactly once with two subquestions',
        q.length === 1 && q[0].question.children.length === 2,
      );
      check(
        'Question 3 includes its cross-page continuation',
        q.length === 1 && new Set(q[0].sources.map((s) => s.page)).size === 2,
      );
      check(
        'Both original proof answers retained',
        q[0]?.question.children.every(
          (q) => q.answer?.origin === 'source' && q.answer.explanation.length > 100,
        ),
      );
    }
    if (c.id === 'sequence-proof') {
      const q4 = questions.find((c) => c.question.label === '4')?.question;
      check(
        'Eight limit stems remain readable LaTeX',
        q4?.children.length === 8 && q4.children.every((q) => q.prompt.includes('\\lim')),
      );
    }
    if (c.id === 'derivative-boundary') {
      const q = questions.filter((c) => c.question.label === '3');
      check(
        'Tangent/normal question spans both pages',
        q.length === 1 &&
          new Set(q[0].sources.map((s) => s.page)).size === 2 &&
          q[0].question.children.length === 2,
      );
      check(
        'Exercises 5.3 and 5.4 remain distinct',
        view.document.sections.some((s) => /5[.．]3/.test(s.title)) &&
          view.document.sections.some((s) => /5[.．]4/.test(s.title)),
      );
    }
    check(
      'Heading blocks contain their source title',
      contents.filter((c) => c.kind === 'heading').every((c) => c.text.trim()),
    );
    if (c.id === 'missing-answers') {
      const q = questions.find((c) => c.question.label === '3');
      check('Seven subquestions retained', q?.question.children.length === 7);
      check(
        'No generated answer silently committed',
        q?.question.children.every((q) => q.answer === null),
      );
      check(
        'Generated answers are review candidates',
        view.proposals.filter((p) => p.reason === 'answers' && p.status === 'pending').length > 0,
      );
    }
    if (['completed', 'needs_review'].includes(view.workspace.status)) {
      const exported = await api(view.exportJsonUrl);
      await fs.writeFile(dir + '/export.json', JSON.stringify(exported, null, 2), { mode: 0o600 });
      check('JSON export preserves all content', exported.contents.length === contents.length);
    }
    report.questions = questions.map((c) => ({
      id: c.id,
      label: c.question.label,
      sectionId: c.sectionId,
      pages: c.sources.map((s) => s.page),
      children: c.question.children.length,
      answers: c.question.children.map((q) => q.answer?.origin ?? null),
    }));
    report.issues = view.document.issues;
    report.passed = report.checks.every((c) => c.passed);
  } catch (e) {
    report.passed = false;
    report.error = e.message;
    console.log(JSON.stringify({ case: c.id, error: e.message }));
  } finally {
    report.finishedAt = new Date().toISOString();
    await fs.writeFile(dir + '/report.json', JSON.stringify(report, null, 2), { mode: 0o600 });
    if (report.workspaceId && ['preparing', 'extracting'].includes(view?.workspace.status)) {
      await api('/api/workspaces/' + report.workspaceId + '/cancel', {}).catch(() => {});
    }
    await api('/api/access/logout', {}).catch(() => {});
  }
  console.log(JSON.stringify({ case: c.id, passed: report.passed, checks: report.checks }));
  return report;
}
const results = [];
for (let start = 0; start < cases.length; start += concurrency)
  results.push(...(await Promise.allSettled(cases.slice(start, start + concurrency).map(run))));
await fs.writeFile(path.join(root, 'summary.json'), JSON.stringify(results, null, 2), {
  mode: 0o600,
});
if (results.some((r) => r.status === 'rejected' || !r.value.passed)) process.exitCode = 1;
