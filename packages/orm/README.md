# @expressive/orm

The core of Expressive ORM: entities on [`@expressive/mvc`](https://github.com/gabeklein/expressive-mvc) Model, the driver contract, `Query` and an in-memory driver. No SQL.

Install [`@expressive/sql`](https://github.com/gabeklein/expressive-orm/tree/main/packages/sql) instead - it depends on and re-exports this package and adds SQLite. Install this one directly when writing a driver or running without SQL. Full guide: [README](https://github.com/gabeklein/expressive-orm#readme).

```sh
npm install @expressive/orm @expressive/mvc
```

## memory()

A connection keeping rows in arrays. It runs the floor and `Query` - joins, filters, order, paging, projections, math, inserts, updates and deletes - but not raw SQL templates, and reports every write for live rows. For tests and prototypes.

```ts
import { Query, Type, memory, one, str } from '@expressive/orm';

class User extends Type {
  static connection = memory();
  name = str();
}

class Post extends Type {
  static connection = User.connection;
  author = one(User);
  title = str();
}

const gabe = await User.insert({ name: "Gabe" });
await Post.insert({ author: gabe, title: "Hello" });

gabe.get(({ name }) => console.log(name));

await Query(where => {
  const user = where(User);

  where(user.name).equal("Gabe");
  where(user).update({ name: "Gabriel" });
});

const titles = await Query(where => where(Post).title);
console.log(titles, String(Query(where => where(Post).author.name)));
```

The `Query` update reaches `gabe` through `subscribe`, so the effect logs `Gabriel`. `String(query)` lists the query's intent.

## The contract

`Connection` is an abstract `Model`. `Connection.new(types, ...)` binds each class's `Type.connection`; `close()` destroys the connection, its identity map and every entity loaded through it, and unbinds the classes. Awaiting a connection runs `sync` once, when it has one.

The floor, keyed by table name and the class's primary column:

| Method | Does |
|---|---|
| `select(table, constraints, limit?, offset?)` | rows matching `[column, op, value]` tuples |
| `insert(table, data, returns?)` | inserts a row, returning it when asked |
| `update(table, id, data)` | updates one row |
| `remove(table, id)` | deletes one row |

Optional:

- `prepare(builder)` - runs a `Query`; `Builder` holds its tables, joins, filters, order, limit, offset, selection and writes. Without it `Query` and `Type.query` throw.
- `subscribe(listener)` - reports `{ table, op: "insert" | "update" | "delete", id, row? }` for changes made anywhere; returns a stop function. A loaded entity takes an update into fields not changed locally, reloading the row through `select` when `row` is absent; a delete destroys it.
- `sync(fix?)` - checks the schema, creating what is missing when `fix`.

Generator seams for SQL drivers: `Builder`, `Computed`, `DataField`, `DataTable`, `Parameter`, `QueryTemplate`.
