import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { NestFactory } from '@nestjs/core';
import { createHttpApp } from '../dist/app/shared/http/bootstrap.js';
import { ControlApiModule } from '../dist/app/apps/control-api/control-api.module.js';
import { InternalApiModule } from '../dist/app/apps/control-api/internal-api.module.js';
import { ModelGatewayModule } from '../dist/app/apps/model-gateway/model-gateway.module.js';
import { WorkspaceWorkerModule } from '../dist/app/apps/workspace-worker/workspace-worker.module.js';
import { WORKFLOW_RUNNER } from '../dist/app/ai/runtime/workflow-runner.port.js';

const spec = JSON.parse(
  fs.readFileSync(new URL('../dist/contracts/openapi.json', import.meta.url)),
);
const operations = Object.entries(spec.paths).flatMap(([path, methods]) =>
  Object.entries(methods).map(([method, operation]) => ({ path, method, operation })),
);

test('All 63 HTTP operations are wired and return typed 501; entry points stay isolated', async () => {
  const apps = [];
  try {
    for (const module of [ControlApiModule, InternalApiModule, ModelGatewayModule]) {
      const app = await createHttpApp(module);
      apps.push(app);
      await app.listen(0, '127.0.0.1');
    }
    const urls = await Promise.all(apps.map((app) => app.getUrl()));
    assert.equal(operations.length, 63);
    for (const { path, method, operation } of operations) {
      const index =
        operation['x-audience'] === 'public' ? 0 : operation.tags.includes('Gateway') ? 2 : 1;
      const route = path.replace(/\{([^}]+)\}/g, (_, name) =>
        name === 'revision' ? '1' : '00000000-0000-4000-8000-000000000001',
      );
      const headers = {
        'Idempotency-Key': '00000000-0000-4000-8000-000000000099',
        'If-Match': '"1"',
      };
      const request = { method: method.toUpperCase(), headers };
      if (operation.requestBody) {
        headers['Content-Type'] = 'application/json';
        request.body = '{}';
      }
      const response = await fetch(urls[index] + route, request);
      assert.equal(
        response.status,
        501,
        `${operation.operationId}: route is missing or accidentally implemented`,
      );
      assert.match(response.headers.get('content-type'), /application\/problem\+json/);
      const problem = await response.json();
      assert.equal(problem.code, 'NOT_IMPLEMENTED');
      assert.equal(problem.status, 501);
      assert.ok(problem.detail.includes(operation.operationId));
      assert.equal(response.headers.get('x-request-id'), problem.requestId);
      for (const other of [0, 1, 2].filter((i) => i !== index)) {
        const rejected = await fetch(urls[other] + route, request);
        assert.equal(
          rejected.status,
          404,
          `${operation.operationId} exposed by wrong app ${other}`,
        );
        await rejected.arrayBuffer();
      }
    }
  } finally {
    await Promise.all(apps.map((app) => app.close()));
  }
});

test('Worker assembles without HTTP, Docker, Redis or a runnable business workflow', async () => {
  const worker = await NestFactory.createApplicationContext(WorkspaceWorkerModule, {
    logger: false,
  });
  try {
    await assert.rejects(() => worker.get(WORKFLOW_RUNNER).execute({}, {}), /not implemented/);
  } finally {
    await worker.close();
  }
});
