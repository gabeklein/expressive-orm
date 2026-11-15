import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { build } from 'rolldown';

const root = resolve('packages/postgres');

const NAMES = 'Type, str, Remote';
const FORBIDDEN = /sql-formatter|keywordCase|PRAGMA|SQLiteConnection|LISTEN/;

const PROBE = `
import { Memory, one, Query, Remote, SQLiteConnection, Type, date, num, sql, str } from '@expressive/postgres';

const out = {};

function entities(){
  class Author extends Type {
    name = str(sql.varchar(40));
  }

  class Post extends Type {
    author = one(Author);
    title = str();
    views = num({ fallback: 0 });
    at = date.created();
  }

  return { Author, Post };
}

const server = entities();
const db = await SQLiteConnection.new(server, ":memory:");
const { id } = await server.Author.insert({ name: "Gabe" });

await server.Post.insert({ author: id, title: "Hello" });

out.schema = db.schema;
out.rows = (await server.Post.query()).map(({ at, ...row }) => [row, at instanceof Date]);
out.query = await Query(where => {
  const post = where(server.Post);

  where(post.author.name).equal("Gabe");

  return { title: post.title, by: post.author.name };
});

const client = entities();
const serve = Remote.handle(db, { expose: { Author: ["name"], Post: ["author", "title", "views"] } });

Remote.new(client, request => serve(request));

out.remote = await client.Post.query();
out.related = (await (await client.Post.get(1)).author).name;
out.invalid = await client.Author.insert({ name: "x".repeat(41) }).catch(error => [error.constructor.name, error.code]);

const memory = entities();

Memory.new(memory);
await memory.Author.insert({ name: "Ann" });
out.memory = await memory.Author.query();

console.log(JSON.stringify(out));
`;

async function bundle(code: string, options: { treeshake?: boolean, platform?: 'browser' | 'node' } = {}){
  const result = await build({
    cwd: root,
    input: 'probe',
    platform: options.platform ?? 'browser',
    treeshake: options.treeshake ?? true,
    write: false,
    logLevel: 'silent',
    external: [/^node:/, /^bun:/, 'pg', '@electric-sql/pglite', 'better-sqlite3', 'sqlite3', '@libsql/client'],
    output: { format: 'esm', minify: true, codeSplitting: false },
    plugins: [{
      name: 'probe',
      resolveId: (id: string) => id === 'probe' ? '\0probe' : undefined,
      load: (id: string) => id === '\0probe' ? code : undefined
    }]
  });

  return result.output.map(chunk => 'code' in chunk ? chunk.code : '').join('');
}

async function run(code: string){
  const dir = mkdtempSync(join(tmpdir(), 'bundle-check-'));
  const file = join(dir, 'probe.mjs');

  try {
    writeFileSync(file, code);

    const proc = Bun.spawn([process.execPath, file], { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, status] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);

    if (status)
      throw new Error(stderr.trim().split('\n').filter(line => line.trim()).slice(-4).join('\n') || `exited ${status}`);

    return stdout.trim();
  }
  finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const problems: string[] = [];
const entry = (from: string) => `export { ${NAMES} } from '${from}';`;
const baseline = await bundle(entry('@expressive/orm'));

for (const from of ['@expressive/sql', '@expressive/postgres']) {
  const code = await bundle(entry(from));

  if (FORBIDDEN.test(code))
    problems.push(`${from}: bundling { ${NAMES} } pulls in ${code.match(FORBIDDEN)![0]}`);

  if (code.length !== baseline.length)
    problems.push(`${from}: { ${NAMES} } bundles to ${code.length} bytes, @expressive/orm to ${baseline.length}`);
}

const [whole, shaken] = await Promise.all([
  bundle(PROBE, { platform: 'node', treeshake: false }).then(run),
  bundle(PROBE, { platform: 'node' }).then(run)
]);

if (whole !== shaken)
  problems.push(`a tree-shaken bundle behaves differently from the whole packages:\n  whole:  ${whole}\n  shaken: ${shaken}`);

if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}

console.log(`{ ${NAMES} } bundles to ${baseline.length} bytes from orm, sql and postgres; a tree-shaken app behaves as the whole packages do`);
