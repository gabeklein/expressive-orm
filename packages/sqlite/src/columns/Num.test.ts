import { describe, expect, it } from 'vitest';

import { num, Type } from '@expressive/orm';

import { TestConnection } from '../TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will create basic numeric columns", async () => {
    class Numbers extends Type {
      int = num();
      real = num({ type: "real" });
      nullable = num({ nullable: true });
    }

    expect<{ int: number, real: number, nullable: number | undefined }>(undefined as unknown as Numbers);

    const { schema } = new TestConnection([ Numbers ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        numbers (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          int INTEGER NOT NULL,
          real REAL NOT NULL,
          nullable INTEGER
        );"
    `);
  });

  it("will map other numeric types to INTEGER or REAL", async () => {
    class CompatibilityTypes extends Type {
      smallint = num({ type: "smallint" });
      bigint = num({ type: "bigint" });
      serial = num({ type: "serial" });
      float = num({ type: "float" });
      double = num({ type: "double" });
      decimal = num({ type: "decimal" });
      numeric = num({ type: "numeric", precision: 10, scale: 2 });
    }

    const { schema } = new TestConnection([ CompatibilityTypes ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        compatibility_types (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          smallint INTEGER NOT NULL,
          bigint INTEGER NOT NULL,
          serial INTEGER NOT NULL,
          float REAL NOT NULL,
          double REAL NOT NULL,
          decimal REAL NOT NULL,
          numeric REAL NOT NULL
        );"
    `);
  });
});

describe("validation", () => {
  it("will validate integer values", () => {
    const field = column(() => num({ type: "integer" }));

    expect(field.set(123)).toBe(123);
    expect(field.set(2147483647)).toBe(2147483647);
    expect(field.set(-2147483648)).toBe(-2147483648);
    expect(field.set(null)).toBeNull();
    expect(() => field.set(123.45)).toThrow("Got '123.45' but datatype is integer.");
    expect(() => field.set(NaN)).toThrow();
  });

  it("will validate real values", () => {
    const field = column(() => num({ type: "real" }));

    expect(field.set(123.45)).toBe(123.45);
    expect(field.set(123)).toBe(123);
    expect(field.set(1.234e38)).toBe(1.234e38);
    expect(() => field.set(NaN)).toThrow();
  });

  it("will map other numeric types correctly", () => {
    const smallint = column(() => num({ type: "smallint" }));
    const bigint = column(() => num({ type: "bigint" }));
    const float = column(() => num({ type: "float" }));

    expect(smallint.datatype).toBe("integer");
    expect(bigint.datatype).toBe("integer");
    expect(float.datatype).toBe("real");

    expect(() => smallint.set(123.45)).toThrow();
    expect(float.set(123.45)).toBe(123.45);
  });
});
