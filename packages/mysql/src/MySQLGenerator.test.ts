import { describe, expect, it } from 'vitest';

import { bool, Builder, date, now, num, one, Parameter, Query, str, Type } from '@expressive/orm';
import type { Pool } from 'mysql2/promise';

import { MySQLConnection } from './MySQLConnection';
import { escape, MySQLGenerator, now as current } from './MySQLGenerator';

const pool = { getConnection(){}, query: async () => [[]] } as unknown as Pool;

abstract class Table extends Type {}

MySQLConnection.new([Table], pool);

function column(define: () => unknown){
  class Test extends Type {
    value = define();
  }

  return Test.fields.get("value")!;
}

function render(fn: (this: Builder) => void){
  const builder = new Builder();

  fn.call(builder);

  const generator = new MySQLGenerator(builder);

  return String(generator);
}

describe("now", () => {
  it("will match each date storage", () => {
    expect(current(column(() => date({ type: "ms" })))).toBe("CAST(UNIX_TIMESTAMP(NOW(3)) * 1000 AS SIGNED)");
    expect(current(column(() => date({ type: "seconds" })))).toBe("UNIX_TIMESTAMP()");
    expect(current(column(() => date({ type: "integer" })))).toBe("UNIX_TIMESTAMP()");
    expect(current(column(() => date({ type: "date" })))).toBe("UTC_DATE()");
    expect(current(column(() => date({ type: "time" })))).toBe("UTC_TIME()");
    expect(current(column(() => date({ type: "text" })))).toBe("DATE_FORMAT(UTC_TIMESTAMP(3), '%Y-%m-%dT%H:%i:%s.%fZ')");
    expect(current(column(() => date()))).toBe("UTC_TIMESTAMP(3)");
    expect(current()).toBe("UTC_TIMESTAMP(3)");
  })
})

describe("escape", () => {
  it("will double quotes and backslashes", () => {
    expect(escape("it's \\' x")).toBe("'it''s \\\\'' x'");
    expect(escape(1)).toBe(1);
  })

  it("will not let a backslash end a literal", () => {
    class Foo extends Table {
      name = str();
    }

    const sql = render(function(){
      const { name } = this.use(Foo) as any;

      this.field(name).equal("x\\' OR 1=1 --");
    });

    expect(sql).toMatchInlineSnapshot(`"SELECT COUNT(*) FROM \`foo\` WHERE \`foo\`.\`name\` = 'x\\\\'' OR 1=1 --'"`);
  })

  it("will quote identifiers with backticks", () => {
    expect(new MySQLGenerator(new Builder()).escape("a`b.c")).toBe("`a``b`.`c`");
  })
})

