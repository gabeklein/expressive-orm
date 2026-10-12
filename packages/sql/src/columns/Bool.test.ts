import { describe, expect, it } from 'vitest';

import { bool, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will render each type by its affinity", async () => {
    class Flags extends Type {
      active = bool();
      optional = bool({ nullable: true });
      flag = bool({ type: "integer" });
      custom = bool({ type: "text", either: ["YES", "NO"] });
      short = bool({ type: "varchar", either: ["Y", "N"] });
    }

    expect<{ active: boolean, optional: boolean | undefined, custom: boolean }>(undefined as unknown as Flags);

    const { schema } = TestConnection.new([ Flags ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        flags (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          active INTEGER NOT NULL,
          optional INTEGER,
          flag INTEGER NOT NULL,
          custom TEXT NOT NULL,
          short TEXT NOT NULL
        );"
    `);
  });

  it("will reject an unknown type", () => {
    // @ts-expect-error
    column(() => bool({ type: "blob" }));
  });
});

describe("datatype", () => {
  it("will size a varchar to its values", () => {
    expect(column(() => bool()).datatype).toBe("boolean");
    expect(column(() => bool({ type: "text", either: ["YES", "NO"] })).datatype).toBe("text");
    expect(column(() => bool({ type: "varchar", either: ["ENABLED", "DISABLED"] })).datatype).toBe("varchar(8)");
  });
});

describe("serialization", () => {
  it("will keep a boolean", () => {
    const field = column(() => bool());

    expect(field.set(true)).toBe(true);
    expect(field.set(false)).toBe(false);
    expect(field.set(null)).toBeNull();
    expect(field.get(1)).toBe(true);
    expect(field.get(0)).toBe(false);
    expect(field.get(true)).toBe(true);
  });

  it("will store an integer", () => {
    const field = column(() => bool({ type: "integer" }));

    expect(field.set(true)).toBe(1);
    expect(field.set(false)).toBe(0);
    expect(field.get(1)).toBe(true);
    expect(field.get(0)).toBe(false);
  });

  it("will store either value", () => {
    const field = column(() => bool({ type: "text", either: ["YES", "NO"] }));

    expect(field.set(true)).toBe("YES");
    expect(field.set(false)).toBe("NO");
    expect(field.get("YES")).toBe(true);
    expect(field.get("NO")).toBe(false);
    expect(field.get("MAYBE")).toBe(false);
  });
});
