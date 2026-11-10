import { Glob } from 'bun';
import ts from 'typescript';

const problems: string[] = [];
let files = 0;

for await (const path of new Glob('packages/*/dist/**/*.d.{ts,mts,cts}').scan('.')) {
  const text = await Bun.file(path).text();
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const attached = new Set<number>();

  const visit = (node: ts.Node) => {
    for (const doc of (node as { jsDoc?: ts.JSDoc[] }).jsDoc ?? [])
      attached.add(doc.getStart(source));

    ts.forEachChild(node, visit);
  };

  visit(source);
  files++;

  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.Standard, text);

  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan())
    if (token === ts.SyntaxKind.MultiLineCommentTrivia && scanner.getTokenText().startsWith('/**') && !attached.has(scanner.getTokenStart())) {
      const { line } = source.getLineAndCharacterOfPosition(scanner.getTokenStart());
      const first = scanner.getTokenText().split('\n')[0].slice(0, 80);

      problems.push(`${path}:${line + 1}  ${first} - not attached to any declaration, so it does not show on hover`);
    }
}

if (!files)
  problems.push('no built .d.ts found under packages/*/dist - run the build first');

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`JSDoc attaches in ${files} .d.ts files`);
