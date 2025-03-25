// packages/postgres/src/columns/Time.test.ts
import { Nullable, Time, Type } from '..';
import { PostgresConnection } from '../PostgresConnection';

describe("schema", () => {
  it("will create basic time columns", async () => {
    class TimeRecords extends Type {
      created = Time();
      updated = Time({ nullable: true });
      birthDate = Time({ type: "date" });
      startTime = Time({ type: "time" });
      duration = Time({ type: "interval" });
    }

    interface Signature {
      created: Time.Timestamp;
      updated: Time.Timestamp & Nullable;
      birthDate: Time.Date;
      startTime: Time.Time;
      duration: Time.Interval;
    }
    
    // type-error if expected types are not present
    expect<Signature>(undefined as unknown as TimeRecords);
  
    const { schema } = new PostgresConnection([ TimeRecords ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "time_records" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "created" TIMESTAMP NOT NULL,
          "updated" TIMESTAMP,
          "birth_date" DATE NOT NULL,
          "start_time" TIME NOT NULL,
          "duration" INTERVAL NOT NULL
        );
    `);
  });
  
  it("will create time columns with precision and timezone", async () => {
    class EventLog extends Type {
      timestamp = Time({ 
        type: "timestamp", 
        precision: 6, 
        timezone: true 
      });
      duration = Time({ 
        type: "interval", 
        precision: 3, 
        fields: "DAY TO SECOND" 
      });
      localTime = Time({ 
        type: "time", 
        precision: 3
      });
      utcTime = Time({ 
        type: "time", 
        precision: 3, 
        timezone: true 
      });
    }

    interface Signature {
      timestamp: Time.Timestamp;
      duration: Time.Interval;
      localTime: Time.Time;
      utcTime: Time.Time;
    }

    expect<Signature>(undefined as unknown as EventLog);
  
    const { schema } = new PostgresConnection([ EventLog ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "event_log" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "timestamp" TIMESTAMPTZ (6) NOT NULL,
          "duration" INTERVAL (3) DAY TO SECOND NOT NULL,
          "local_time" TIME(3) NOT NULL,
          "utc_time" TIMETZ (3) NOT NULL
        );
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize timestamp values", () => {
    const timestampField = Time() as Time.Timestamp;
    const date = new Date("2023-01-15T14:30:45.123Z");
    
    // Set should return the ISO string without the timezone part
    expect(timestampField.set(date)).toBe("2023-01-15 14:30:45");
    
    // Get should return a Date object
    const retrieved = timestampField.get("2023-01-15 14:30:45");
    expect(retrieved).toBeInstanceOf(Date);
    
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
  
  it("will validate timestamp with timezone", () => {
    const tzField = Time({ 
      type: "timestamp", 
      timezone: true 
    }) as Time.Timestamp;
    
    expect(tzField.datatype).toBe("timestamptz");
  });
  
  it("will validate interval fields", () => {
    const intervalField = Time({ 
      type: "interval", 
      fields: "HOUR TO MINUTE",
      precision: 2
    }) as Time.Interval;
    
    expect(intervalField.datatype).toBe("interval (2) HOUR TO MINUTE");
  });
});