import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const name = path.join(dir, entry.name);
    return entry.isDirectory() ? files(name) : [name];
  });
}

test('Source remains modular and contains no bundled OpenAPI or giant generated types', () => {
  assert.equal(fs.existsSync('src/contracts/api.d.ts'), false);
  assert.equal(fs.existsSync('contracts/openapi.json'), false);
  for (const file of [...files('src'), ...files('contracts')]) {
    if (!/\.(ts|json)$/.test(file)) continue;
    const lines = fs.readFileSync(file, 'utf8').split('\n').length;
    assert.ok(lines <= 400, `${file}: ${lines} lines; split by responsibility`);
  }
});

test('Domain, ports and application interfaces cannot depend on controllers or Nest', () => {
  for (const file of files('src')) {
    if (!file.endsWith('.ts')) continue;
    const code = fs.readFileSync(file, 'utf8');
    if (file.includes('/domain/') || file.includes('/ports/') || file.includes('/application/')) {
      assert.doesNotMatch(code, /from ['"]@nestjs\//, file);
      assert.doesNotMatch(code, /from ['"][^'"]*presentation\//, file);
      assert.doesNotMatch(code, /from ['"][^'"]*infrastructure\//, file);
    }
    if (file.startsWith('src/shared/')) {
      assert.doesNotMatch(code, /from ['"][^'"]*(?:modules|ai)\//, file);
    }
    assert.doesNotMatch(code, /from ['"][^'"]*dist\//, file);
  }
});
