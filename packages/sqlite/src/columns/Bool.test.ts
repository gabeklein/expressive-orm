import { Bool, Nullable, Type } from '..';
import { TestConnection } from '../TestConnection';

describe("schema", () => {
  it("will create basic boolean columns", async () => {
    class Flags extends Type {
      active = Bool();
      optional = Bool({ nullable: true });
      custom = Bool({ 
        type: "text", 
        either: ["YES", "NO"] 
      });
    }

    interface Signature {
      active: Bool.Integer;
      optional: Bool.Integer & Nullable;
      custom: Bool.Text;
    }
    
    // type-error if expected types are not present
    expect<Signature>(undefined as unknown as Flags);
  
    const { schema } = new TestConnection([ Flags ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        flags (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          active INTEGER NOT NULL,
          optional INTEGER,
          custom TEXT NOT NULL
        );
    `);
  });
  
  it("will handle either values correctly", async () => {
    class Settings extends Type {
      enabled = Bool({ 
        type: "text", 
        either: ["TRUE", "FALSE"]
      });
      consent = Bool({ 
        type: "text", 
        either: ["ACCEPTED", "DECLINED"], 
        nullable: true 
      });
    }

    interface Signature {
      enabled: Bool.Text;
      consent: Bool.Text & Nullable;
    }

    expect<Signature>(undefined as unknown as Settings);
  
    const { schema } = new TestConnection([ Settings ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        settings (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          enabled TEXT NOT NULL,
          consent TEXT
        );
    `);
  });
});

describe("serialization", () => {
  it("will serialize and deserialize integer boolean values", () => {
    const boolField = Bool() as Bool.Integer;
    
    // Set should return the appropriate SQLite integer value
    expect(boolField.set(true)).toBe(1);
    expect(boolField.set(false)).toBe(0);
    
    // Get should handle SQLite integer values
    expect(boolField.get(1)).toBe(true);
    expect(boolField.get(0)).toBe(false);
    expect(boolField.get(true)).toBe(true);
    expect(boolField.get(false)).toBe(false);
  });
  
  it("will handle custom either values", () => {
    const customField = Bool({ 
      type: "text", 
      either: ["YES", "NO"] 
    }) as Bool.Text;
    
    // Set should return the appropriate custom string
    expect(customField.set(true)).toBe("YES");
    expect(customField.set(false)).toBe("NO");
    
    // Get should handle the custom values
    expect(customField.get("YES")).toBe(true);
    expect(customField.get("NO")).toBe(false);
    
    // Ensure it doesn't treat other values as true
    expect(customField.get("MAYBE")).toBe(false);
  });
  
  it("will ensure correct datatype based on field type", () => {
    const intField = Bool() as Bool.Integer;
    const textField = Bool({ 
      type: "text", 
      either: ["YES", "NO"] 
    }) as Bool.Text;
    
    // Datatype should be correct
    expect(intField.datatype).toBe("integer");
    expect(textField.datatype).toBe("text");
  });
});