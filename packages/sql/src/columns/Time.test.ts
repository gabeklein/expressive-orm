import { describe, expect, it } from 'vitest';

import { date, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will create basic time columns", async () => {
    class TimeRecords extends Type {
      created = date();
      updated = date({ nullable: true });
      birthDate = date({ type: "date" });
      startTime = date({ type: "time" });
      timestamp = date({ type: "integer" });
    }

    expect<{ created: Date, updated: Date | undefined, birthDate: Date }>(undefined as unknown as TimeRecords);

    const { schema } = new TestConnection([ TimeRecords ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        time_records (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          created TEXT NOT NULL,
          updated TEXT,
          birth_date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );"
    `);
  });

  it("will map all datetime-related types to TEXT except integer", async () => {
    class DateTimeTypes extends Type {
      timestamp = date({ type: "timestamp" });
      datetime = date({ type: "datetime" });
      date = date({ type: "date" });
      time = date({ type: "time" });
      unixTime = date({ type: "integer" });
      custom = date({ type: "text" });
    }

    const { schema } = new TestConnection([ DateTimeTypes ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        date_time_types (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          datetime TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          unix_time INTEGER NOT NULL,
          custom TEXT NOT NULL
        );"
    `);
  });

  it("will default to the current timestamp", async () => {
    class Records extends Type {
      created = date({ fallback: "NOW" });
    }

    const { schema } = new TestConnection([ Records ]);

    expect(String(schema)).toContain("created TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");
  });
});

describe("serialization", () => {
  it("will serialize and deserialize timestamp values", () => {
    const field = column(() => date());
    const value = new Date("2023-01-15T14:30:45.123Z");

    expect(field.set(value)).toBe("2023-01-15T14:30:45.123Z");
    expect(field.set(undefined)).toBeUndefined();

    const retrieved = field.get("2023-01-15T14:30:45.123Z") as Date;

    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.toISOString()).toBe("2023-01-15T14:30:45.123Z");
    expect(field.get(null)).toBeUndefined();
  });

  it("will handle date type correctly", () => {
    const field = column(() => date({ type: "date" }));
    const value = new Date("2023-01-15T14:30:45.123Z");

    expect(field.set(value)).toBe("2023-01-15");

    const retrieved = field.get("2023-01-15") as Date;

    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.getFullYear()).toBe(2023);
    expect(retrieved.getMonth()).toBe(0);
    expect(retrieved.getDate()).toBe(15);
    expect(retrieved.getHours()).toBe(0);
    expect(retrieved.getMinutes()).toBe(0);
    expect(retrieved.getSeconds()).toBe(0);
  });

  it("will handle time type correctly", () => {
    const field = column(() => date({ type: "time" }));
    const value = new Date("2023-01-15T14:30:45.123Z");

    expect(field.set(value)).toBe("14:30:45");
    expect((field.get("14:30:45") as Date).toISOString()).toBe("1970-01-01T14:30:45.000Z");
  });

  it("will handle integer (Unix timestamp) type correctly", () => {
    const field = column(() => date({ type: "integer" }));
    const value = new Date("2023-01-15T14:30:45.000Z");
    const unix = Math.floor(value.getTime() / 1000);

    expect(field.set(value)).toBe(unix);

    const retrieved = field.get(unix) as Date;

    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.getTime()).toBe(unix * 1000);
  });

  it("will handle different input types correctly", () => {
    const field = column(() => date());
    const value = new Date();

    expect(field.get("2023-01-15 14:30:45")).toBeInstanceOf(Date);
    expect(field.get(1673795445)).toBeInstanceOf(Date);
    expect(field.get(value)).toEqual(value);
  });
});
