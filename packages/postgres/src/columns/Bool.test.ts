// packages/postgres/src/columns/Bool.test.ts
import { Bool, Nullable, Type } from '..';
import { PostgresConnection } from '../PostgresConnection';

describe("schema", () => {
  it("will create basic boolean columns", async () => {
    class Flags extends Type {
      active = Bool();
      optional = Bool(true);
      custom = Bool({ 
        type: "varchar", 
        either: ["YES", "NO"] 
      });
      optionalCustom = Bool({
        type: "varchar",
        either: ["ENABLED", "DISABLED"],
        nullable: true
      });
    }

    interface Signature {
      active: Bool.Boolean;
      optional: Bool.Boolean & Nullable;
      custom: Bool.VarChar;
      optionalCustom: Bool.VarChar & Nullable;
    }
    
    // type-error if expected types are not present
    expect<Signature>(undefined as unknown as Flags);
  
    const { schema } = new PostgresConnection([ Flags ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "flags" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "active" BOOLEAN NOT NULL,
          "optional" BOOLEAN,
          "custom" VARCHAR(3) NOT NULL,
          "optional_custom" VARCHAR(8)
        );
    `);
  });
  
  it("will handle either values correctly", async () => {
    class Settings extends Type {
      enabled = Bool({ 
        type: "varchar", 
        either: ["TRUE", "FALSE"]
      });
      consent = Bool({ 
        type: "varchar", 
        either: ["ACCEPTED", "DECLINED"], 
        nullable: true 
      });
    }

    interface Signature {
      enabled: Bool.VarChar;
      consent: Bool.VarChar & Nullable;
    }

    expect<Signature>(undefined as unknown as Settings);
  
    const { schema } = new PostgresConnection([ Settings ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "settings" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "enabled" VARCHAR(5) NOT NULL,
          "consent" VARCHAR(8)
        );
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize boolean values", () => {
    const boolField = Bool() as Bool.Boolean;
    
    // Set should return the appropriate PostgreSQL boolean value
    expect(boolField.set(true)).toBe(1);
    expect(boolField.set(false)).toBe(0);
    
    // Get should handle PostgreSQL boolean values
    expect(boolField.get(true)).toBe(true);
    expect(boolField.get(false)).toBe(false);
  });
  
  it("will handle custom either values", () => {
    const customField = Bool({ 
      type: "varchar", 
      either: ["YES", "NO"] 
    }) as Bool.VarChar;
    
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
    const shortField = Bool({ 
      type: "varchar", 
      either: ["Y", "N"] 
    });
    
    const longField = Bool({ 
      type: "varchar", 
      either: ["ENABLED", "DISABLED"] 
    });

    expect(shortField.datatype).toBe("VARCHAR(1)");
    expect(longField.datatype).toBe("VARCHAR(8)");
  });
});