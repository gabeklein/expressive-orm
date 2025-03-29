// packages/sqlite/src/columns/Time.test.ts
import { Nullable, Table, Time } from '..';
import { TestConnection } from '../TestConnection';

describe("schema", () => {
  it("will create basic time columns", async () => {
    class TimeRecords extends Table {
      created = Time();
      updated = Time({ nullable: true });
      birthDate = Time({ type: "date" });
      startTime = Time({ type: "time" });
      timestamp = Time({ type: "integer" }); // Unix timestamp
    }

    interface Signature {
      created: Time.Timestamp;
      updated: Time.Timestamp & Nullable;
      birthDate: Time.Date;
      startTime: Time.Time;
      timestamp: Time.Integer;
    }
    
    // type-error if expected types are not present
    expect<Signature>(undefined as unknown as TimeRecords);
  
    const { schema } = new TestConnection([ TimeRecords ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        time_records (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          created TEXT NOT NULL,
          updated TEXT,
          birth_date TEXT NOT NULL,
          start_time TEXT NOT NULL,
          timestamp INTEGER NOT NULL
        );
    `);
  });
  
  it("will map all datetime-related types to TEXT except integer", async () => {
    class DateTimeTypes extends Table {
      timestamp = Time({ type: "timestamp" });
      datetime = Time({ type: "datetime" });
      date = Time({ type: "date" });
      time = Time({ type: "time" });
      unixTime = Time({ type: "integer" });
      custom = Time({ type: "text" });
    }
  
    const { schema } = new TestConnection([ DateTimeTypes ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        date_time_types (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          timestamp TEXT NOT NULL,
          datetime TEXT NOT NULL,
          date TEXT NOT NULL,
          time TEXT NOT NULL,
          unix_time INTEGER NOT NULL,
          custom TEXT NOT NULL
        );
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize timestamp values", () => {
    const timestampField = Time() as Time.Timestamp;
    const date = new Date("2023-01-15T14:30:45.123Z");
    
    // Set should store full ISO string
    expect(timestampField.set(date)).toBe("2023-01-15T14:30:45.123Z");
    
    // Get should return a Date object
    const retrieved = timestampField.get("2023-01-15T14:30:45.123Z");
    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.toISOString()).toBe("2023-01-15T14:30:45.123Z");
    
    // Using NOW should return CURRENT_TIMESTAMP
    expect(timestampField.set("NOW")).toBe("CURRENT_TIMESTAMP");
  });
  
  it("will handle date type correctly", () => {
    const dateField = Time({ type: "date" }) as Time.Date;
    const date = new Date("2023-01-15T14:30:45.123Z");
    
    // Set should return just the date part
    expect(dateField.set(date)).toBe("2023-01-15");
    
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
    const timeField = Time({ type: "time" }) as Time.Time;
    const date = new Date("2023-01-15T14:30:45.123Z");
    
    // Set should return just the time part
    expect(timeField.set(date)).toBe("14:30:45");
    
    // Get should return a Date object
    const retrieved = timeField.get("14:30:45");
    expect(retrieved).toBeInstanceOf(Date);
  });
  
  it("will handle integer (Unix timestamp) type correctly", () => {
    const intField = Time({ type: "integer" }) as Time.Integer;
    const date = new Date("2023-01-15T14:30:45.000Z");
    const unixTimestamp = Math.floor(date.getTime() / 1000);
    
    // Set should return Unix timestamp (seconds since epoch)
    expect(intField.set(date)).toBe(unixTimestamp);
    
    // Get should convert Unix timestamp to Date
    const retrieved = intField.get(unixTimestamp);
    expect(retrieved).toBeInstanceOf(Date);
    expect(retrieved.getTime()).toBe(unixTimestamp * 1000);
  });
  
  it("will handle different input types correctly", () => {
    const field = Time();
    
    // String input
    expect(field.get("2023-01-15 14:30:45")).toBeInstanceOf(Date);
    
    // Number input (Unix timestamp)
    const timestamp = 1673795445; // 2023-01-15T14:30:45Z
    expect(field.get(timestamp)).toBeInstanceOf(Date);
    
    // Date input
    const date = new Date();
    expect(field.get(date)).toBe(date);
  });
});