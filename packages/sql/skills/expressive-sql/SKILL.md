---
name: expressive-sql
description: Expressive ORM on SQL (@expressive/sql) - SQLiteConnection with a built-in or custom Engine, sync and plan, the expressive sql CLI, the sql.* datatype shorthand and codecs, and the SQL Connection and Generator base for dialects. Use when connecting entities to SQLite, Cloudflare D1 or libSQL and Turso, choosing column datatypes, syncing or checking a schema, plugging in a SQLite host, or writing a SQL driver.
---

# @expressive/sql

Expressive ORM on SQL, with embedded SQLite. Re-exports `@expressive/orm` - entities, fields, relations, `Query` and transactions are in `expressive-orm`. Apps import everything from `@expressive/sql`; driver seams come from `@expressive/orm/driver`.

```bash
npm install @expressive/sql @expressive/mvc
```

SQLite is built into Bun (`bun:sqlite`) and Node 24 (`node:sqlite`). Elsewhere add one of `better-sqlite3`, `sqlite3` or `@libsql/client` (0.18 or later); the first found is used. For Postgres and live rows install `@expressive/postgres` (skill `expressive-postgres`), which re-exports this package.

## Connect

```ts
import { SQLiteConnection, Type, str } from '@expressive/sql';

class User extends Type {
  name = str();
}

const db = await SQLiteConnection.new([User], "app.db");   // omit the filename for in-memory

await db.close();
```

Connections enforce foreign keys. SQLite has no live rows.

`sync` covers the classes passed to `new`. `static connection = db` binds another class without syncing it. `db.schema` is the DDL.

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

### Hosts

In place of the filename, `new` also takes a D1 binding, a libSQL `Client` or a libSQL address, told apart by shape. A given binding or client is used as is; `close()` leaves it open.

On Workers, open once from the first request's binding, and drop it when `sync` fails - a second `new` while entities hold a connection throws:

```ts
let ready: Promise<unknown> | undefined;

function open(DB: D1Database){
  const db = SQLiteConnection.new([User], DB);

  return Promise.resolve(db).catch(async error => {
    ready = undefined;
    await db.close();
    throw error;
  });
}

export default {
  async fetch(request: Request, env: { DB: D1Database }) {
    await (ready ??= open(env.DB));
    return Response.json(await User.query());
  }
};
```

- D1 - `sync` applies as one batch, a few round trips per table each cold start. `transaction` throws. Foreign keys stay on, so `sync(true, true)` refuses a rebuild.
- libSQL address - `libsql:`, `https:`, `http:`, `ws:` or `wss:` opens `@libsql/client` 0.18+; token as `?authToken=`. Loaded at runtime, so under a bundler (Workers) pass a `createClient` client instead. An `undefined` or empty source opens in memory - check an address from the environment first.
- Every libSQL client - each `transaction` is a libSQL write transaction (`BEGIN IMMEDIATE`) holding the connection's lock, so transactions run one at a time app-wide. `sync` is one batch; a rebuild runs through `client.migrate`, foreign keys off for it alone. Local libSQL enforces foreign keys by default; remote gets the server's setting.
- A `migrate` rebuild refuses dangling rows (`foreign_key_check`) even where foreign keys are off, and leaves them on.

## Sync

Awaiting a connection runs `sync`:

- Missing tables are created, missing columns and indexes added, existing ones checked against the classes.
- A new column reads `undefined` or its `fallback` on old rows. One that cannot fill existing rows - primary, `UNIQUE`, `NOT NULL` without a `fallback` or defaulting to now - is reported and nothing changes. A nullable column defaulting to now is added without the default; inserts fill it.
- Type and nullability drift is reported. `sync(true, true)` rebuilds the table, refusing while a row would not fit or a value would not convert. A rebuild keeps columns not on the class, indexes and triggers, but not UNIQUE or REFERENCES on columns the class doesn't declare, and refuses while any row references a missing one.
- `static schema` is reported - SQLite has none.
- A relation column missing while `<table>_id` exists is reported, not added - set `{ column: "<table>_id" }` to keep the old one.
- `sync(false)` only verifies. `plan(force?)` returns `{ steps, problems }` - each step with `action`, `reason` and `sql` - without doing it. A sync applies in one transaction.

