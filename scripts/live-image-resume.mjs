// Diagnostic retry of the selected image fixture; keep response files in the private test root.
import fs from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { createApplication } from '../dist/app/apps/control-api/application.js';
import { HttpModelClient } from '../dist/app/ai/providers/model-client.js';
const root = process.env.LIVE_WORKSPACE_ROOT;
if (!root || !process.env.MODEL_API_KEY)
  throw new Error('Set LIVE_WORKSPACE_ROOT and MODEL_API_KEY');
const report = JSON.parse(await fs.readFile(root + '/report.json'));
const provider = new HttpModelClient();
let calls = 0;
const system = await createApplication({
  root,
  model: {
    async complete(request) {
      const n = ++calls;
      console.log(JSON.stringify({ call: n, pages: request.images.map((i) => i.page) }));
      const response = await provider.complete(request);
      await fs.writeFile(
        `${root}/retry-call-${n}.json`,
        JSON.stringify(
          { input: request.input, text: response.text, cache: response.cache },
          null,
          2,
        ),
        { mode: 0o600 },
      );
      return response;
    },
  },
});
const deadline = Date.now() + 900000;
const timer = setTimeout(() => void system.workspaces.shutdown(), 900000);
try {
  await system.app.listen(0, '127.0.0.1');
  const base = await system.app.getUrl();
  console.log(JSON.stringify({ base, root }));
  const url = base + '/api/workspaces/' + report.workspaceId;
  const resumed = await fetch(url + '/resume', { method: 'POST' });
  if (resumed.status !== 202) throw new Error('Resume HTTP ' + resumed.status);
  let view,
    last = '';
  do {
    await sleep(2000);
    view = await (await fetch(url)).json();
    const state = JSON.stringify({
      status: view.workspace.status,
      chapters: view.chapters.map((c) => ({ status: c.status, cursor: c.cursor })),
    });
    if (state !== last) {
      console.log(state);
      last = state;
    }
    if (Date.now() > deadline) throw new Error('Timeout');
  } while (view.workspace.status === 'extracting');
  await fs.writeFile(root + '/resumed-view.json', JSON.stringify(view, null, 2));
  console.log(
    JSON.stringify({ status: view.workspace.status, error: view.workspace.error, calls }),
  );
} finally {
  clearTimeout(timer);
  await system.app.close();
}
