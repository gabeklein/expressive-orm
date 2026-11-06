import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { bool, date, index, json, key, num, one, orNull, Query, str, Type } from '@expressive/orm';
import type { Connection } from '@expressive/sql';
import type { Pool } from 'mysql2/promise';

import { MySQLConnection } from './MySQLConnection';

const url = process.env.MYSQL_URL;

function fake(rows: (sql: string) => unknown[] = () => []){
  const query = vi.fn(async ({ sql }: { sql: string }) => [rows(sql)]);
  const pool = { getConnection(){}, query, end: vi.fn() } as unknown as Pool;

  return { pool, query };
}

describe("schema", () => {
  it("will render tables and constraints", () => {
    class Author extends Type {
      name = str({ unique: true });
      bio = str({ nullable: true, fallback: "it's" });
    }

    class Post extends Type {
      author = one(Author);
      title = str(index);
      slug = str({ type: "varchar", length: 40 });
      score = num({ type: "numeric", precision: 5, scale: 2 });
      live = bool({ fallback: false });
      tags = json<string[]>();
      at = date.created();
      day = date({ type: "date" });
      ref = str({ type: "uuid" });
    }

    class Pick extends Type {
      id = key(() => [this.post, this.kind]);
      post = one(Post);
      kind = str();
    }

    const db = MySQLConnection.new([Author, Post, Pick], fake().pool);

    expect(db.schema).toMatchInlineSnapshot(`
      "CREATE TABLE
        \`author\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
          \`name\` VARCHAR(255) NOT NULL UNIQUE,
          \`bio\` TEXT DEFAULT('it''s')
        );

      CREATE TABLE
        \`post\` (
          \`id\` INTEGER NOT NULL AUTO_INCREMENT PRIMARY KEY,
          \`author_id\` INTEGER NOT NULL,
          \`title\` VARCHAR(255) NOT NULL,
          \`slug\` VARCHAR(40) NOT NULL,
          \`score\` NUMERIC(5, 2) NOT NULL,
          \`live\` BOOLEAN NOT NULL DEFAULT(FALSE),
          \`tags\` TEXT NOT NULL,
          \`at\` DATETIME(3) NOT NULL DEFAULT(UTC_TIMESTAMP(3)),
          \`day\` DATE NOT NULL,
          \`ref\` CHAR(36) NOT NULL
        );

      CREATE TABLE
        \`pick\` (
          \`post_id\` INTEGER NOT NULL,
          \`kind\` VARCHAR(255) NOT NULL,
          PRIMARY KEY (\`post_id\`, \`kind\`)
        );

      ALTER TABLE
        \`post\`
      ADD
        CONSTRAINT \`post_author_id_fk\` FOREIGN KEY (\`author_id\`) REFERENCES \`author\` (\`id\`);

      ALTER TABLE
        \`pick\`
      ADD
        CONSTRAINT \`pick_post_id_fk\` FOREIGN KEY (\`post_id\`) REFERENCES \`post\` (\`id\`);"
    `);
  })
})

