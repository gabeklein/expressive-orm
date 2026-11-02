import { describe, expect, it } from 'vitest';

import { Field, date, Type } from '@expressive/orm';

import { SchemaConnection } from '../tests/SchemaConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value") as Field<any>;
}

describe("schema", () => {
  it("will create basic time columns", async () => {
    class TimeRecords extends Type {
      created = date();
      updated = date({ nullable: true });
      birthDate = date({ type: "date" });
      startTime = date({ type: "time" });
      duration = date({ type: "interval" });
    }

    const { schema } = new SchemaConnection([ TimeRecords ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "time_records" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "created" TIMESTAMP NOT NULL,
          "updated" TIMESTAMP,
          "birth_date" DATE NOT NULL,
          "start_time" TIME NOT NULL,
          "duration" INTERVAL NOT NULL
        );"
    `);
  });

  it("will create time columns with precision and timezone", async () => {
    class EventLog extends Type {
      timestamp = date({
        type: "timestamp",
        precision: 6,
        timezone: true
      });
      duration = date({
        type: "interval",
        precision: 3,
        fields: "DAY TO SECOND"
      });
      localTime = date({
        type: "time",
        precision: 3
      });
      utcTime = date({
        type: "time",
        precision: 3,
        timezone: true
      });
    }

    const { schema } = new SchemaConnection([ EventLog ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "event_log" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "timestamp" TIMESTAMPTZ (6) NOT NULL,
          "duration" INTERVAL (3) DAY TO SECOND NOT NULL,
          "local_time" TIME(3) NOT NULL,
          "utc_time" TIMETZ (3) NOT NULL
        );"
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize timestamp values", () => {
    const timestampField = column(() => date());
    const value = new Date("2023-01-15T14:30:45.123Z");

    // Set should return the ISO string without the timezone part
    expect(timestampField.set(value)).toBe("2023-01-15 14:30:45");

    // Get should return a Date object
    const retrieved = timestampField.get("2023-01-15 14:30:45");
    expect(retrieved).toBeInstanceOf(Date);

  });

  it("will handle date type correctly", () => {
    const dateField = column(() => date({ type: "date" }));
    const value = new Date("2023-01-15T14:30:45.123Z");

    // Set should return just the date part
    expect(dateField.set(value)).toBe("2023-01-15");

    // Get should return a Date object with time set to midnight
    const retrieved = dateField.get("2023-01-15");
    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.getFullYear()).toBe(2023);
    expect(retrieved.getMonth()).toBe(0); // January is 0
    expect(retrieved.getDate()).toBe(15);
    expect(retrieved.getHours()).toBe(0);
    expect(retrieved.getMinutes()).toBe(0);
    expect(retrieved.getSeconds()).toBe(0);
  });

  it("will handle time type correctly", () => {
    const timeField = column(() => date({ type: "time" }));
    const value = new Date("2023-01-15T14:30:45.123Z");

    // Set should return just the time part
    expect(timeField.set(value)).toBe("14:30:45");

    // Get should return a Date object
    const retrieved = timeField.get("14:30:45");
    expect(retrieved).toBeInstanceOf(Date);
  });

  it("will validate timestamp with timezone", () => {
    const tzField = column(() => date({
      type: "timestamp",
      timezone: true
    }));

    expect(tzField.datatype).toBe("timestamptz");
  });

  it("will validate interval fields", () => {
    const intervalField = column(() => date({
      type: "interval",
      fields: "HOUR TO MINUTE",
      precision: 2
    }));

    expect(intervalField.datatype).toBe("interval (2) HOUR TO MINUTE");
  });
});
