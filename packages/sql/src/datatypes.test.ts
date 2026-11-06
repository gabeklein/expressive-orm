import { describe, expect, it } from 'vitest';

import { bool, date, key, num, str, Type } from '@expressive/orm';

import { sql } from './datatypes';
import { TestConnection } from './sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("sql", () => {
  it("will set a column's datatype", () => {
    expect(column(() => str(sql.text)).datatype).toBe("text");
    expect(column(() => str(sql.varchar(40))).datatype).toBe("varchar(40)");
    expect(column(() => str(sql.char(3))).datatype).toBe("char(3)");
    expect(column(() => num(sql.bigint)).datatype).toBe("bigint");
    expect(column(() => num(sql.decimal(10, 2))).datatype).toBe("decimal(10,2)");
    expect(column(() => num(sql.numeric(4))).datatype).toBe("numeric(4,0)");
    expect(column(() => num(sql.decimal(4))).datatype).toBe("decimal(4,0)");
    expect(column(() => date(sql.timestamp)).datatype).toBe("timestamp");
    expect(column(() => bool(sql.integer)).datatype).toBe("integer");
    expect(column(() => date(sql.ms)).datatype).toBe("bigint");
    expect(column(() => date(sql.seconds)).datatype).toBe("integer");
  })

  it("will combine with null and other options", () => {
    class Image extends Type {
      seed = num(sql.bigint, null);
      title = str(sql.varchar(120), { unique: true });
    }

    const seed: number | undefined = ({} as Image).seed;
    const { nullable, type } = Image.fields.get("seed")!;
    const { unique, length } = Image.fields.get("title")!;

    expect({ nullable, type, unique, length, seed }).toEqual({ nullable: true, type: "bigint", unique: true, length: 120, seed: undefined });
  })

  it("will reject a datatype of another column", () => {
    // @ts-expect-error
    column(() => num(sql.text));
    // @ts-expect-error
    column(() => str(sql.bigint));
  })
})

describe("key", () => {
  it("will key by text", async () => {
    class Image extends Type {
      id = key(sql.text, { column: "name" });
      size = num();
    }

    const { schema } = await TestConnection.new([Image]);
    const image = await Image.insert({ id: "a.png", size: 1 });

    expect(schema).toContain("name TEXT NOT NULL PRIMARY KEY");
    expect(await Image.one("a.png")).toEqual(image);
  })

  it("will key by a generated uuid", async () => {
    class Asset extends Type {
      id = key(sql.uuid);
      file = str();
    }

    const { schema } = await TestConnection.new([Asset]);
    const asset = await Asset.insert({ file: "a" });

    expect(schema).toContain("id TEXT NOT NULL PRIMARY KEY");
    expect(await Asset.one({ file: "a" })).toEqual({ id: asset.id, file: "a" });
  })
})
