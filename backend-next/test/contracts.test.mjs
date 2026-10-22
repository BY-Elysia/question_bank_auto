import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const read = file => JSON.parse(fs.readFileSync(new URL(file, import.meta.url), 'utf8'));
const spec = read('../contracts/openapi.json');
const catalog = read('../contracts/catalog.json');
const examples = read('../contracts/examples.json');
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema({ $id: 'urn:question-bank:contracts', components: spec.components });
const validate = name => ajv.getSchema(`urn:question-bank:contracts#/components/schemas/${name}`);
const sample = name => structuredClone(examples.find(e => e.name === name).value);

test('Every schema compiles as JSON Schema 2020-12', () => {
  for (const name of Object.keys(spec.components.schemas)) assert.ok(validate(name), name);
});

for (const example of examples) {
  test(`Valid contract example: ${example.name}`, () => {
    const check = validate(example.schema);
    assert.equal(check(example.value), true, JSON.stringify(check.errors));
  });
}

test('Question variants reject ambiguous kinds and unknown fields', () => {
  const question = sample('创建教材文档').content.questions[0];
  question.kind = 'choice';
  assert.equal(validate('Question')(question), false);
  const document = sample('创建教材文档');
  document.content.questions[0].ownerId = 'attacker';
  assert.equal(validate('DocumentCreate')(document), false);
});

test('Generated answers cannot be mislabeled as source answers', () => {
  const output = sample('模型生成答案输出');
  output.answer.origin = 'source';
  assert.equal(validate('AnswerGenerateOutput')(output), false);
});

test('Completed skills require usable output; needs_input can carry null', () => {
  const output = sample('无法判断边界时返回补充输入');
  output.status = 'completed';
  assert.equal(validate('BoundaryDetectOutput')(output), false);
});

test('Job submission cannot select a filesystem path, owner or arbitrary tool', () => {
  for (const [key, value] of [['ownerId', 'other-user'], ['jsonFilePath', '/etc/passwd'], ['tool', 'shell.execute']]) {
    const job = sample('教材提取任务');
    job.request[key] = value;
    assert.equal(validate('JobCreate')(job), false, key);
  }
});

test('Workflow discriminator rejects incompatible payloads', () => {
  const job = sample('教材提取任务');
  job.request.kind = 'document-export';
  assert.equal(validate('JobCreate')(job), false);
  const unknown = sample('教材提取任务');
  unknown.request.kind = 'execute-script';
  assert.equal(validate('JobCreate')(unknown), false);
});

test('Model workflows require a pinned AI configuration revision', () => {
  const job = sample('教材提取任务');
  delete job.aiConfigurationRevision;
  assert.equal(validate('JobCreate')(job), false);
  assert.equal(validate('JobCreate')(sample('PDF 转图任务')), true);
});

test('Tool definitions are a closed allowlist with typed arguments', () => {
  const call = sample('受限题库搜索工具');
  call.toolId = 'shell.execute';
  assert.equal(validate('ToolCall')(call), false);
  call.toolId = 'library.search-questions';
  call.input.sql = 'SELECT * FROM users';
  assert.equal(validate('ToolCall')(call), false);
});

test('Secrets only enter write-only credential requests, never credential responses', () => {
  assert.equal(spec.components.schemas.CredentialCreate.properties.secret.writeOnly, true);
  assert.equal(spec.components.schemas.CredentialRotate.properties.secret.writeOnly, true);
  assert.equal(spec.components.schemas.Credential.properties.secret, undefined);
  const profile = spec.components.schemas.ModelProfileCreate;
  assert.equal(profile.properties.baseUrl, undefined);
  assert.equal(profile.properties.apiKey, undefined);
});

test('Public and workspace routes cannot accidentally share authentication', () => {
  const operationIds = new Set();
  for (const [path, methods] of Object.entries(spec.paths)) {
    for (const [method, op] of Object.entries(methods)) {
      const internal = path.startsWith('/internal/v1/');
      assert.deepEqual(op.security, [{ [internal ? 'WorkspaceBearer' : 'UserBearer']: [] }], op.operationId);
      assert.equal(op['x-audience'], internal ? 'workspace' : 'public');
      assert.equal(operationIds.has(op.operationId), false);
      operationIds.add(op.operationId);
      if (['post', 'put', 'patch', 'delete'].includes(method)) {
        assert.ok(op.parameters.some(p => p.$ref?.endsWith('/IdempotencyKey')), op.operationId);
      }
    }
  }
});

test('All existing-document mutations require explicit revision preconditions', () => {
  for (const id of ['replaceDocumentContent', 'restoreDocumentRevision', 'decideProposal']) {
    const op = Object.values(spec.paths).flatMap(Object.values).find(o => o.operationId === id);
    assert.ok(op.parameters.some(p => p.$ref?.endsWith('/IfMatch')), id);
    assert.ok(op.responses['412']);
    assert.ok(op.responses['428']);
  }
  for (const schema of ['TextbookExtractionRequest', 'ExamExtractionRequest', 'QuestionEditRequest', 'ExamComposeRequest']) {
    assert.ok(spec.components.schemas[schema].required.includes('baseRevision'), schema);
  }
});

test('Worker writes and model calls carry fencing context', () => {
  for (const schema of ['Heartbeat', 'StepCommit', 'JobComplete', 'ModelInvocationRequest', 'ToolExecutionRequest', 'ArtifactReadRequest']) {
    assert.ok(spec.components.schemas[schema].required.includes('lease'), schema);
  }
  assert.ok(spec.components.schemas.ArtifactUpload.required.includes('fencingToken'));
  assert.ok(spec.components.schemas.LeaseContext.required.includes('fencingToken'));
});

test('Core Skill and Tool catalogs resolve to declared schemas', () => {
  assert.equal(catalog.skills.length, 10);
  assert.equal(catalog.deferredSkills.length, 3);
  const toolIds = new Set(catalog.tools.map(t => t.id));
  for (const [items, schema] of [[catalog.skills, 'SkillDefinition'], [catalog.tools, 'ToolDefinition'], [catalog.workflows, 'WorkflowDefinition']]) {
    for (const item of items) {
      const check = validate(schema);
      assert.equal(check(item), true, JSON.stringify(check.errors));
      for (const key of ['inputSchemaRef', 'outputSchemaRef'].filter(k => k in item)) {
        const name = item[key].split('/').at(-1);
        assert.ok(spec.components.schemas[name], item[key]);
      }
    }
  }
  for (const skill of catalog.skills) {
    assert.ok(skill.allowedTools.every(id => toolIds.has(id)));
    if (skill.mode === 'single-call') assert.equal(skill.maxToolCalls, 0);
    for (const key of ['inputSchemaRef', 'outputSchemaRef']) {
      const schema = spec.components.schemas[skill[key].split('/').at(-1)];
      assert.deepEqual(schema.properties.kind.enum, [skill.id]);
    }
  }
});

test('SSE wire example parses as the typed event contract and declares replay expiry', () => {
  const op = spec.paths['/api/v1/jobs/{jobId}/events/stream'].get;
  const wire = op.responses['200'].content['text/event-stream'].example;
  const event = JSON.parse(wire.split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.equal(validate('JobEvent')(event), true);
  assert.ok(op.parameters.some(p => p.name === 'Last-Event-ID'));
  assert.ok(op.responses['410']);
});
