import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
const root = path.resolve('client/src');
async function sources(directory = root) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? sources(path.join(directory, entry.name))
          : /\.tsx?$/.test(entry.name)
            ? [path.join(directory, entry.name)]
            : [],
      ),
    )
  ).flat();
}
test('Frontend presentation cannot access transport or feature API implementations', async () => {
  for (const file of await sources()) {
    if (!file.endsWith('.tsx')) continue;
    const source = await fs.readFile(file, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node) => {
      if (ts.isImportDeclaration(node)) {
        const target = node.moduleSpecifier.text;
        assert.ok(!/\/api(?:\/|$)/.test(target), `${file} imports API ${target}`);
      }
      if (ts.isCallExpression(node)) {
        assert.ok(
          !/^(?:fetch|request|write|useResource|useAction)$/.test(node.expression.getText(tree)),
          `${file} owns a network operation`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
});
test('Frontend model and transport layers cannot depend on React views or backend implementations', async () => {
  for (const file of await sources()) {
    const source = await fs.readFile(file, 'utf8');
    const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    for (const node of tree.statements) {
      if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
      const target = node.moduleSpecifier?.text;
      if (!target) continue;
      if (target.includes('/src/modules/')) {
        assert.equal(file, path.join(root, 'shared/contracts.ts'));
        assert.ok(
          ts.isImportDeclaration(node) ? node.importClause?.isTypeOnly : node.isTypeOnly,
          'Backend contracts must be type-only',
        );
      }
      if (file.includes('/model/') || file.includes('/api/'))
        assert.ok(
          !/(?:^react(?:\/|$)|\/components(?:\/|$)|\/hooks(?:\/|$))/.test(target),
          `${file} depends on presentation ${target}`,
        );
      if (file.includes('/model/'))
        assert.ok(!/\/api(?:\/|$)/.test(target), `${file} depends on transport`);
      if (file.includes('/shared/'))
        assert.ok(!/^@\/(?:features|app)\//.test(target), `${file} depends on a business module`);
    }
  }
});