describe("plan", () => {
  class User extends Type {
    name = str();
    age = num({ nullable: true });
    email = str(index);
  }

  const columns = (sql: string) => sql.includes("information_schema.columns") ? [
    { table: "user", column: "id", type: "int", nullable: "NO" },
    { table: "user", column: "name", type: "text", nullable: "YES" },
    { table: "user", column: "email", type: "varchar(255)", nullable: "NO" }
  ] : sql.includes("COUNT(*)") ? [{ count: 0 }] : [];

  it("will report drift and missing work", async () => {
    const db = MySQLConnection.new([User], fake(columns).pool);

    await expect(db.plan()).resolves.toMatchInlineSnapshot(`
      {
        "problems": [
          "Column "name" in table user has incorrect nullable value",
        ],
        "steps": [
          {
            "action": "add column age to user",
            "column": "age",
            "reason": "Column "age" does not exist in table user",
            "sql": [
              "ALTER TABLE \`user\` ADD COLUMN \`age\` INTEGER;",
            ],
            "table": "user",
          },
          {
            "action": "create index user_email on user",
            "column": "email",
            "reason": "Index user_email does not exist on user",
            "sql": [
              "CREATE INDEX \`user_email\` ON \`user\` (\`email\`);",
            ],
            "table": "user",
          },
        ],
      }
    `);
    await db.close();
  })

  it("will rebuild drift when forced", async () => {
    const db = MySQLConnection.new([User], fake(columns).pool);
    const { steps, problems } = await db.plan(true);

    expect(problems).toEqual([]);
    expect(steps.map(step => step.sql)).toMatchInlineSnapshot(`
      [
        [
          "ALTER TABLE \`user\` ADD COLUMN \`age\` INTEGER;",
        ],
        [
          "ALTER TABLE \`user\` MODIFY COLUMN \`name\` TEXT NOT NULL;",
        ],
        [
          "CREATE INDEX \`user_email\` ON \`user\` (\`email\`);",
        ],
      ]
    `);
    await db.close();
  })

  it("will refuse NOT NULL over null rows", async () => {
    const db = MySQLConnection.new([User], fake(sql => sql.includes("COUNT(*)") ? [{ count: 2 }] : columns(sql)).pool);
    const { problems } = await db.plan(true);

    expect(problems).toEqual(['Column "name" in table user cannot be rebuilt: 2 rows are NULL.']);
    await db.close();
  })

  it("will refuse a static schema", async () => {
    class Other extends Type {
      static schema = "other";
    }

    const db = MySQLConnection.new([Other], fake().pool);

    await expect(db.plan()).resolves.toEqual({ steps: [], problems: ["static schema is not supported by MySQLConnection."] });
    await db.close();
  })
})

describe("datatype", () => {
  it("will map time precision", () => {
    class Clock extends Type {
      at = date({ type: "time", precision: 2 });
      on = date({ type: "timestamp", precision: 0 });
    }

    expect(Clock.fields.get("at")!.datatype).toBe("time(2)");
    expect(Clock.fields.get("on")!.datatype).toBe("datetime(0)");
    expect(Clock.fields.get("on")!.set(new Date("2024-01-02T03:04:05.678Z"))).toBe("2024-01-02 03:04:05.678");
  })
})

describe("prepare", () => {
  class Item extends Type {
    name = str();
  }

  class Tag extends Type {
    id = str({ primary: true });
    label = str();
  }

  it("will name the query on a syntax error", async () => {
    const { pool, query } = fake();
    const db = MySQLConnection.new([Item], pool);

    query.mockRejectedValueOnce(new Error("You have an error in your SQL syntax"));
    await expect(Item.find()).rejects.toThrow(/syntax\nin query: SELECT/);

    query.mockRejectedValueOnce(new Error("Lost connection"));
    await expect(Item.find()).rejects.toThrow("Lost connection");

    query.mockRejectedValueOnce("odd");
    await expect(Item.find()).rejects.toBe("odd");

    await db.close();
  })

  it("will return nothing for an ignored insert", async () => {
    const { pool, query } = fake();
    const db = MySQLConnection.new([Tag], pool);

    query.mockResolvedValueOnce([{ affectedRows: 0 }] as any);
    await expect(Tag.insert({ id: "a", label: "x" }, { conflict: "ignore" })).resolves.toBeUndefined();

    query.mockResolvedValueOnce([{ affectedRows: 1, insertId: 0 }] as any);
    query.mockResolvedValueOnce([[{ id: "a", label: "x" }]] as any);
    await expect(Tag.insert({ id: "a", label: "x" })).resolves.toEqual({ id: "a", label: "x" });
    expect(query.mock.calls[2][0]).toMatchObject({ sql: "SELECT `tag`.`id` AS `id`, `tag`.`label` AS `label` FROM `tag` WHERE `tag`.`id` = ? LIMIT 1", values: ["a"] });

    await db.close();
  })

  it("will re-select by a literal key", async () => {
    const { pool, query } = fake();
    const db = MySQLConnection.new([Tag], pool);

    query.mockResolvedValueOnce([{ affectedRows: 1 }] as any);
    query.mockResolvedValueOnce([[{ id: "a", label: "b" }]] as any);

    await expect(Query(where => where(Tag, { id: "a", label: "b" }))).resolves.toEqual([{ id: "a", label: "b" }]);
    expect(query.mock.calls[1][0]).toMatchObject({ values: ["a"] });

    await db.close();
  })

  it("will throw re-selecting without a key", () => {
    const db = MySQLConnection.new([Tag], fake().pool);

    expect(() => Query(where => {
      const tag = where(Tag, { id: "a", label: "b" });

      return where(Tag, { id: tag.label, label: "c" });
    })).toThrow();

    expect(() => Query(where => where(Tag, { label: "c" } as any))).toThrow("MySQL cannot return the row inserted into tag without a value for id.");

    return db.close();
  })

  it("will count and encode", async () => {
    const { pool, query } = fake();
    const db = MySQLConnection.new([Item], pool);

    query.mockResolvedValueOnce([[{ "COUNT(*)": 3 }]] as any);
    await expect(Query(where => void where(Item))).resolves.toBe(3);

    await db.query("SELECT ?, ?, ?", [{ a: 1 }, null, new Date(0)]);
    expect(query.mock.calls[1][0]).toMatchObject({ values: ['{"a":1}', null, new Date(0)] });

    await db.close();
  })

  it("will read dates as strings", async () => {
    const { pool, query } = fake();
    const db = MySQLConnection.new([Item], pool);

    await db.query("SELECT 1");

    const { typeCast } = query.mock.calls[0][0] as any;
    const field = (type: string) => ({ type, string: () => "text" });
    const next = () => "parsed";

    expect(typeCast(field("DATETIME"), next)).toBe("text");
    expect(typeCast(field("TIMESTAMP"), next)).toBe("text");
    expect(typeCast(field("DATE"), next)).toBe("text");
    expect(typeCast(field("LONG"), next)).toBe("parsed");

    await db.close();
  })

  it("will hold one connection for a transaction", async () => {
    const client = { query: vi.fn(async () => [[]]), release: vi.fn() };
    const { pool, query } = fake();

    (pool as any).getConnection = async () => client;

    const db = MySQLConnection.new([Item], pool);

    await db.transaction(() => db.query("SELECT 1"));

    expect(client.query.mock.calls.map(([sql]: any) => typeof sql == "string" ? sql : sql.sql)).toEqual(["START TRANSACTION", "SELECT 1", "COMMIT"]);
    expect(client.release).toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();

    client.query.mockImplementationOnce(async () => [[]]).mockImplementationOnce(async () => { throw new Error("x") });

    await expect(db.transaction(() => db.query("SELECT 1"))).rejects.toThrow("x");
    expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");

    await db.close();
  })
})

