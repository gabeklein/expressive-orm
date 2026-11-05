import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Connection } from './connection/Connection';

const COLLECT = Symbol.for("@expressive/orm.collect");

const USAGE = `Usage: expressive sql <check | sync [--force]> <entry>

  check    list what sync would change; exits 1 if anything would
  sync     create missing tables, columns and indexes
  --force  sync also rebuilds columns whose type or nullability drifted

<entry> is the module that creates your connections, imported without syncing them.`;

type Output = Pick<Console, "log" | "error">;

async function collect(entry: string){
  const found = new Set<Connection>();
  const scope = globalThis as { [COLLECT]?: Set<Connection> };

  scope[COLLECT] = found;

  try {
    await import(pathToFileURL(resolve(entry)).href);
  }
  finally {
    delete scope[COLLECT];
  }

  return found;
}

async function report(conn: Connection, problems: string[], force: boolean, out: Output){
  const remain = force || !problems.length ? undefined : new Set((await conn.plan(true)).problems);

  for (const problem of problems)
    out.log(`  ! ${problem}${remain && !remain.has(problem) ? " (sync --force rebuilds it)" : ""}`);
}

async function check(conn: Connection, out: Output){
  const { steps, problems } = await conn.plan();
  const current = !steps.length && !problems.length;

  out.log(`${conn.constructor.name}: ${current ? "up to date" : "out of date"}`);

  for (const step of steps)
    out.log(`  + ${step.action}`);

  await report(conn, problems, false, out);

  return current;
}

async function sync(conn: Connection, force: boolean, out: Output){
  const { steps, problems } = await conn.plan(force);

  if (problems.length) {
    out.log(`${conn.constructor.name}: not synced`);
    await report(conn, problems, force, out);

    return false;
  }

  await conn.sync(true, force);

  out.log(`${conn.constructor.name}: ${steps.length ? "synced" : "up to date"}`);

  for (const step of steps)
    out.log(`  + ${step.action}`);

  return true;
}

export default async function sql(args: string[], out: Output): Promise<number> {
  const [command, ...rest] = args;
  const force = rest.includes("--force");
  const [entry, ...extra] = rest.filter(arg => arg != "--force");
  const valid = command == "sync" || command == "check" && !force;

  if (!entry || extra.length || !valid) {
    out.error(USAGE);
    return 2;
  }

  const connections = await collect(entry);

  if (!connections.size) {
    out.error(`${entry} created no connection.`);
    return 1;
  }

  let ok = true;

  try {
    for (const conn of connections)
      if (typeof conn.plan != "function") {
        out.log(`${conn.constructor.name}: cannot plan a sync`);
        ok = false;
      }
      else
        ok = await (command == "check" ? check(conn, out) : sync(conn, force, out)) && ok;
  }
  finally {
    for (const conn of connections)
      await conn.close();
  }

  return ok ? 0 : 1;
}
