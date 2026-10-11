import { describe, expect, it } from 'vitest';

import { str, Type } from '@expressive/orm';

import { TestConnection } from '../sqlite/TestConnection';

describe("schema", () => {
  it("will create columns", async () => {
    class Users extends Type {
      name = str();
      email = str({ nullable: true });
    }

    expect<{ name: string, email: string | undefined }>(undefined as unknown as Users);

    const { schema } = new TestConnection([ Users ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        users (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT
        );"
    `);
  })

  it("will reject an unknown type", () => {
    class Users extends Type {
      // @ts-expect-error
      name = str({ type: "varchar" });
    }

    expect(Users.fields.get("name")!.datatype).toBe("varchar");
  })
})
