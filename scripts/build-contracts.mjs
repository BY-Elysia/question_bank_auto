import fs from 'node:fs/promises';
import { z } from 'zod';
import { Book, Proposal } from '../dist/app/modules/textbooks/domain/book.js';
import { Document, Issue, Page } from '../dist/app/modules/textbooks/domain/content.js';
import { Job, JobRequest } from '../dist/app/modules/jobs/domain/job.js';
import * as requests from '../dist/app/modules/textbooks/presentation/contracts.js';
import { textbookRoutes } from '../dist/app/modules/textbooks/presentation/routes.js';
import { jobRoutes } from '../dist/app/modules/jobs/presentation/routes.js';
const schemas = {
  Book,
  Job,
  JobRequest,
  ...requests,
  BookList: z.array(
    Book.pick({ id: true, title: true, revision: true, updatedAt: true }).extend({
      pageCount: z.number().int(),
    }),
  ),
  DocumentResponse: z.object({ revision: z.number().int(), document: Document }),
  ProposalList: z.array(Proposal),
  JobList: z.array(Job.omit({ stage: true })),
  Validation: z.object({ issues: z.array(Issue) }),
  Revisions: z.array(z.object({ revision: z.number().int() })),
  Health: z.object({
    status: z.literal('ok'),
    mode: z.literal('single-workspace'),
    modelConfigured: z.boolean(),
  }),
  ExportDocument: Document.extend({
    schemaVersion: z.literal('1.0'),
    id: z.string(),
    title: z.string(),
    revision: z.number().int(),
    pages: z.array(Page.extend({ image: z.string() })),
    validation: z.array(Issue),
    reviewIssues: z.array(Issue),
    pendingProposalCount: z.number().int(),
  }),
};
const components = { schemas: {} };
for (const [name, schema] of Object.entries(schemas)) {
  const json = z.toJSONSchema(schema);
  delete json.$schema;
  components.schemas[name] = json;
}
const binaries = { PDF: 'application/pdf', PNG: 'image/png', ZIP: 'application/zip' };
function content(name) {
  return binaries[name]
    ? { [binaries[name]]: { schema: { type: 'string', format: 'binary' } } }
    : { 'application/json': { schema: { $ref: `#/components/schemas/${name}` } } };
}
const paths = {};
for (const [method, path, operationId, input, output, status] of [
  ...textbookRoutes,
  ...jobRoutes,
  ['get', '/api/health', 'health', null, 'Health', 200],
]) {
  const parameters = [...path.matchAll(/\{([^}]+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: name === 'page' ? { type: 'integer', minimum: 1 } : { type: 'string' },
  }));
  if (operationId === 'uploadTextbook')
    parameters.push({
      name: 'title',
      in: 'query',
      required: true,
      schema: { type: 'string', minLength: 1, maxLength: 300 },
    });
  (paths[path] ??= {})[method] = {
    operationId,
    summary: operationId,
    parameters,
    security: [],
    ...(input ? { requestBody: { required: true, content: content(input) } } : {}),
    responses: {
      [status]: { description: 'Success', ...(output ? { content: content(output) } : {}) },
      400: { description: 'Invalid request' },
      404: { description: 'Not found' },
      409: { description: 'Revision conflict or active task' },
      500: { description: 'Operation failed' },
    },
  };
}
await fs.mkdir('dist/contracts', { recursive: true });
await fs.writeFile(
  'dist/contracts/openapi.json',
  JSON.stringify(
    {
      openapi: '3.1.0',
      info: {
        title: 'Textbook workspace backend',
        version: '0.3.0',
        description:
          'Single-workspace backend, no user authentication. Model-backed work runs as resumable jobs.',
      },
      servers: [{ url: 'http://127.0.0.1:5002' }],
      paths,
      components,
    },
    null,
    2,
  ),
);
const catalog = [];
for (const entry of await fs.readdir('src/ai/skills', { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const source = `src/ai/skills/${entry.name}`,
    target = `dist/app/ai/skills/${entry.name}`;
  const definition = JSON.parse(await fs.readFile(`${source}/definition.json`, 'utf8'));
  const markdown = await fs.readFile(`${source}/SKILL.md`, 'utf8');
  if (!markdown.includes(`name: ${definition.id}\n`))
    throw new Error(`Missing/mismatched Skill: ${entry.name}`);
  await fs.mkdir(target, { recursive: true });
  for (const file of ['SKILL.md', 'definition.json'])
    await fs.copyFile(`${source}/${file}`, `${target}/${file}`);
  catalog.push(definition);
}
await fs.writeFile('dist/contracts/skills.json', JSON.stringify(catalog, null, 2));
console.log(
  `Built ${Object.values(paths).reduce((n, p) => n + Object.keys(p).length, 0)} endpoints and ${catalog.length} Skill packages.`,
);
