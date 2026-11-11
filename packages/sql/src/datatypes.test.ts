import { describe, expect, it } from 'vitest';

import { bool, date, key, num, str, Type, type Field } from '@expressive/orm';

import { sql } from './datatypes';
import { TestConnection } from './sqlite/TestConnection';

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

describe("sql", () => {
  it("will declare a portable datatype", () => {
    const pick = (define: () => unknown) => {
      const { type, length, precision, scale } = column(define) as Field & { precision?: number, scale?: number };
      return { type, length, precision, scale };
    };

    expect(pick(() => str(sql.text))).toMatchObject({ type: "text" });
    expect(pick(() => str(sql.varchar(40)))).toMatchObject({ type: "varchar", length: 40 });
    expect(pick(() => str(sql.char(3)))).toMatchObject({ type: "char", length: 3 });
    expect(pick(() => str(sql.uuid))).toMatchObject({ type: "uuid" });
    expect(pick(() => num(sql.bigint))).toMatchObject({ type: "bigint" });
    expect(pick(() => num(sql.real))).toMatchObject({ type: "real" });
    expect(pick(() => num(sql.double))).toMatchObject({ type: "double" });
    expect(pick(() => num(sql.smallint))).toMatchObject({ type: "smallint" });
    expect(pick(() => num(sql.integer))).toMatchObject({ type: "integer" });
    expect(pick(() => num(sql.decimal(10, 2)))).toMatchObject({ type: "decimal", precision: 10, scale: 2 });
    expect(pick(() => num(sql.numeric(4)))).toMatchObject({ type: "numeric", precision: 4, scale: 0 });
    expect(pick(() => num(sql.numeric(4, 2)))).toMatchObject({ type: "numeric", precision: 4, scale: 2 });
    expect(pick(() => num(sql.decimal(4)))).toMatchObject({ type: "decimal", precision: 4, scale: 0 });
    expect(pick(() => date(sql.timestamp))).toMatchObject({ type: "timestamp" });
    expect(pick(() => date(sql.date))).toMatchObject({ type: "date" });
    expect(pick(() => date(sql.time))).toMatchObject({ type: "time" });
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
    // @ts-expect-error
    column(() => bool(sql.integer));
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
