import { describe, expect, it } from 'vitest';

import { num, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will render each type by its affinity", async () => {
    class Numbers extends Type {
      int = num();
      nullable = num({ nullable: true });
      smallint = num({ type: "smallint" });
      bigint = num({ type: "bigint" });
      real = num({ type: "real" });
      float = num({ type: "float" });
      double = num({ type: "double" });
      numeric = num({ type: "numeric", precision: 10, scale: 2 });
      decimal = num({ type: "decimal" });
    }

    expect<{ int: number, real: number, nullable: number | undefined }>(undefined as unknown as Numbers);

    const { schema } = new TestConnection([ Numbers ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        numbers (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          int INTEGER NOT NULL,
          nullable INTEGER,
          smallint INTEGER NOT NULL,
          bigint INTEGER NOT NULL,
          real REAL NOT NULL,
          float REAL NOT NULL,
          double REAL NOT NULL,
          numeric NUMERIC NOT NULL,
          decimal NUMERIC NOT NULL
        );"
    `);
  });

  it("will reject an unknown type", () => {
    // @ts-expect-error
    column(() => num({ type: "money" }));
  });
});

describe("datatype", () => {
  it("will compose precision and scale", () => {
    expect(column(() => num()).datatype).toBe("integer");
    expect(column(() => num({ type: "double" })).datatype).toBe("double precision");
    expect(column(() => num({ type: "numeric", precision: 10, scale: 2 })).datatype).toBe("numeric(10,2)");
    expect(column(() => num({ type: "decimal", precision: 5 })).datatype).toBe("decimal(5)");
  });
});

describe("validation", () => {
  it("will validate integer ranges", () => {
    const integer = column(() => num({ type: "integer" }));
    const smallint = column(() => num({ type: "smallint" }));
    const bigint = column(() => num({ type: "bigint" }));

    expect(integer.set(2147483647)).toBe(2147483647);
    expect(integer.set(-2147483648)).toBe(-2147483648);
    expect(integer.set(null)).toBeNull();
    expect(() => integer.set(2147483648)).toThrow("Value 2147483648 out of range for integer.");
    expect(() => integer.set(123.45)).toThrow("Value 123.45 out of range for integer.");
    expect(() => integer.set(NaN)).toThrow();

    expect(smallint.set(32767)).toBe(32767);
    expect(smallint.set(-32768)).toBe(-32768);
    expect(() => smallint.set(40000)).toThrow();
    expect(() => smallint.set(123.45)).toThrow();

    expect(bigint.set(9007199254740991)).toBe(9007199254740991);
    expect(() => bigint.set(123.45)).toThrow();
  });

  it("will validate precision and scale", () => {
    const field = column(() => num({ type: "numeric", precision: 5, scale: 2 }));

    expect(field.set(123.45)).toBe(123.45);
    expect(field.set(-999.99)).toBe(-999.99);
    expect(field.set(1000)).toBe(1000);
    expect(() => field.set(1234.56)).toThrow("Value 1234.56 exceeds precision of 5.");
    expect(() => field.set(12.345)).toThrow("Value 12.345 exceeds scale of 2.");
  });

  it("will accept any precision without one declared", () => {
    const real = column(() => num({ type: "real" }));
    const decimal = column(() => num({ type: "decimal", precision: 5 }));

    expect(real.set(1.234e38)).toBe(1.234e38);
    expect(decimal.set(12.345)).toBe(12.345);
    expect(() => real.set(NaN)).toThrow();
  });
});