describe("inspect", () => {
  class Author extends Type {
    name = str();
  }

  class Post extends Type {
    author = one(Author);
  }

  const info = (rows: object[]) => (sql: string) => sql.includes("information_schema.columns") ? rows : [];

  it("will report a renamed relation", async () => {
    const db = MySQLConnection.new([Author, Post], fake(info([
      { table: "author", column: "id", type: "int", nullable: "NO" },
      { table: "author", column: "name", type: "text", nullable: "NO" },
      { table: "post", column: "id", type: "int", nullable: "NO" },
      { table: "post", column: "author_id", type: "int", nullable: "NO" }
    ])).pool);

    Post.fields.get("author")!.column = "writer_id";

    try {
      await expect(db.plan()).resolves.toMatchObject({ problems: [expect.stringContaining("is missing but author_id exists")] });
    }
    finally {
      Post.fields.get("author")!.column = "author_id";
      await db.close();
    }
  })

  it("will report a missing reference", async () => {
    const db = MySQLConnection.new([Author, Post], fake(info([
      { table: "author", column: "name", type: "text", nullable: "NO" },
      { table: "author", column: "id", type: "int", nullable: "NO" },
      { table: "post", column: "id", type: "int", nullable: "NO" },
      { table: "post", column: "author_id", type: "int", nullable: "NO" }
    ])).pool);

    await expect(db.verify()).resolves.toMatchObject({ tables: new Set() });
    await db.close();

    const missing = MySQLConnection.new([Author, Post], fake(info([
      { table: "post", column: "id", type: "int", nullable: "NO" },
      { table: "post", column: "author_id", type: "int", nullable: "NO" },
      { table: "author", column: "name", type: "text", nullable: "NO" }
    ])).pool);

    await expect(missing.verify()).rejects.toThrow("Referenced column id does not exist in table author");
    await missing.close();
  })

  it("will report a referenced table missing", async () => {
    const db = MySQLConnection.new([Post], fake(info([
      { table: "post", column: "id", type: "int", nullable: "NO" },
      { table: "post", column: "author_id", type: "int", nullable: "NO" }
    ])).pool);

    await expect(db.verify()).rejects.toThrow(/references a foreign connection|Referenced table author does not exist/);
    await db.close();
  })

  it("will report columns it cannot add", async () => {
    class Item extends Type {
      code = str();
    }

    const db = MySQLConnection.new([Item], fake(info([
      { table: "item", column: "id", type: "int", nullable: "NO" }
    ])).pool);

    await expect(db.verify()).rejects.toThrow('Column "code" does not exist in table item');
    await expect(db.plan()).resolves.toMatchObject({ problems: ['Column "code" in table item is NOT NULL without a default and cannot be added to existing rows.'] });
    await db.close();
  })

  it("will refuse to sync twice or without a fix", async () => {
    class Item extends Type {}

    const db = MySQLConnection.new([Item], fake().pool);

    await expect(db.sync(false)).rejects.toThrow("Table item does not exist.");
    await db.sync();
    await expect(db.sync()).rejects.toThrow("Connection is already active.");
    await db.close();
  })
})

