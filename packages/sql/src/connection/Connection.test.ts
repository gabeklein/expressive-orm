import { describe, expect, it, vi } from 'vitest';

import { bool, Builder, equal, greaterThan, isIn, isLike, isNull, notEqual, notNull, asc, desc, num, str, Type } from '@expressive/orm';

import { Connection } from './Connection';
import { Generator } from './Generator';

class Recorder extends Connection {
  log: [sql: string, params?: unknown[]][] = [];
  rows: Record<string, unknown>[] = [];

  get schema(){
    return "";
  }

  async sync(){
    Object.defineProperty(this, "ready", { value: true });
    return this;
  }

  prepare(builder: Builder){
    const sql = String(new Generator(builder));

    return {
      all: async (params?: unknown[]) => {
        this.log.push([sql, params]);
        return this.rows;
      },
      run: async (params?: unknown[]) => {
        this.log.push([sql, params]);
        return 1;
      },
      toString: () => sql
    };
  }
}

describe("using", () => {
  it("will bind types", async () => {
    class Foo extends Type {}

    const db = new Recorder([Foo]);

    expect(Foo.connection).toBe(db);
    expect(db.using).toEqual(new Set([Foo]));
  })

  it("will bind types by key", async () => {
    class Foo extends Type {}

    const db = new Recorder({ Foo });

    expect(Foo.connection).toBe(db);
  })

  it("will throw if type already has a connection", () => {
    class Foo extends Type {}

    new Recorder([Foo]);

    expect(() => new Recorder([Foo])).toThrow("Type Foo already has assigned connection.");
  })

  it("will unbind types on close", async () => {
    class Foo extends Type {}

    const db = new Recorder([Foo]);

    await db.close();

    expect(Foo.connection).not.toBe(db);
    expect(() => new Recorder([Foo])).not.toThrow();
  })
})

describe("then", () => {
  it("will sync when awaited", async () => {
    const db = new Recorder([]);
    const sync = vi.spyOn(db, "sync");

    expect(await db).toBe(db);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(db.then).toBeUndefined();
  })

  it("will not sync if ready", async () => {
    const db = new Recorder([]);
    const sync = vi.spyOn(db, "sync");

    Object.defineProperty(db, "ready", { value: true });

    await db;

    expect(sync).not.toHaveBeenCalled();
  })

  it("will sync without callbacks", async () => {
    const db = new Recorder([]);

    await db.then();

    expect(db.ready).toBe(true);
  })

  it("will reject if sync fails", async () => {
    const db = new Recorder([]);

    vi.spyOn(db, "sync").mockRejectedValue(new Error("nope"));

    await expect(db.then(undefined, (error: Error) => { throw error })).rejects.toThrow("nope");
  })
})

describe("floor", () => {
  class Foo extends Type {
    name = str();
    rank = num({ nullable: true });
    active = bool();
  }

  const db = new Recorder([Foo]);

  it("will get with constraints", async () => {
    db.log = [];
    db.rows = [{ id: 1, name: "Gabe", rank: 3, active: 1 }];

    const [foo] = await Foo.find({
      name: [notEqual("Bob"), isLike("G%")],
      rank: [greaterThan(1), isIn([3, 4]), notNull(), asc()],
      active: equal(true),
      id: desc()
    }, 10, 5);

    expect(foo.values).toEqual({ id: 1, name: "Gabe", rank: 3, active: true });
    expect(db.log).toEqual([[
      "SELECT `foo`.`id` AS \"id\", `foo`.`name` AS \"name\", `foo`.`rank` AS \"rank\", `foo`.`active` AS \"active\" " +
      "FROM `foo` " +
      "WHERE `foo`.`name` != ? AND `foo`.`name` LIKE ? AND `foo`.`rank` > ? AND `foo`.`rank` IN (?,?) AND `foo`.`rank` IS NOT NULL AND `foo`.`active` = ? " +
      "ORDER BY `foo`.`rank` asc,`foo`.`id` desc LIMIT 10 OFFSET 5",
      ["Bob", "G%", 1, 3, 4, true]
    ]]);
  })

  it("will get null", async () => {
    db.log = [];
    db.rows = [];

    await Foo.find({ rank: isNull() });
    await Foo.find({ rank: equal(null) });
    await Foo.find({ rank: notEqual(null) });

    expect(db.log.map(([sql]) => sql.slice(sql.indexOf("WHERE")))).toEqual([
      "WHERE `foo`.`rank` IS NULL",
      "WHERE `foo`.`rank` IS NULL",
      "WHERE `foo`.`rank` IS NOT NULL"
    ]);
  })

  it("will insert returning the row", async () => {
    db.log = [];
    db.rows = [{ id: 2, name: "Bob", rank: null, active: 0 }];

    const foo = await Foo.insert({ name: "Bob", active: false });

    expect(foo.values).toEqual({ id: 2, name: "Bob", rank: null, active: false });
    expect(db.log).toEqual([[
      "INSERT INTO `foo` (`name`,`active`) SELECT ?,? " +
      "RETURNING `foo`.`id` AS \"id\", `foo`.`name` AS \"name\", `foo`.`rank` AS \"rank\", `foo`.`active` AS \"active\"",
      ["Bob", false]
    ]]);
  })

  it("will insert without returning", async () => {
    db.log = [];

    await expect(db.insert("foo", { name: "Joe", active: 1 })).resolves.toBe(1);
    expect(db.log).toEqual([[
      "INSERT INTO `foo` (`name`,`active`) SELECT ?,?",
      ["Joe", 1]
    ]]);
  })

  it("will update by id", async () => {
    db.log = [];

    await Foo.update(2, { name: "Robert", rank: 4 });

    expect(db.log).toEqual([[
      "UPDATE `foo` SET `name` = ?,`rank` = ? WHERE `foo`.`id` = ?",
      ["Robert", 4, 2]
    ]]);
  })

  it("will remove by id", async () => {
    db.log = [];
    db.rows = [{ id: 3, name: "Al", rank: null, active: 1 }];

    const foo = await Foo.one(3, true);

    db.log = [];
    await foo.delete();

    expect(db.log).toEqual([[
      "DELETE FROM `foo` WHERE `foo`.`id` = ?",
      [3]
    ]]);
  })

  it("will throw for a table not used", async () => {
    await expect(db.get("bar", [])).rejects.toThrow("Table bar is not used by this connection.");
  })

  it("will throw for a column not in table", async () => {
    await expect(db.get("foo", [["nope", "=", 1]])).rejects.toThrow("Column nope does not exist in foo.");
  })

  it("will key tables by schema", async () => {
    class Bar extends Type {
      static schema = "other";
    }

    const other = new Recorder([Bar]);

    other.rows = [];

    await expect(other.get("other.bar", [])).resolves.toEqual([]);
    expect(other.log[0][0]).toBe("SELECT `T0`.`id` AS \"id\" FROM `other`.`bar` T0");
  })
})
