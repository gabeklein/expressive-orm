import { Nullable, Str, Type } from '..';
import { PostgresConnection } from '../PostgresConnection';

describe("schema", () => {
  it("will create columns", async () => {
    class Users extends Type {
      name = Str();
      email = Str({ nullable: true });
    }

    interface Signature {
      name: Str.Text;
      email: Str.Text & Nullable;
    }
    
    // type-error if expected types are not present.
    expect<Signature>(undefined as unknown as Users);
  
    const { schema } = new PostgresConnection([ Users ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "users" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "name" text NOT NULL,
          "email" text
        );
    `);
  });
  
  it("will create varchar columns with length", async () => {
    class Profiles extends Type {
      username = Str({ type: "varchar", length: 50 });
      bio = Str({ type: "varchar", length: 200, nullable: true });
    }
  
    const { schema } = new PostgresConnection([ Profiles ]);

    interface Signature {
      username: Str.VarChar;
      bio: Str.VarChar & Nullable;
    }

    expect<Signature>(undefined as unknown as Profiles);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "profiles" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "username" varchar(50) NOT NULL,
          "bio" varchar(200)
        );
    `);
  });
  
  it("will create char columns", async () => {
    class Settings extends Type {
      code = Str({ type: "char", length: 10 });
    }
  
    const { schema } = new PostgresConnection([ Settings ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "settings" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "code" char(10) NOT NULL
        );
    `);
  });
  
  it("will apply collation", async () => {
    class Localized extends Type {
      name = Str({
        type: "varchar",
        length: 100,
        collate: "en_US.utf8"
      });
    }
  
    const { schema } = new PostgresConnection([ Localized ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "localized" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "name" varchar(100) COLLATE "en_US.utf8" NOT NULL
        );
    `);
  });
});