describe("pool", () => {
  it("will not end a pool passed in", async () => {
    class Thing extends Type {}

    const { pool } = fake();
    const db = MySQLConnection.new([Thing], pool);

    await db.close();

    expect(pool.end).not.toHaveBeenCalled();
  })

  it("will end a pool it created", async () => {
    vi.resetModules();
    vi.doMock("mysql2/promise", () => ({ createPool: vi.fn(() => fake().pool) }));

    const { MySQLConnection } = await import('./MySQLConnection');
    const { createPool } = await import('mysql2/promise') as any;

    class Thing extends Type {}

    const db = MySQLConnection.new([Thing], "mysql://localhost/app");

    await db.close();

    expect(createPool).toHaveBeenCalledWith({ uri: "mysql://localhost/app" });
    expect(createPool.mock.results[0].value.end).toHaveBeenCalled();

    vi.doUnmock("mysql2/promise");
  })

  it("will throw if mysql2 is missing", async () => {
    vi.resetModules();
    vi.doMock("mysql2/promise", () => { throw new Error("not found") });

    const { MySQLConnection } = await import('./MySQLConnection');

    class Thing extends Type {}

    const db = MySQLConnection.new([Thing], {});

    await expect(db.query("SELECT 1")).rejects.toThrow("Attempted to load mysql2 but failed");

    vi.doUnmock("mysql2/promise");
  })
})

