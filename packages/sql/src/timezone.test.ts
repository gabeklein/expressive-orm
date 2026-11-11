import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { date, Type } from '@expressive/orm';

import { codecs } from './codecs';
import { SQLiteConnection } from './sqlite/SQLiteConnection';

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

  async function open(){
    class Event extends Type {
      day = date({ type: "date" });
      at = date();
      clock = date({ type: "time" }, null);
    }

    const conn = SQLiteConnection.new([Event]);

    await conn;

    const db = await conn["db"]();

    return { Event, conn, stored: () => db.all("SELECT day, at, clock FROM event ORDER BY id") };
  }

  it("will round trip a calendar day as its local date", async () => {
    const { Event, conn, stored } = await open();
    const day = new Date(2026, 0, 2);
    const late = new Date(2026, 0, 2, 23, 30);

    await Event.insert({ day, at: late });
    await Event.insert({ day: late, at: late });
    await Event.insert({ day: "2026-01-02", at: late });

    expect(await stored()).toEqual([
      { day: "2026-01-02", at: late.toISOString(), clock: null },
      { day: "2026-01-02", at: late.toISOString(), clock: null },
      { day: "2026-01-02", at: late.toISOString(), clock: null }
    ]);

    for (const row of await Event.find())
      expect(row.day).toEqual(day);

    expect(await Event.count({ day: "2026-01-02" })).toBe(3);
    expect(await Event.count({ day })).toBe(3);
    await conn.close();
  })

  it("will keep the local day of a Date a driver parsed", () => {
    class Event extends Type {
      day = date({ type: "date" });
    }

    const field = Event.fields.get("day")!;
    const codec = codecs.get(date)!;
    const day = new Date(2026, 0, 2);

    expect(codec.decode(field, day)).toEqual(day);
    expect(codec.decode(field, "2026-01-02T00:00:00")).toEqual(day);
    expect(codec.encode(field, field.set("2026-01-02"))).toBe("2026-01-02");
    expect(field.get("2026-01-02")).toEqual(day);
  })

  it("will round trip a time of day in UTC", async () => {
    const { Event, conn, stored } = await open();
    const clock = new Date("1970-01-01T14:30:45Z");

    await Event.insert({ day: new Date(2026, 0, 2), at: clock, clock });

    expect((await stored())[0].clock).toBe("14:30:45");
    expect((await Event.one(1)).clock).toEqual(clock);
    await conn.close();
  })
})
