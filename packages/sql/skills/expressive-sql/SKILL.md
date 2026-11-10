---
name: expressive-sql
description: Expressive ORM on SQL (@expressive/sql) - SQLiteConnection with a built-in or custom Engine, sync and plan, the expressive sql CLI, the sql.* datatype vocabulary and validation, and the SQL Connection and Generator base for dialects. Use when connecting entities to SQLite, choosing column datatypes, syncing or checking a schema, plugging in a SQLite host, or writing a SQL driver.
---

# @expressive/sql

Expressive ORM on SQL, with embedded SQLite. Re-exports `@expressive/orm` - entities, fields, relations, `Query` and transactions are in `expressive-orm`. Import everything from `@expressive/sql`.

```bash
npm install @expressive/sql @expressive/mvc
```

SQLite is built into Bun (`bun:sqlite`) and Node 24 (`node:sqlite`). Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client`; the first found is used. For Postgres and live rows install `@expressive/postgres` (skill `expressive-postgres`), which re-exports this package.

## Connect

```ts
import { SQLiteConnection, Type, str } from '@expressive/sql';

class User extends Type {
  name = str();
}

const db = await SQLiteConnection.new([User], "app.db");   // omit the filename for in-memory

await db.close();
```

Connections enforce foreign keys. SQLite has no live rows - neither `node:sqlite` nor `bun:sqlite` exposes an update hook.

### Engine

In place of the filename, pass an `Engine` for a SQLite the built-in loader can't open - any object with these, each async:

```ts
import type { Engine } from '@expressive/sql';

const engine: Engine = {
  all: (sql, params) => ...,    // rows
  get: (sql, params) => ...,    // first row
  run: (sql, params) => ...,    // { changes }
  exec: (sql) => ...,
  close: () => ...,
};

const db = await SQLiteConnection.new([User], engine);
```

A given engine is used as is - turn on foreign keys yourself where the host doesn't - and `close()` leaves it open.

Two optional members, for hosts without `BEGIN` and `COMMIT` on one connection:

- `transaction()` - resolves a session, the four statements plus `commit()` and `rollback()`. Every statement inside `db.transaction(fn)` runs on it.
- `batch(sql: string[])` - runs statements atomically; `sync` applies through it. A table rebuild in a batch needs foreign keys off, or dropping the old table cascades; an engine that keeps them on refuses it.

## Sync

Awaiting a connection runs `sync`:

- Missing tables are created, missing columns and indexes added, existing ones checked against the classes.
- A new column reads `undefined` or its `fallback` on old rows. One that cannot fill existing rows - primary, `UNIQUE`, `NOT NULL` without a `fallback` or defaulting to now - is reported and nothing changes. A nullable column defaulting to now is added without the default; inserts fill it.
- Type and nullability drift is reported. `sync(true, true)` rebuilds the table, refusing while a row would not fit or a value would not convert. A rebuild keeps columns not on the class, indexes and triggers, but not UNIQUE or REFERENCES on columns the class doesn't declare, and refuses while any row references a missing one.
- `sync(false)` only verifies. `plan(force?)` returns `{ steps, problems }` - each step with `action`, `reason` and `sql` - without doing it. A sync applies in one transaction.

### Command line

```sh
expressive sql check src/db.ts        # list what sync would change; exit 1 if anything would
expressive sql sync src/db.ts         # create missing tables, columns and indexes
expressive sql sync --force src/db.ts # also rebuild drifted columns
```

The entry is the module that creates the connections - imported with `sync` held back, so `await Connection.new()` resolves without touching the database; the command plans and syncs each connection created. A TypeScript entry needs Bun (`bunx --bun expressive ...`) or Node 22.18+.

## Datatypes

`sql.*` picks a column's type; a factory takes its size. A config is portable - the same class syncs on SQLite and Postgres.

| Helper | `sql.*` | SQLite |
|---|---|---|
| `str` | `text` (default), `varchar(n)`, `char(n)`, `uuid` | TEXT |
| `num` | `integer` (default), `smallint`, `bigint`, `real`, `float`, `double`, `numeric(p, s)`, `decimal(p, s)` | INTEGER, REAL, NUMERIC |
| `bool` | `boolean` (default), `integer` (1/0), `text` / `varchar(n)` with `either` | INTEGER, TEXT |
| `date` | `timestamp` (default), `date`, `time`, `ms` (epoch ms), `seconds` or `integer` (epoch s), `text` | TEXT, INTEGER |
| `one` | `integer` (default), `bigint` | INTEGER |

```ts
import { Type, bool, date, key, num, sql, str } from '@expressive/sql';

class Product extends Type {
  id = key(sql.uuid);   // UUIDv7 on insert
  code = str(sql.char(3));
  price = num(sql.numeric(10, 2));
  listed = bool(sql.text, { either: ["yes", "no"] });
  seen = date(sql.ms, null);
  edited = date.updated(sql.ms);
}
```

- A datatype of another helper, like `num(sql.text)`, is a type error.
- Options a factory doesn't take go in an object - `date({ type: "timestamp", precision: 3 })`.
- `sql.now` is the database's current time in the column's storage - as a `fallback`, in a statics write or comparison (`lessThan(sql.now)`), or in a `Query`. Statics read it from the app's clock. `"NOW"` is a deprecated alias.
- Every connection validates on write - `varchar` and `char` length, integer ranges, `numeric` precision and scale.

Add a datatype by augmenting the helper's `Types`:

```ts
import { StringColumn, Type, str } from '@expressive/sql';

declare module '@expressive/orm' {
  namespace str {
    interface Inet extends StringColumn { type: "inet" }
    interface Types { inet: Inet }
  }
}

class Device extends Type {
  address = str({ type: "inet" });
}
```

`StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn` are the column classes behind `str`, `num`, `bool`, `date` and `one`.

## SQL drivers

`Connection` from `@expressive/sql` implements orm's floor over `Query`. A dialect extends it and supplies `schema`, `prepare(builder)` (rendering with a `Generator` subclass), `sync(fix?, force?)` and `plan(force?)`; a protected `transact(fn)` enables `transaction(fn)`.

`Generator` renders a `Query` builder as SQL; `String(generator)` is the statement. A dialect overrides its protected hooks, among them:

- `literal(value)` - every literal in values, `SET` and `WHERE`.
- `insertWith(cte, into, select)` - places a data CTE in an insert.
- `table(table)` - a table with its alias, for `FROM`, joins, `UPDATE` and `DELETE`.
- `now(field)`, `param(parameter)` - the current time and a placeholder.