describe("select", () => {
  class Foo extends Table {
    name = str();
    rank = num({ nullable: true });
  }

  class Bar extends Table {
    foo = one(Foo);
    color = str();
  }

  it("will limit and offset", () => {
    const query = Query(function(where){
      const foo = where(Foo);

      where(foo.rank).over(1);
      where(foo.rank).asc();
      where(10);
      this.offset = 20;

      return foo.name;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        \`foo\`.\`name\`
      FROM
        \`foo\`
      WHERE
        \`foo\`.\`rank\` > 1
      ORDER BY
        \`foo\`.\`rank\` ASC
      LIMIT
        10
      OFFSET
        20"
    `);
  })

  it("will join and compare lists", () => {
    const query = Query(where => {
      const bar = where(Bar);

      where(bar.color).in(["red", "it's"]);
      where(bar.foo.rank).equal(null);

      return { color: bar.color, name: bar.foo.name };
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        \`bar\`.\`color\` AS "color",
        \`foo\`.\`name\` AS "name"
      FROM
        \`bar\`
        INNER JOIN \`foo\` ON \`foo\`.\`id\` = \`bar\`.\`foo_id\`
      WHERE
        \`bar\`.\`color\` IN ('red', 'it''s')
        AND \`foo\`.\`rank\` IS NULL"
    `);
  })

  it("will compare against now", () => {
    class Event extends Table {
      at = date({ nullable: true });
    }

    const query = Query(where => {
      const event = where(Event);

      where(event.at).under(now);
      where(event.at).not(null);
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "SELECT
        COUNT(*)
      FROM
        \`event\`
      WHERE
        \`event\`.\`at\` < UTC_TIMESTAMP(3)
        AND \`event\`.\`at\` IS NOT NULL"
    `);
  })

  it("will match nothing in an empty list", () => {
    const sql = render(function(){
      const { name, rank } = this.use(Foo) as any;

      this.field(name).in([]);
      this.filters.add(name, 'NOT IN', []);
      this.filters.add(rank, '!=', null);
    });

    expect(sql).toMatchInlineSnapshot(`"SELECT COUNT(*) FROM \`foo\` WHERE 1 = 0 AND 1 = 1 AND \`foo\`.\`rank\` IS NOT NULL"`);
  })

  it("will select without tables", () => {
    expect(render(function(){ this.commit(() => ({ one: 1 })); })).toMatchInlineSnapshot(`"SELECT 1 AS "one""`);
  })

  it("will match a pattern as given", () => {
    const sql = render(function(){
      const { name } = this.use(Foo) as any;

      this.filters.add(name, 'LIKE', "a\\%");
    });

    expect(sql).toMatchInlineSnapshot(`"SELECT COUNT(*) FROM \`foo\` WHERE \`foo\`.\`name\` LIKE 'a\\\\%'"`);
  })

  it("will alias a table joined twice", () => {
    class Post extends Table {
      author = one(Foo);
      editor = one(Foo);
    }

    const query = Query(where => {
      const post = where(Post);

      where(post.author.name).equal("a");
      where(post.editor.name).equal("b");
      where(post.editor).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "DELETE \`T2\`
      FROM
        \`post\`
        INNER JOIN \`foo\` ON \`foo\`.\`id\` = \`post\`.\`author_id\`
        INNER JOIN \`foo\` \`T2\` ON \`T2\`.\`id\` = \`post\`.\`editor_id\`
      WHERE
        \`foo\`.\`name\` = 'a'
        AND \`T2\`.\`name\` = 'b'"
    `);
  })

  it("will throw comparing null by order", () => {
    expect(() => Query(where => {
      const foo = where(Foo);

      where(foo.rank).over(null as any);
    })).toThrow("Cannot compare NULL with >");
  })

  it("will select from JSON_TABLE", () => {
    const query = Query(where => {
      const foo = where(Foo);
      const input = where([{ name: "a", rank: 1 }]);

      where(foo.name).equal(input.name);
      where(foo.rank).equal(input.rank);

      return foo.id;
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "WITH
        \`input\` AS (
          SELECT
            *
          FROM
            JSON_TABLE(
              ?,
              '$[*]' COLUMNS (
                \`name\` TEXT CHARACTER SET utf8mb4 PATH '$[0]',
                \`rank\` INTEGER PATH '$[1]'
              )
            ) AS \`rows\`
        )
      SELECT
        \`foo\`.\`id\`
      FROM
        \`foo\`
        INNER JOIN \`input\` ON \`foo\`.\`name\` = \`input\`.\`name\`
        AND \`foo\`.\`rank\` = \`input\`.\`rank\`"
    `);
  })

  it("will keep a declared collation in JSON_TABLE", () => {
    class Tag extends Table {
      label = str({ type: "varchar", length: 20, collate: "utf8mb4_bin" });
    }

    const query = Query(where => {
      const tag = where(Tag);
      const input = where([{ label: "a" }]);

      where(tag.label).equal(input.label);
    });

    expect(String(query)).toContain("`label` VARCHAR(20) COLLATE utf8mb4_bin PATH '$[0]'");
  })
})

describe("insert", () => {
  class Foo extends Table {
    name = str();
    flag = bool({ nullable: true });
    at = date({ nullable: true });
  }

  class Bar extends Table {
    foo = one(Foo);
    color = str();
  }

  it("will insert values", () => {
    const query = Query(where => void where(Foo, { name: "it's", flag: true, at: now }));

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        \`foo\` (\`name\`, \`flag\`, \`at\`)
      VALUES
        ('it''s', TRUE, UTC_TIMESTAMP(3))"
    `);
  })

  it("will insert defaults", () => {
    class Empty extends Table {}

    expect(render(function(){ this.use(Empty, {}) })).toMatchInlineSnapshot(`"INSERT INTO \`empty\` () VALUES ()"`);
  })

  it("will insert from a joined table", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(Bar, { foo: foo.id, color: "red" });
      where(foo.name).equal("Gabe");
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        \`bar\` (\`foo_id\`, \`color\`)
      SELECT
        \`foo\`.\`id\`,
        'red'
      FROM
        \`foo\`
      WHERE
        \`foo\`.\`name\` = 'Gabe'"
    `);
  })

  it("will insert from data", () => {
    const query = Query(where => {
      const input = where([{ name: "a" }, { name: "b" }]);

      where(Foo, { name: input.name });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "INSERT INTO
        \`foo\` (\`name\`)
      WITH
        \`input\` AS (
          SELECT
            *
          FROM
            JSON_TABLE(
              ?,
              '$[*]' COLUMNS (\`name\` TEXT CHARACTER SET utf8mb4 PATH '$[0]')
            ) AS \`rows\`
        )
      SELECT
        \`input\`.\`name\`
      FROM
        \`input\`"
    `);
  })

  it("will throw for an empty insert across joins", () => {
    class Empty extends Table {}

    expect(() => Query(where => {
      where(Foo);
      where(Empty, {});
    })).toThrow("Insert into empty for each joined row needs at least one value.");
  })
})

describe("upsert", () => {
  class Asset extends Table {
    id = str({ primary: true });
    file = str({ unique: true });
    made = num();
  }

  class Serial extends Table {
    name = str({ unique: true });
    seen = num();
  }

  function upsert(type: typeof Type, data: Record<string, unknown>, conflict: (fields: Map<string, any>) => Builder["conflict"]){
    return render(function(){
      this.conflict = conflict(this.tables.get(this.use(type, data))!.fields);
    });
  }

  it("will update columns on a duplicate key", () => {
    const sql = upsert(Asset, { id: "a", file: "b", made: 1 }, fields => ({
      on: [fields.get("id")],
      update: [fields.get("file")],
      set: new Map([[fields.get("made"), 5]])
    }));

    expect(sql).toMatchInlineSnapshot(`"INSERT INTO \`asset\` (\`id\`, \`file\`, \`made\`) VALUES ('a', 'b', 1) ON DUPLICATE KEY UPDATE \`file\` = VALUES(\`file\`), \`made\` = 5"`);
  })

  it("will keep a row with nothing to update", () => {
    const sql = upsert(Asset, { id: "a", file: "b", made: 1 }, fields => ({ on: [fields.get("id")], update: [], set: new Map() }));

    expect(sql).toMatchInlineSnapshot(`"INSERT INTO \`asset\` (\`id\`, \`file\`, \`made\`) VALUES ('a', 'b', 1) ON DUPLICATE KEY UPDATE \`id\` = \`id\`"`);
  })

  it("will capture an incrementing id", () => {
    const sql = upsert(Serial, { name: "a", seen: 1 }, fields => ({ on: [fields.get("name")], update: [fields.get("seen")], set: new Map() }));

    expect(sql).toMatchInlineSnapshot(`"INSERT INTO \`serial\` (\`name\`, \`seen\`) VALUES ('a', 1) ON DUPLICATE KEY UPDATE \`id\` = LAST_INSERT_ID(\`id\`), \`seen\` = VALUES(\`seen\`)"`);
  })

  it("will ignore a duplicate", () => {
    const sql = upsert(Asset, { id: "a", file: "b", made: 1 }, fields => ({ on: [fields.get("id")], set: new Map() }));

    expect(sql).toMatchInlineSnapshot(`"INSERT IGNORE INTO \`asset\` (\`id\`, \`file\`, \`made\`) VALUES ('a', 'b', 1)"`);
  })
})

describe("update", () => {
  class Foo extends Table {
    value = str({ nullable: true });
    color = str();
  }

  class Bar extends Table {
    foo = one(Foo);
    value = str();
  }

  it("will update one table", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.color).equal("red");
      where(foo).update({ value: null, color: "blue" });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        \`foo\`
      SET
        \`value\` = NULL,
        \`color\` = 'blue'
      WHERE
        \`foo\`.\`color\` = 'red'"
    `);
  })

  it("will update joined tables together", () => {
    const query = Query(where => {
      const bar = where(Bar);

      where(bar.foo.color).equal("red");
      where(bar.foo).update({ value: bar.value });
      where(bar).update({ value: "seen" });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        \`bar\`
        INNER JOIN \`foo\` ON \`foo\`.\`id\` = \`bar\`.\`foo_id\`
      SET
        \`foo\`.\`value\` = \`bar\`.\`value\`,
        \`bar\`.\`value\` = 'seen'
      WHERE
        \`foo\`.\`color\` = 'red'"
    `);
  })

  it("will anchor on the first table", () => {
    const query = Query(where => {
      const bar = where(Bar);

      where(bar.foo).update({ color: "blue" });
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "UPDATE
        \`bar\`
        INNER JOIN \`foo\` ON \`foo\`.\`id\` = \`bar\`.\`foo_id\`
      SET
        \`foo\`.\`color\` = 'blue'"
    `);
  })

  it("will throw for an empty update", () => {
    expect(() => Query(where => {
      where(where(Foo)).update({});
    })).toThrow("Update contains no values.");
  })
})

describe("delete", () => {
  class Foo extends Table {
    color = str();
  }

  class Bar extends Table {
    foo = one(Foo);
  }

  it("will delete from one table", () => {
    const query = Query(where => {
      const foo = where(Foo);

      where(foo.color).equal("red");
      where(foo).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "DELETE FROM
        \`foo\`
      WHERE
        \`foo\`.\`color\` = 'red'"
    `);
  })

  it("will delete across a join", () => {
    const query = Query(where => {
      const bar = where(Bar);

      where(bar.foo.color).equal("red");
      where(bar).delete();
    });

    expect(String(query)).toMatchInlineSnapshot(`
      "DELETE \`bar\`
      FROM
        \`bar\`
        INNER JOIN \`foo\` ON \`foo\`.\`id\` = \`bar\`.\`foo_id\`
      WHERE
        \`foo\`.\`color\` = 'red'"
    `);
  })
})

describe("params", () => {
  class Foo extends Table {
    name = str();
    rank = num();
  }

  it("will record params in the order they render", () => {
    const builder = new Builder();
    const { fields } = builder.tables.get(builder.use(Foo))!;
    const where = new Parameter(0);
    const set = new Parameter(1);

    builder.params.push(where, set);
    builder.filters.add(fields.get("name")!, '=', where);
    builder.updates.set(builder.tables.values().next().value!, new Map([[fields.get("rank")!, set]]));

    const generator = new MySQLGenerator(builder);

    expect(String(generator)).toMatchInlineSnapshot(`"UPDATE \`foo\` SET \`rank\` = ? WHERE \`foo\`.\`name\` = ?"`);
    expect(generator.placed).toEqual([set, where]);
  })
})
