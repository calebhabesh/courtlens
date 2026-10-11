/* Audit authored JSX styles, including conditional objects and type assertions.
 * Motion's generated transform/opacity and Next's route announcer are runtime styles.
 */
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../dashboard/node_modules/typescript');
const assignments = [], nonCustomProperties = [], unresolved = [];

function audit(file) {
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declarations = new Map();
  function collect(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) declarations.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  }
  collect(source);
  function inspect(expr, row) {
    if (!expr) return;
    while (ts.isAsExpression(expr) || ts.isParenthesizedExpression(expr) || ts.isSatisfiesExpression(expr)) expr = expr.expression;
    if (expr.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(expr) && expr.text === 'undefined')) return;
    if (ts.isConditionalExpression(expr)) { inspect(expr.whenTrue, row); inspect(expr.whenFalse, row); return; }
    if (ts.isObjectLiteralExpression(expr)) {
      for (const property of expr.properties) {
        if (ts.isSpreadAssignment(property)) { inspect(property.expression, row); continue; }
        const key = property.name?.getText(source).replace(/^["']|["']$/g, '');
        row.properties.push(key);
        if (!key?.startsWith('--')) nonCustomProperties.push({ file, line: row.line, key });
      }
      return;
    }
    if (ts.isIdentifier(expr) && file.endsWith('/ui/skeleton.tsx') && ['customStyles', 'style'].includes(expr.text)) {
      row.allowlist.push(`${expr.text}: SkeletonStyle is Partial<Record<\`--\${string}\`, string | number>>`);
      return;
    }
    if (ts.isIdentifier(expr) && declarations.has(expr.text)) { inspect(declarations.get(expr.text), row); return; }
    if (ts.isCallExpression(expr) && expr.expression.getText(source) === 'teamStyle') {
      row.allowlist.push('teamStyle: lib/team-colors.ts returns only --team-color');
      return;
    }
    unresolved.push({ file, line: row.line, expression: expr.getText(source) });
  }
  function visit(node) {
    if (ts.isJsxAttribute(node) && node.name.getText(source) === 'style') {
      const row = { file, line: source.getLineAndCharacterOfPosition(node.pos).line + 1, properties: [], allowlist: [], expression: node.initializer?.getText(source) };
      inspect(node.initializer?.expression, row);
      assignments.push(row);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', 'e2e'].includes(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith('.tsx')) audit(file);
  }
}
walk('dashboard');
fs.writeFileSync('docs/evidence/fo14/verification/source-styles.json', JSON.stringify({ attributes: assignments.length, nonCustomProperties, unresolved, assignments }, null, 2) + '\n');
console.log({ attributes: assignments.length, nonCustomProperties: nonCustomProperties.length, unresolved: unresolved.length });
if (nonCustomProperties.length || unresolved.length) process.exitCode = 1;
