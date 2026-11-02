import { describe, expect, it } from 'vitest';

import { Field, bool, Type } from '@expressive/orm';

import { SchemaConnection } from '../tests/SchemaConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value") as Field<any>;
}

describe("schema", () => {
  it("will create basic boolean columns", async () => {
    class Flags extends Type {
      active = bool();
      optional = bool(null);
      custom = bool({
        type: "varchar",
        either: ["YES", "NO"]
      });
      optionalCustom = bool({
        type: "varchar",
        either: ["ENABLED", "DISABLED"],
        nullable: true
      });
    }

    const { schema } = new SchemaConnection([ Flags ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "flags" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "active" BOOLEAN NOT NULL,
          "optional" BOOLEAN,
          "custom" VARCHAR(3) NOT NULL,
          "optional_custom" VARCHAR(8)
        );"
    `);
  });

  it("will handle either values correctly", async () => {
    class Settings extends Type {
      enabled = bool({
        type: "varchar",
        either: ["TRUE", "FALSE"]
      });
      consent = bool({
        type: "varchar",
        either: ["ACCEPTED", "DECLINED"],
        nullable: true
      });
    }

    const { schema } = new SchemaConnection([ Settings ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "settings" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "enabled" VARCHAR(5) NOT NULL,
          "consent" VARCHAR(8)
        );"
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize boolean values", () => {
    const boolField = column(() => bool());

    // Set should return the appropriate PostgreSQL boolean value
    expect(boolField.set(true)).toBe(true);
    expect(boolField.set(false)).toBe(false);
    expect(boolField.set(null)).toBeNull();

    // Get should handle PostgreSQL boolean values
    expect(boolField.get(true)).toBe(true);
    expect(boolField.get(false)).toBe(false);
  });

  it("will handle custom either values", () => {
    const customField = column(() => bool({
      type: "varchar",
      either: ["YES", "NO"]
    }));

    // Set should return the appropriate custom string
    expect(customField.set(true)).toBe("YES");
    expect(customField.set(false)).toBe("NO");

    // Get should handle the custom values
    expect(customField.get("YES")).toBe(true);
    expect(customField.get("NO")).toBe(false);

    // Ensure it doesn't treat other values as true
    expect(customField.get("MAYBE")).toBe(false);
  });

  it("will validate datatype based on either values", () => {
    const shortField = column(() => bool({
      type: "varchar",
      either: ["Y", "N"]
    }));

    const longField = column(() => bool({
      type: "varchar",
      either: ["ENABLED", "DISABLED"]
    }));

    expect(shortField.datatype).toBe("VARCHAR(1)");
    expect(longField.datatype).toBe("VARCHAR(8)");
  });
});
