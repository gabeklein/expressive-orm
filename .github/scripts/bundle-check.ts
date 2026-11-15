import { resolve } from 'node:path';

const root = resolve('packages/postgres');
const { build } = await import(Bun.resolveSync('rolldown', Bun.resolveSync('tsdown', root)));

const NAMES = 'Type, str, Remote';
const FORBIDDEN = /sql-formatter|keywordCase|PRAGMA|SQLiteConnection|LISTEN/;

async function bundle(from: string){
  const result = await build({
    cwd: root,
    input: 'probe',
    platform: 'browser',
    write: false,
    logLevel: 'silent',
    output: { format: 'esm', minify: true },
    plugins: [{
      name: 'probe',
      resolveId: (id: string) => id === 'probe' ? '\0probe' : undefined,
      load: (id: string) => id === '\0probe' ? `export { ${NAMES} } from '${from}';` : undefined
    }]
  });

  return result.output.map((chunk: { code?: string }) => chunk.code ?? '').join('');
}

const problems: string[] = [];
const baseline = await bundle('@expressive/orm');

for (const from of ['@expressive/sql', '@expressive/postgres']) {
  const code = await bundle(from);

  if (FORBIDDEN.test(code))
    problems.push(`${from}: bundling { ${NAMES} } pulls in ${code.match(FORBIDDEN)![0]} - a module it reaches has side effects`);

  if (code.length !== baseline.length)
    problems.push(`${from}: { ${NAMES} } bundles to ${code.length} bytes, @expressive/orm to ${baseline.length}`);
}

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`{ ${NAMES} } bundles to ${baseline.length} bytes from orm, sql and postgres`);
