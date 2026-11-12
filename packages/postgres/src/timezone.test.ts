import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { date, Type } from '@expressive/orm';

import { PGLiteConnection } from './PGLiteConnection';

describe.each(["Asia/Tokyo", "America/Los_Angeles", "UTC"])("in %s", zone => {
  const before = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = zone;
  });

  afterAll(() => {
    if (before === undefined)
      delete process.env.TZ;
    else
      process.env.TZ = before;
  });

  it("will round trip a calendar day and a timestamp", async () => {
    class Event extends Type {
      day = date({ type: "date" });
      at = date();
      zoned = date({ timezone: true });
      clock = date({ type: "time" });
    }

    const pg = new PGlite();
    const conn = await PGLiteConnection.new([Event], pg);
    const day = new Date(2026, 0, 2);
    const late = new Date(2026, 0, 2, 23, 30, 0, 123);
    const clock = new Date("1970-01-01T14:30:45Z");

    await Event.insert({ day: late, at: late, zoned: late, clock });
    await Event.insert({ day: "2026-01-02", at: late, zoned: late, clock });

    const { rows } = await pg.query<Record<string, string>>(
      `SELECT day::text, at::text, clock::text FROM event ORDER BY id`
    );

    expect(rows[0]).toEqual({
      day: "2026-01-02",
      at: late.toISOString().slice(0, 23).replace("T", " "),
      clock: "14:30:45"
    });

    for (const row of await Event.query())
      expect(row).toMatchObject({ day, at: late, zoned: late, clock });

    expect(await Event.count({ day })).toBe(2);
    await conn.close();
  })
})
