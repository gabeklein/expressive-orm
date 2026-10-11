import { describe, expect, it } from 'vitest';

import { str, Type } from '@expressive/orm';

import { SchemaConnection } from '../tests/SchemaConnection';

describe("schema", () => {
  it("will create columns", async () => {
    class Users extends Type {
      text = str();
      optional = str({ nullable: true });
      varchar = str({ type: "varchar", length: 100 });
      optionalVarchar = str({ type: "varchar", length: 50, nullable: true });
      optionalShorthand = str(null);
      optionalVarcharCombined = str({ type: "varchar" }, { nullable: true });
      optionalVarcharCombinedShorthand = str({ type: "varchar" }, null);
    }

    const { schema } = new SchemaConnection([ Users ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "users" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "text" TEXT NOT NULL,
          "optional" TEXT,
          "varchar" VARCHAR(100) NOT NULL,
          "optional_varchar" VARCHAR(50),
          "optional_shorthand" TEXT,
          "optional_varchar_combined" VARCHAR,
          "optional_varchar_combined_shorthand" VARCHAR
        );"
    `);
  });

  it("will create varchar columns with length", async () => {
    class Profiles extends Type {
      username = str({ type: "varchar", length: 50 });
      bio = str({ type: "varchar", length: 200, nullable: true });
    }

    const { schema } = new SchemaConnection([ Profiles ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "profiles" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "username" VARCHAR(50) NOT NULL,
          "bio" VARCHAR(200)
        );"
    `);
  });

  it("will create char columns", async () => {
    class Settings extends Type {
      code = str({ type: "char", length: 10 });
    }

    const { schema } = new SchemaConnection([ Settings ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "settings" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "code" CHAR(10) NOT NULL
        );"
    `);
  });

  it("will apply collation", async () => {
    class Localized extends Type {
      name = str({
        type: "varchar",
        length: 100,
        collate: "en_US.utf8"
      });
    }

    const { schema } = new SchemaConnection([ Localized ]);

    expect(String(schema)).toMatchInlineSnapshot(`
      "CREATE TABLE
        "localized" (
          "id" INTEGER NOT NULL GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          "name" VARCHAR(100) COLLATE "EN_US.UTF8" NOT NULL
        );"
    `);
  });
});
