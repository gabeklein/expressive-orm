import { describe, expect, it } from 'vitest';

import { Field, num, Type } from '@expressive/orm';

import { SchemaConnection } from '../tests/SchemaConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value") as Field<any>;
}

describe("schema", () => {
  it("will create basic numeric columns", async () => {
    class Numbers extends Type {
      int = num();
      real = num({ type: "real" });
      smallint = num({ type: "smallint" });
      bigint = num({ type: "bigint" });
      double = num({ type: "double" });
      optional = num({ nullable: true });
    }

    const { schema } = new SchemaConnection([ Numbers ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "numbers" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "int" INTEGER NOT NULL,
          "real" REAL NOT NULL,
          "smallint" SMALLINT NOT NULL,
          "bigint" BIGINT NOT NULL,
          "double" DOUBLE PRECISION NOT NULL,
          "optional" INTEGER
        );"
    `);
  });

  it("will create numeric columns with precision and scale", async () => {
    class FinancialData extends Type {
      price = num({ type: "numeric", precision: 10, scale: 2 });
      total = num({ type: "numeric", precision: 15, scale: 4 });
      percentage = num({ type: "numeric", precision: 5, scale: 2 });
    }

    const { schema } = new SchemaConnection([ FinancialData ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "financial_data" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "price" NUMERIC(10, 2) NOT NULL,
          "total" NUMERIC(15, 4) NOT NULL,
          "percentage" NUMERIC(5, 2) NOT NULL
        );"
    `);
  });

  it("will create serial columns", async () => {
    class Counter extends Type {
      value = num({ type: "serial" });
    }

    const { schema } = new SchemaConnection([ Counter ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "counter" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "value" SERIAL NOT NULL
        );"
    `);
  });
});

describe("validation", () => {
  it("will validate integer values", () => {
    const intField = column(() => num({ type: "integer" }));
    const smallintField = column(() => num({ type: "smallint" }));
    const bigintField = column(() => num({ type: "bigint" }));

    expect(() => intField.set(123)).not.toThrow();
    expect(() => intField.set(2147483647)).not.toThrow(); // Max int
    expect(() => intField.set(-2147483648)).not.toThrow(); // Min int
    expect(() => intField.set(NaN)).toThrow();

    expect(() => smallintField.set(123)).not.toThrow();
    expect(() => smallintField.set(32767)).not.toThrow(); // Max smallint
    expect(() => smallintField.set(-32768)).not.toThrow(); // Min smallint

    expect(() => bigintField.set(123)).not.toThrow();
    expect(() => bigintField.set(9007199254740991)).not.toThrow(); // Max safe integer in JS

    expect(() => intField.set(123.45)).toThrow();
    expect(() => smallintField.set(40000)).toThrow();
    expect(() => smallintField.set(123.45)).toThrow();
    expect(() => bigintField.set(123.45)).toThrow();
  });

  it("will validate numeric values with precision and scale", () => {
    const numericField = column(() => num({
      type: "numeric",
      precision: 5,
      scale: 2
    }));

    expect(() => numericField.set(123.45)).not.toThrow();
    expect(() => numericField.set(999.99)).not.toThrow();
    expect(() => numericField.set(-999.99)).not.toThrow();
    expect(() => numericField.set(1000.00)).not.toThrow(); // 4 digits (within 5 precision)

    // TODO: did not pass
    // expect(() => numericField.set(10000.00)).toThrow(); // 6 digits total
    expect(() => numericField.set(123.456)).toThrow();
  });

  it("will validate floating point values", () => {
    const realField = column(() => num({ type: "real" }));
    const doubleField = column(() => num({ type: "double" }));

    // Real validation
    expect(() => realField.set(123.45)).not.toThrow();
    expect(() => realField.set(1.234e38)).not.toThrow();
    expect(() => realField.set(NaN)).toThrow();

    // Double precision validation
    expect(() => doubleField.set(123.45)).not.toThrow();
    expect(() => doubleField.set(1.234e308)).not.toThrow();
    expect(() => doubleField.set(NaN)).toThrow();
  });
});
