import { describe, expect, it } from 'vitest';

import { bool, date, json, key, num, one, str, Type, type Field } from '@expressive/orm';

import { codecs } from './codecs';
import { TestConnection } from './sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

function codec(field: Field){
  return codecs.get(field.helper!)!;
}

function datatype(define: () => unknown){
  const field = column(define);
  return codec(field).datatype(field);
}

function encode(define: () => unknown, value: unknown){
  const field = column(define);
  return codec(field).encode(field, field.set(value));
}

function decode(define: () => unknown, value: unknown){
  const field = column(define);
  return codec(field).decode(field, value);
}

describe("datatype", () => {
  it("will render str", () => {
    expect(datatype(() => str())).toBe("text");
    expect(datatype(() => str({ type: "varchar", length: 40 }))).toBe("varchar(40)");
    expect(datatype(() => str({ type: "char", length: 3 }))).toBe("char(3)");
    expect(datatype(() => str({ type: "text", length: 3 }))).toBe("text");
    expect(datatype(() => str({ type: "text", collate: "C" }))).toBe('text COLLATE "C"');
    expect(datatype(() => str({ type: "uuid" }))).toBe("uuid");
  })

  it("will render num", () => {
    expect(datatype(() => num())).toBe("integer");
    expect(datatype(() => num({ type: "double" }))).toBe("double precision");
    expect(datatype(() => num({ type: "decimal", precision: 10, scale: 2 }))).toBe("decimal(10,2)");
    expect(datatype(() => num({ type: "numeric", precision: 4 } as const))).toBe("numeric(4)");
  })

  it("will render bool, date and json", () => {
    expect(datatype(() => bool())).toBe("boolean");
    expect(datatype(() => date())).toBe("timestamp");
    expect(datatype(() => date({ type: "timestamp", precision: 3 }))).toBe("timestamp(3)");
    expect(datatype(() => json())).toBe("text");
  })
})

describe("encode", () => {
  it("will store a Date as ISO 8601 text", () => {
    const at = new Date("2023-01-15T14:30:45.123Z");

    expect(encode(() => date(), at)).toBe("2023-01-15T14:30:45.123Z");
    expect(encode(() => date({ type: "date" }), at)).toBe("2023-01-15");
    expect(encode(() => date({ type: "time" }), at)).toBe("14:30:45");
  })

  it("will store JSON as text", () => {
    expect(encode(() => json(), { a: [1] })).toBe('{"a":[1]}');
  })

  it("will pass other values through", () => {
    expect(encode(() => str(), "a")).toBe("a");
    expect(encode(() => num(), 3)).toBe(3);
    expect(encode(() => bool(), false)).toBe(false);
  })
})

describe("decode", () => {
  it("will read timestamps", () => {
    expect((decode(() => date(), "2023-01-15T14:30:45.123Z") as Date).toISOString()).toBe("2023-01-15T14:30:45.123Z");
    expect((decode(() => date(), "2026-11-05 07:55:04") as Date).toISOString()).toBe("2026-11-05T07:55:04.000Z");
    expect((decode(() => date(), "2026-11-05 07:55:04.250") as Date).toISOString()).toBe("2026-11-05T07:55:04.250Z");
  })

  it("will return a calendar day as its text", () => {
    expect(decode(() => date({ type: "date" }), "2023-01-15")).toBe("2023-01-15");
    expect(decode(() => date({ type: "date" }), "2023-01-15T00:00:00")).toBe("2023-01-15");
    expect(decode(() => date({ type: "date" }), new Date(999, 0, 15))).toBe("0999-01-15");
  })

  it("will read a time on 1970-01-01", () => {
    expect((decode(() => date({ type: "time" }), "14:30:45") as Date).toISOString()).toBe("1970-01-01T14:30:45.000Z");
  })

  it("will read numbers from text", () => {
    expect(decode(() => num(), 3)).toBe(3);
    expect(decode(() => num({ type: "decimal", precision: 4, scale: 2 }), "1.50")).toBe(1.5);
  })

  it("will read booleans from integers", () => {
    expect(decode(() => bool(), 1)).toBe(true);
    expect(decode(() => bool(), 0)).toBe(false);
    expect(decode(() => bool(), true)).toBe(true);
  })

  it("will read JSON, and malformed text as undefined", () => {
    expect(decode(() => json(), '{"a":1}')).toEqual({ a: 1 });
    expect(decode(() => json(), "{")).toBeUndefined();
  })
})

describe("sqlite", () => {
  it("will render each type by its affinity", () => {
    class Parent extends Type {
      id = key({ type: "bigint" });
    }

    class Every extends Type {
      text = str();
      varchar = str({ type: "varchar", length: 8 });
      uuid = str({ type: "uuid" });
      int = num();
      small = num({ type: "smallint" });
      real = num({ type: "real" });
      double = num({ type: "double" });
      decimal = num({ type: "decimal", precision: 6, scale: 2 });
      flag = bool();
      at = date();
      day = date({ type: "date" });
      time = date({ type: "time" });
      data = json();
      parent = one(Parent);
    }

    const { schema } = TestConnection.new([Parent, Every]);

    expect(schema).toContain(`CREATE TABLE
  every (
    id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    text TEXT NOT NULL,
    varchar TEXT NOT NULL,
    uuid TEXT NOT NULL,
    int INTEGER NOT NULL,
    small INTEGER NOT NULL,
    real REAL NOT NULL,
    double REAL NOT NULL,
    decimal NUMERIC NOT NULL,
    flag INTEGER NOT NULL,
    at TEXT NOT NULL,
    day TEXT NOT NULL,
    time TEXT NOT NULL,
    data TEXT NOT NULL,
    parent_id INTEGER NOT NULL REFERENCES parent (id)
  );`);
  })

  it("will round trip plain values", async () => {
    class Event extends Type {
      at = date();
      day = date({ type: "date" });
      flag = bool();
      amount = num({ type: "decimal", precision: 6, scale: 2 });
      data = json<{ tags: string[] }>();
    }

    await TestConnection.new([Event]);

    const at = new Date(1793845205641);
    const row = { at, day: new Date(2026, 10, 10), flag: true, amount: 12.5, data: { tags: ["a"] } };
    const inserted = await Event.insert(row);

    expect(inserted).toEqual({ id: 1, ...row });
    expect(await Event.one(1)).toEqual({ id: 1, ...row });
    expect(await Event.count({ at })).toBe(1);
  })
})
