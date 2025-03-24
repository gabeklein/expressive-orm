// packages/sqlite/src/columns/Num.test.ts
import { Nullable, Num, Type } from '..';
import { TestConnection } from '../TestConnection';

describe("schema", () => {
  it("will create basic numeric columns", async () => {
    class Numbers extends Type {
      int = Num();
      real = Num({ type: "real" });
      nullable = Num({ nullable: true });
    }

    interface Signature {
      int: Num.Integer;
      real: Num.Real;
      nullable: Num.Integer & Nullable;
    }
    
    // type-error if expected types are not present
    expect<Signature>(undefined as unknown as Numbers);
  
    const { schema } = new TestConnection([ Numbers ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        numbers (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          int INTEGER NOT NULL,
          real REAL NOT NULL,
          nullable INTEGER
        );
    `);
  });
  
  it("will map other numeric types to INTEGER or REAL", async () => {
    class CompatibilityTypes extends Type {
      smallint = Num({ type: "smallint" });
      bigint = Num({ type: "bigint" });
      serial = Num({ type: "serial" });
      float = Num({ type: "float" });
      double = Num({ type: "double" });
      decimal = Num({ type: "decimal" });
      numeric = Num({ type: "numeric", precision: 10, scale: 2 });
    }
  
    const { schema } = new TestConnection([ CompatibilityTypes ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        compatibility_types (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          smallint INTEGER NOT NULL,
          bigint INTEGER NOT NULL,
          serial INTEGER NOT NULL,
          float REAL NOT NULL,
          double REAL NOT NULL,
          decimal REAL NOT NULL,
          numeric REAL NOT NULL
        );
    `);
  });
});

describe("validation", () => {
  it("will validate integer values", () => {
    const intField = Num({ type: "integer" }) as Num.Integer;
    
    // Integer validation
    expect(() => intField.set(123)).not.toThrow();
    expect(() => intField.set(2147483647)).not.toThrow();
    expect(() => intField.set(-2147483648)).not.toThrow();
    expect(() => intField.set(123.45)).toThrow(); // Should throw for non-integer
    expect(() => intField.set(NaN)).toThrow(); // Should throw for NaN
  });
  
  it("will validate real values", () => {
    const realField = Num({ type: "real" }) as Num.Real;
    
    // Real validation
    expect(() => realField.set(123.45)).not.toThrow();
    expect(() => realField.set(123)).not.toThrow(); // Integers are valid reals
    expect(() => realField.set(1.234e38)).not.toThrow();
    expect(() => realField.set(NaN)).toThrow(); // Should throw for NaN
  });
  
  it("will map other numeric types correctly", () => {
    const smallintField = Num({ type: "smallint" });
    const bigintField = Num({ type: "bigint" });
    const floatField = Num({ type: "float" });
    
    // Mapped to INTEGER
    expect(smallintField.datatype).toBe("integer");
    expect(bigintField.datatype).toBe("integer");
    
    // Mapped to REAL
    expect(floatField.datatype).toBe("real");
    
    // Validation behavior
    // expect(() => smallintField.set(123.45)).toThrow(); // Should enforce integer validation
    expect(() => floatField.set(123.45)).not.toThrow(); // Should allow float values
  });
});