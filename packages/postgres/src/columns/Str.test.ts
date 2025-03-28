import { Nullable, Str, Type } from '..';
import { PostgresConnection } from '../PostgresConnection';

describe("schema", () => {
  it("will create columns", async () => {
    class Users extends Type {
      text = Str();
      optional = Str({ nullable: true });
      varchar = Str({ type: "varchar", length: 100 });
      optionalVarchar = Str({ type: "varchar", length: 50, nullable: true });
      optionalShorthand = Str(true);
      optionalVarcharCombined = Str({ type: "varchar" }, { nullable: true });
      optionalVarcharCombinedShorthand = Str({ type: "varchar" }, true);
    }

    interface Signature {
      text: Str.Text;
      optional: Str.Text & Nullable;
      varchar: Str.VarChar;
      optionalVarchar: Str.VarChar & Nullable;
      optionalShorthand: Str.Text & Nullable;
      optionalVarcharCombined: Str.VarChar & Nullable;
      optionalVarcharCombinedShorthand: Str.VarChar & Nullable;
    }
    
    // type-error if expected types are not present.
    expect<Signature>(undefined as unknown as Users);
  
    const { schema } = new PostgresConnection([ Users ]);
  
    expect(schema).toMatchInlineSnapshot(`
      CREATE TABLE
        "users" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY UNIQUE,
          "text" TEXT NOT NULL,
          "optional" TEXT,
          "varchar" VARCHAR(100) NOT NULL,
          "optional_varchar" VARCHAR(50),
          "optional_shorthand" TEXT,
          "optional_varchar_combined" VARCHAR,
          "optional_varchar_combined_shorthand" VARCHAR
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
          "username" VARCHAR(50) NOT NULL,
          "bio" VARCHAR(200)
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
          "code" CHAR(10) NOT NULL
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
          "name" VARCHAR(100) COLLATE "EN_US.UTF8" NOT NULL
        );
    `);
  });
});