import { Entities } from "@expressive/sql";
import { SQLite } from "../Connection";

export function random(min: number, max: number) {
  const u = Math.max(min, max);
  const l = Math.min(min, max);
  const diff = u - l;
  const r = Math.floor(Math.random() * (diff + 1));
  return l + r;
}

const gc = new Set<Function>();

export async function database(entities: Entities){
  const db = new SQLite({ filename: ":memory:" });

  await db.attach(entities);
  gc.add(() => db.close());

  return db;
}

afterEach(async () => {
  await Promise.all(Array.from(gc).map(fn => {
    gc.delete(fn);
    return fn();
  }));
});

export function bootstrap(entities: Entities){
  const db = new SQLite({ filename: ":memory:" });

  beforeAll(async () => {
    await db.attach(entities);
  })

  afterAll(async () => {
    await db.close();
  })

  return db;
}