describe.skipIf(!url)("live", () => {
  let admin: Pool;
  let current: Connection | undefined;

  class TestConnection extends MySQLConnection {
    constructor(using: Connection.Types){
      super(using, url!);
      current = this;
    }
  }

  beforeAll(async () => {
    const { createPool } = await import('mysql2/promise');

    admin = createPool({ uri: url, multipleStatements: true });
  });

  afterEach(async () => {
    await current?.close();
    current = undefined;

    const [rows] = await admin.query("SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()") as any;

    if (rows.length)
      await admin.query(`SET FOREIGN_KEY_CHECKS = 0; DROP TABLE ${rows.map((x: any) => `\`${x.name}\``).join(", ")}; SET FOREIGN_KEY_CHECKS = 1;`);
  });

  afterAll(() => admin?.end());

  describe("rows", () => {
    class Author extends Type {
      name = str();
    }

    class Post extends Type {
      author = one(Author);
      title = str();
      score = num({ type: "numeric", precision: 6, scale: 2, nullable: true });
      live = bool();
      tags = json<string[]>(orNull);
      at = date.created();
      day = date({ type: "date", nullable: true });
      time = date({ type: "time", nullable: true });
      ms = date({ type: "ms", nullable: true });
    }

    it("will round trip values", async () => {
      await TestConnection.new([Author, Post]);

      const author = await Author.insert({ name: "Gabe" });
      const day = new Date(2024, 4, 3);
      const moment = new Date("2024-05-03T10:20:30.456Z");

      const post = await Post.insert({
        author: author.id,
        title: "back\\slash 'quote'",
        score: 12.5,
        live: true,
        tags: ["a", "b"],
        day,
        time: new Date("1970-01-01T10:20:30Z"),
        ms: moment
      });

      expect(post).toMatchObject({
        id: 1,
        author: 1,
        title: "back\\slash 'quote'",
        score: 12.5,
        live: true,
        tags: ["a", "b"],
        day,
        time: new Date("1970-01-01T10:20:30Z"),
        ms: moment
      });

      expect(Math.abs(post.at.getTime() - Date.now())).toBeLessThan(5000);
      await expect(Post.one(1)).resolves.toEqual(post);
    })

    it("will update and delete by id", async () => {
      await TestConnection.new([Author]);
      await Author.insert({ name: "a" });

      const author = await Author.get(1);

      await author.set({ name: "b" });
      await expect(Author.one(1)).resolves.toEqual({ id: 1, name: "b" });

      await author.delete();
      await expect(Author.find()).resolves.toEqual([]);
    })

    it("will match a literal with a backslash", async () => {
      await TestConnection.new([Author]);
      await Author.insert({ name: "x\\" });
      await Author.insert({ name: "y" });

      const query = Query(where => {
        const author = where(Author);

        where(author.name).equal("x\\' OR 1=1 --");
      });

      await expect(query).resolves.toBe(0);
      await expect(Query(where => { where(where(Author).name).equal("x\\"); })).resolves.toBe(1);
    })
  })

  describe("query", () => {
    class Foo extends Type {
      name = str();
      rank = num({ nullable: true });
    }

    class Bar extends Type {
      foo = one(Foo);
      color = str();
    }

    it("will join input data", async () => {
      await TestConnection.new([Foo]);
      await Foo.insert({ name: "a" });
      await Foo.insert({ name: "b" });

      const query = Query(where => {
        const foo = where(Foo);
        const input = where([{ name: "b" }, { name: "c" }]);

        where(foo.name).equal(input.name);

        return foo.id;
      });

      await expect(query).resolves.toEqual([2]);
    })

    it("will insert from data", async () => {
      await TestConnection.new([Foo]);

      await Query(where => {
        const input = where([{ name: "a", rank: 1 }, { name: "b", rank: 2 }]);

        where(Foo, { name: input.name, rank: input.rank });
      });

      await expect(Foo.one(1)).resolves.toEqual({ id: 1, name: "a", rank: 1 });
      await expect(Foo.one(2)).resolves.toEqual({ id: 2, name: "b", rank: 2 });
    })

    it("will update and delete across a join", async () => {
      await TestConnection.new([Foo, Bar]);
      await Foo.insert({ name: "a" });
      await Bar.insert({ foo: 1, color: "red" });
      await Bar.insert({ foo: 1, color: "blue" });

      const updated = Query(where => {
        const bar = where(Bar);

        where(bar.color).equal("red");
        where(bar.foo).update({ rank: 5 });
        where(bar).update({ color: "green" });
      });

      await expect(updated).resolves.toBe(2);
      await expect(Foo.one(1)).resolves.toEqual({ id: 1, name: "a", rank: 5 });

      const removed = Query(where => {
        const bar = where(Bar);

        where(bar.foo.rank).equal(5);
        where(bar).delete();
      });

      await expect(removed).resolves.toBe(2);
      await expect(Bar.find()).resolves.toEqual([]);
    })

    it("will page results", async () => {
      await TestConnection.new([Foo]);

      for (const name of ["a", "b", "c", "d"])
        await Foo.insert({ name });

      const query = Query(function(where){
        const foo = where(Foo);

        where(foo.id).asc();
        where(2);
        this.offset = 1;

        return foo.name;
      });

      await expect(query).resolves.toEqual(["b", "c"]);
    })

    it("will throw returning an insert across joins", async () => {
      await TestConnection.new([Foo, Bar]);

      expect(() => Query(where => {
        const foo = where(Foo);

        return where(Bar, { foo: foo.id, color: "x" });
      })).toThrow("MySQL cannot return rows from an insert across joined tables.");
    })
  })

  describe("conflict", () => {
    class Asset extends Type {
      id = str({ primary: true });
      file = str({ unique: true });
      made = num();
    }

    class Tally extends Type {
      name = str({ unique: true });
      seen = num();
    }

    class Account extends Type {
      name = str();
    }

    class Pick extends Type {
      id = key(() => [this.account, this.kind]);
      account = one(Account);
      kind = str();
      note = str(orNull);
    }

    it("will update a conflicting row", async () => {
      await TestConnection.new([Asset]);
      await Asset.insert({ id: "a", file: "one", made: 1 });

      await expect(Asset.insert({ id: "a", file: "two", made: 2 }, { conflict: "update", keep: ["made"] }))
        .resolves.toEqual({ id: "a", file: "two", made: 1 });
    })

    it("will ignore a conflicting row", async () => {
      await TestConnection.new([Asset]);
      await Asset.insert({ id: "a", file: "one", made: 1 });

      await expect(Asset.insert({ id: "b", file: "one", made: 2 }, { conflict: "ignore", on: "file" })).resolves.toBeUndefined();
      await expect(Asset.find()).resolves.toEqual([{ id: "a", file: "one", made: 1 }]);
    })

    it("will return the existing serial id", async () => {
      await TestConnection.new([Tally]);
      await Tally.insert({ name: "a", seen: 1 });
      await Tally.insert({ name: "b", seen: 1 });

      await expect(Tally.insert({ name: "a", seen: 2 }, { conflict: "update", on: "name" }))
        .resolves.toEqual({ id: 1, name: "a", seen: 2 });
    })

    it("will round trip a composite key", async () => {
      await TestConnection.new([Account, Pick]);
      await Account.insert({ name: "Gabe" });
      await Pick.insert({ account: 1, kind: "a", note: "first" });

      await expect(Pick.insert({ account: 1, kind: "a", note: "second" }, { conflict: "update" }))
        .resolves.toMatchObject({ note: "second" });

      const pick = await Pick.get([1, "a"]);

      await pick.delete();
      await expect(Pick.find()).resolves.toEqual([]);
    })
  })

  describe("transaction", () => {
    class Item extends Type {
      name = str();
    }

    it("will commit", async () => {
      const db = await TestConnection.new([Item]);

      await db.transaction(async () => {
        await Item.insert({ name: "a" });
        await Item.insert({ name: "b" });
      });

      await expect(Item.find()).resolves.toHaveLength(2);
    })

    it("will roll back", async () => {
      const db = await TestConnection.new([Item]);

      await Item.insert({ name: "kept" });
      await expect(db.transaction(async () => {
        await Item.insert({ name: "lost" });
        throw new Error("nope");
      })).rejects.toThrow("nope");

      await expect(Item.find()).resolves.toEqual([{ id: 1, name: "kept" }]);
    })
  })

  describe("sync", () => {
    it("will not recreate tables", async () => {
      class User extends Type {
        name = str();
        email = str(index);
        active = bool();
        score = num({ type: "double" });
        born = date({ nullable: true });
      }

      await TestConnection.new([User]);
      await current!.close();

      const db = new MySQLConnection([User], url!);

      current = db;

      await expect(db.plan()).resolves.toEqual({ steps: [], problems: [] });
    })

    it("will throw for a missing table without fix", async () => {
      class Missing extends Type {}

      const db = new MySQLConnection([Missing], url!);

      current = db;

      await expect(db.sync(false)).rejects.toThrow("Table missing does not exist.");
    })

    it("will add columns and indexes", async () => {
      class User extends Type {
        name = str({ type: "varchar", length: 255 });
      }

      await TestConnection.new([User]);
      await User.insert({ name: "Gabe" });
      await current!.close();

      class User2 extends Type {
        static table = "user";
        name = str(index);
        nick = str({ fallback: "none" });
        age = num({ nullable: true });
      }

      await TestConnection.new([User2]);
      await expect(User2.one(1)).resolves.toEqual({ id: 1, name: "Gabe", nick: "none", age: undefined });
    })

    it("will report and repair drift", async () => {
      class User extends Type {
        name = str({ nullable: true });
      }

      await TestConnection.new([User]);
      await current!.close();

      class User2 extends Type {
        static table = "user";
        name = num();
      }

      const db = new MySQLConnection([User2], url!);

      current = db;

      await expect(db.sync()).rejects.toThrow(`Column "name" in table user has incorrect nullable value`);
      await db.sync(true, true);
      await User2.insert({ name: 3 });
      await expect(User2.one(1)).resolves.toEqual({ id: 1, name: 3 });
    })

    it("will leave an optional column absent if it cannot be added", async () => {
      class User extends Type {
        name = str();
      }

      await TestConnection.new([User]);
      await current!.close();

      class User2 extends Type {
        static table = "user";
        name = str();
        tag = str({ optional: true });
      }

      await TestConnection.new([User2]);

      expect(User2.fields.get("tag")!.absent).toBe(true);
    })
  })
})
