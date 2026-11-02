import { describe, expect, it } from 'vitest';

import { str, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("schema", () => {
  it("will render every type as TEXT", async () => {
    class Users extends Type {
      name = str();
      email = str({ nullable: true });
      handle = str({ type: "varchar", length: 20 });
      code = str({ type: "char", length: 2 });
      key = str({ type: "uuid" });
    }

    expect<{ name: string, email: string | undefined }>(undefined as unknown as Users);

    const { schema } = TestConnection.new([ Users ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        users (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT,
          handle TEXT NOT NULL,
          code TEXT NOT NULL,
          key TEXT NOT NULL
        );"
    `);
  })

  it("will reject an unknown type", () => {
    // @ts-expect-error
    column(() => str({ type: "blob" }));
  })
})

describe("datatype", () => {
  it("will compose length and collation", () => {
    expect(column(() => str()).datatype).toBe("text");
    expect(column(() => str({ type: "varchar", length: 100 })).datatype).toBe("varchar(100)");
    expect(column(() => str({ type: "varchar" })).datatype).toBe("varchar");
    expect(column(() => str({ type: "char", length: 10 })).datatype).toBe("char(10)");
    expect(column(() => str({ type: "text", collate: "C" })).datatype).toBe(`text COLLATE "C"`);
  })
})

describe("validation", () => {
  it("will enforce length", () => {
    const field = column(() => str({ type: "varchar", length: 3 }));

    expect(field.set("abc")).toBe("abc");
    expect(() => field.set("abcd")).toThrow("Value length 4 exceeds maximum of 3.");
  })
})
