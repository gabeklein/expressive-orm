import { describe, expect, it } from 'vitest';

import { bool, Type } from '@expressive/orm';

import { TestConnection } from '../TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will create basic boolean columns", async () => {
    class Flags extends Type {
      active = bool();
      optional = bool({ nullable: true });
      custom = bool({
        type: "text",
        either: ["YES", "NO"]
      });
    }

    expect<{ active: boolean, optional: boolean | undefined, custom: boolean }>(undefined as unknown as Flags);

    const { schema } = new TestConnection([ Flags ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        flags (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          active INTEGER NOT NULL,
          optional INTEGER,
          custom TEXT NOT NULL
        );"
    `);
  });

  it("will handle either values correctly", async () => {
    class Settings extends Type {
      enabled = bool({
        type: "text",
        either: ["TRUE", "FALSE"]
      });
      consent = bool({
        type: "text",
        either: ["ACCEPTED", "DECLINED"],
        nullable: true
      });
    }

    const { schema } = new TestConnection([ Settings ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        settings (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          enabled TEXT NOT NULL,
          consent TEXT
        );"
    `);
  });

  it("will reject an unknown type", () => {
    // @ts-expect-error
    column(() => bool({ type: "blob" }));
  });
});

describe("serialization", () => {
  it("will serialize and deserialize integer boolean values", () => {
    const field = column(() => bool());

    expect(field.set(true)).toBe(1);
    expect(field.set(false)).toBe(0);

    expect(field.get(1)).toBe(true);
    expect(field.get(0)).toBe(false);
    expect(field.get(true)).toBe(true);
    expect(field.get(false)).toBe(false);
  });

  it("will handle custom either values", () => {
    const field = column(() => bool({
      type: "text",
      either: ["YES", "NO"]
    }));

    expect(field.set(true)).toBe("YES");
    expect(field.set(false)).toBe("NO");

    expect(field.get("YES")).toBe(true);
    expect(field.get("NO")).toBe(false);
    expect(field.get("MAYBE")).toBe(false);
  });

  it("will ensure correct datatype based on field type", () => {
    expect(column(() => bool()).datatype).toBe("integer");
    expect(column(() => bool({ type: "text", either: ["YES", "NO"] })).datatype).toBe("text");
  });
});