### Command line

```sh
expressive sql check src/db.ts        # list what sync would change; exit 1 if anything would
expressive sql sync src/db.ts         # create missing tables, columns and indexes
expressive sql sync --force src/db.ts # also rebuild drifted columns
```

The entry is the module that creates the connections - imported with `sync` held back, so `await Connection.new()` resolves without touching the database; the command plans and syncs each connection created. A TypeScript entry needs Bun (`bunx --bun expressive ...`) or Node 22.18+.

## Datatypes

Datatypes are portable - orm declares them, and each connection maps them to its storage. `sql.*` is shorthand for the declaration: `str(sql.varchar(40))` is `str({ type: "varchar", length: 40 })`. A schema module importing only `@expressive/orm` writes the object form and binds here unchanged.

| Helper | `sql.*` | SQLite |
|---|---|---|
| `str` | `text` (default), `varchar(n)`, `char(n)`, `uuid` | TEXT |
| `num` | `integer` (default), `smallint`, `bigint`, `real`, `double`, `numeric(p, s)`, `decimal(p, s)` | INTEGER, REAL, NUMERIC |
| `bool` | - (boolean) | INTEGER, 1 or 0 |
| `date` | `timestamp` (default), `date`, `time` | TEXT - ISO 8601 UTC to the ms; `date` as the local day `YYYY-MM-DD`; `time` as UTC `HH:MM:SS` |
| `json` | - | TEXT |
| `one` | - (the related key's) | the key's |

```ts
import { Type, date, key, num, sql, str } from '@expressive/sql';

class Product extends Type {
  id = key(sql.uuid);   // UUIDv7 on insert
  code = str(sql.char(3));
  price = num(sql.numeric(10, 2));
  seen = date(null);
  edited = date.updated();
}
```

- `num()` is a 32-bit integer - a fraction or a value outside 32-bit range throws on write. `sql.bigint` for large integers, `sql.real` or `sql.numeric(p, s)` for fractions.
- A datatype of another helper, like `num(sql.text)`, is a type error.
- Options a factory doesn't take go in an object - `date({ type: "timestamp", precision: 3 })`.
- `sql.now` is the database's current time in the column's storage - as a `fallback`, in a statics write or comparison (`lessThan(sql.now)`), or in a `Query`. Statics read it from the app's clock. `"NOW"` is a deprecated alias.
- Writes are checked by the field on every connection - `varchar` and `char` length, integer ranges, decimal precision and scale. The SQL floor checks again before storing, so rows forwarded from a client meet the same rules.
- `Connection.new` throws for a datatype the connection can't store - `SQLiteConnection can't store json type 'blob' (Doc.blob).`
- A `date` type is a calendar day: a Date gives its local day, `"YYYY-MM-DD"` is that day, and it reads back as local midnight. It crosses the floor and is stored as `YYYY-MM-DD`, so zones never shift it. `sql.now` on it is the database's UTC day. A `time` is a UTC time of day, crossing as a Date on 1970-01-01 UTC.
- Storage-only types are gone: store epoch time as `num(sql.bigint)`, yes/no text as `str`.

`codecs` maps each base helper to how SQL stores it (`Connection.Codec`). A dialect extends it - `new Map([...codecs, [date, myDateCodec]])` - and returns it from a protected `codecs` getter.

## SQL drivers

`Connection` from `@expressive/sql` implements orm's floor over `Query`. A dialect extends it and supplies `schema`, `prepare(builder)` (rendering with a `Generator` subclass), `sync(fix?, force?)` and `plan(force?)`; a protected `transact(fn)` enables `transaction(fn)`.

`Generator` renders a `Query` builder as SQL; `String(generator)` is the statement. A dialect overrides its protected hooks - `literal`, `insertWith`, `table`, `now` and `param` among them, each documented on `Generator`.

The builder and its values - `Builder`, `DataTable`, `DataField`, `Parameter`, `Computed`, `QueryTemplate`, `Where` - import from `@expressive/orm/driver`, not `@expressive/sql`. A dialect package therefore lists `@expressive/orm` as a direct dependency, at the range `@expressive/sql` depends on.
