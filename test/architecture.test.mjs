import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
function files(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => (e.isDirectory() ? files(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}
test('Source stays modular and application/domain code does not import infrastructure or Nest', () => {
  for (const file of files('src').filter((f) => f.endsWith('.ts'))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.split('\n').length <= 400, `${file} exceeds 400 lines`);
    if (/\/(application|domain|ports)\//.test(file)) {
      assert.doesNotMatch(text, /from ['"][^'"]*infrastructure\//, file);
      assert.doesNotMatch(text, /from ['"]@nestjs\//, file);
      assert.doesNotMatch(text, /from ['"](?:node:(?:fs|path)|express|archiver)(?:[/'"])/, file);
    }
    if (/\/domain\//.test(file))
      assert.doesNotMatch(text, /from ['"][^'"]*(?:application|presentation|ai)\//, file);
    if (/\/presentation\//.test(file))
      assert.doesNotMatch(text, /from ['"][^'"]*infrastructure\//, file);
    if (/\/ai\/(runtime|workflows)\//.test(file))
      assert.doesNotMatch(
        text,
        /from ['"](?:node:(?:fs|path)|[^'"]*(?:infrastructure|providers)\/)/,
        file,
      );
    if (file.endsWith('jobs.service.ts'))
      assert.doesNotMatch(text, /from ['"][^'"]*(?:workflows\/|review-workflow)/, file);
    assert.doesNotMatch(text, /from ['"][^'"]*dist\//, file);
  }
});
test('Only textbook capabilities remain and built Skill packages include actual instructions', () => {
  const catalog = JSON.parse(fs.readFileSync('dist/contracts/skills.json', 'utf8'));
  assert.equal(catalog.length, 6);
  for (const skill of catalog) {
    const source = fs.readFileSync(`src/ai/skills/${skill.id}/SKILL.md`, 'utf8');
    assert.equal(fs.readFileSync(`dist/app/ai/skills/${skill.id}/SKILL.md`, 'utf8'), source);
  }
  for (const module of ['identity', 'library', 'model-config'])
    assert.equal(fs.existsSync(`src/modules/${module}`), false);
  const spec = JSON.parse(fs.readFileSync('dist/contracts/openapi.json', 'utf8'));
  assert.equal(
    Object.values(spec.paths).reduce((n, p) => n + Object.keys(p).length, 0),
    30,
  );
  assert.ok(!JSON.stringify(spec.paths).includes('exam-compose'));
});

test('Frontend stays split into typed API, UI components and bounded feature files', () => {
  for (const file of files('client/src').filter((f) => /\.tsx?$/.test(f))) {
    const text = fs.readFileSync(file, 'utf8');
    assert.ok(text.split('\n').length <= 400, `${file} exceeds 400 lines`);
    assert.doesNotMatch(text, /from ['"](?:node:|@nestjs)/, file);
    if (file.includes('/components/')) assert.doesNotMatch(text, /from ['"]@\/features\//, file);
  }
});
