import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import openapiTS, { astToString } from 'openapi-typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = async (file) => JSON.parse(await fs.readFile(path.join(root, file), 'utf8'));
async function files(dir) {
  const entries = await fs.readdir(path.join(root, dir), { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((e) => (e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`])),
    )
  )
    .flat()
    .sort();
}
const spec = await read('contracts/api.json');
spec.paths = {};
spec.components = { schemas: {} };
for (const file of await files('contracts/common')) {
  spec.components[path.basename(file, '.json')] = await read(file);
}
const catalog = { schemaVersion: '1.0', skills: [], tools: [], workflows: [] };
const typeFiles = {};
const operations = new Set();
for (const file of await files('src')) {
  if (!file.endsWith('.json')) continue;
  const data = await read(file);
  if (file.includes('/contracts/schemas/')) {
    if (spec.components.schemas[data.name]) throw new Error(`Duplicate schema: ${data.name}`);
    spec.components.schemas[data.name] = data.schema;
    typeFiles[data.name] = data.typeFile;
  } else if (file.includes('/contracts/operations/')) {
    if (operations.has(data.operation.operationId) || spec.paths[data.path]?.[data.method]) {
      throw new Error(`Duplicate operation: ${file}`);
    }
    operations.add(data.operation.operationId);
    (spec.paths[data.path] ??= {})[data.method] = data.operation;
  } else if (file.endsWith('/definition.json')) {
    const category = file.split('/')[2];
    if (!(category in catalog)) throw new Error(`Unknown catalog: ${file}`);
    if (catalog[category].some((item) => item.id === data.id))
      throw new Error(`Duplicate definition: ${file}`);
    catalog[category].push(data);
  }
}
catalog.deferredSkills = await read('contracts/deferred-skills.json');
await fs.mkdir(path.join(root, 'dist/contracts'), { recursive: true });
const emit = (name, data) =>
  fs.writeFile(path.join(root, `dist/contracts/${name}`), JSON.stringify(data, null, 2) + '\n');
await emit('openapi.json', spec);
await emit('catalog.json', catalog);
await emit('type-files.json', typeFiles);
await fs.writeFile(path.join(root, 'dist/contracts/api.d.ts'), astToString(await openapiTS(spec)));

// Verify source DTOs against generated wire types in both directions during tsc.
// Generated declarations and these assertions stay outside the source tree.
const assertions = [
  "import type { components } from './api.js';",
  'type Assert<T extends true> = T;',
  'type Compatible<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;',
];
for (const [name, file] of Object.entries(typeFiles).sort()) {
  assertions.push(`import type { ${name} } from '../../${file.replace(/\.ts$/, '.js')}';`);
  assertions.push(
    `type Check${name} = Assert<Compatible<${name}, components['schemas']['${name}']>>;`,
  );
}
await fs.writeFile(
  path.join(root, 'dist/contracts/type-compatibility.ts'),
  assertions.join('\n') + '\n',
);
console.log(
  `Bundled ${operations.size} operations, ${Object.keys(typeFiles).length} schemas into dist/contracts.`,
);
