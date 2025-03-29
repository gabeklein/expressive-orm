import { Nullable, Str, Table } from '..';
import { TestConnection } from '../TestConnection';

describe("schema", () => {
  it("will create columns", async () => {
    class Users extends Table {
      name = Str();
      email = Str({ nullable: true });
    }

    interface Signature {
      name: Str.Text;
      email: Str.Text & Nullable;
    }
    
    // type-error if expected types are not present.
    expect<Signature>(undefined as unknown as Users);
  
    const { schema } = new TestConnection([ Users ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        users (
          id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT UNIQUE,
          name TEXT NOT NULL,
          email TEXT
        );
    `);
  })
})