import { pathToFileURL } from 'node:url';

import { arg, cmd, flag } from '@expressive/cli';
import { Model } from '@expressive/mvc';

import type { Connection } from './connection/Connection';

const COLLECT = Symbol.for("@expressive/orm.collect");

async function collect(entry: string){
  const found = new Set<Connection>();
  const scope = globalThis as { [COLLECT]?: Set<Connection> };

  scope[COLLECT] = found;

  try {
    await import(pathToFileURL(entry).href);
  }
  catch (error) {
    throw new Error(`Could not import ${entry}: ${(error as Error).message}`);
  }
  finally {
    delete scope[COLLECT];
  }

  if (!found.size)
    throw new Error(`${entry} created no connection.`);

  return found;
}

async function report(conn: Connection, problems: string[], force: boolean){
  const remain = force || !problems.length ? undefined : new Set((await conn.plan(true)).problems);

  for (const problem of problems)
    console.log(`  ! ${problem}${remain && !remain.has(problem) ? " (sync --force rebuilds it)" : ""}`);
}

abstract class Schema extends Model {
  entry = arg({
    type: "file",
    exists: true,
    required: true,
    help: "module that creates your connections, imported without syncing them"
  });

  abstract apply(conn: Connection): Promise<boolean>;

  async run(){
    const connections = await collect(this.entry);
    let ok = true;

    try {
      for (const conn of connections)
        if (typeof conn.plan != "function") {
          console.log(`${conn.constructor.name}: cannot plan a sync`);
          ok = false;
        }
        else
          ok = await this.apply(conn) && ok;
    }
    finally {
      for (const conn of connections)
        await conn.close();
    }

    return ok;
  }
}

class Check extends Schema {
  async apply(conn: Connection){
    const { steps, problems } = await conn.plan();
    const current = !steps.length && !problems.length;

    console.log(`${conn.constructor.name}: ${current ? "up to date" : "out of date"}`);

    for (const step of steps)
      console.log(`  + ${step.action}`);

    await report(conn, problems, false);

    return current;
  }
}

class Sync extends Schema {
  force = flag({ short: "f", help: "also rebuild columns whose type or nullability drifted" });

  async apply(conn: Connection){
    const { force } = this;
    const { steps, problems } = await conn.plan(force);

    if (problems.length) {
      console.log(`${conn.constructor.name}: not synced`);
      await report(conn, problems, force);

      return false;
    }

    await conn.sync(true, force);

    console.log(`${conn.constructor.name}: ${steps.length ? "synced" : "up to date"}`);

    for (const step of steps)
      console.log(`  + ${step.action}`);

    return true;
  }
}

export default class Sql extends Model {
  check = cmd({ from: Check, help: "list what sync would change; exits 1 if anything would" });
  sync = cmd({ from: Sync, help: "create missing tables, columns and indexes" });
}
