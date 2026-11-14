---
name: expressive-mysql
description: MySQL and MariaDB for Expressive ORM (@expressive/mysql) - MySQLConnection over mysql2, sync through information_schema, upserts without RETURNING, joined updates and deletes, pooled transactions. Use when connecting entities to MySQL 8.0.19+ or MariaDB 10.6+, or debugging sync, inserts that return rows, or conflicts there.
---

# @expressive/mysql

MySQL and MariaDB connection for Expressive ORM, on `mysql2`. Re-exports `@expressive/sql`, which re-exports `@expressive/orm` - import everything from `@expressive/mysql`. Entities, `Query` and transactions are in `expressive-orm`; datatypes, `sync` and the CLI in `expressive-sql`.

```bash
npm install @expressive/mysql @expressive/mvc mysql2
```

MySQL 8.0.19+ or MariaDB 10.6+ - input data renders through `JSON_TABLE`, and column defaults are expressions.

## Connect

```ts
import { MySQLConnection, Type, str } from '@expressive/mysql';

class User extends Type {
  name = str();
}

const db = await MySQLConnection.new([User], "mysql://root@localhost/app");
```

- `MySQLConnection.new(types, config)` - a connection string, a `mysql2` `PoolOptions` or a `mysql2/promise` `Pool`. The same class runs on MariaDB.
- `close()` ends a pool the connection created; one passed in stays open.
- `DATETIME` and `DATE` read as strings whatever the pool's `timezone` or `dateStrings`, so a passed pool needs no setup.

## Sync

As on SQLite (`expressive-sql/SKILL.md#sync`), with these differences: tables are read from `information_schema` in the connection's current database; missing columns get their foreign keys; a missing `optional` column that cannot be added reads `undefined`; `sync(true, true)` runs `MODIFY COLUMN` on a drifted column, refusing a NULL under `NOT NULL`. `static schema` is rejected.

Steps run one statement at a time and MySQL commits each DDL statement - a `sync` that fails partway leaves the steps before it applied. `plan()` shows them first.

An incrementing `id` is `AUTO_INCREMENT`.

## Datatypes

Column configs are shared with SQLite (`expressive-sql/SKILL.md#datatypes`). MySQL stores some differently:

- `str()` is `TEXT`, but `VARCHAR(255)` when it is a key, a key part, `unique` or `index` - MySQL can't index `TEXT` without a prefix. Adding `index` to an existing `TEXT` column reports type drift.
- `uuid` is `CHAR(36)`; `collate` renders unquoted.
- `date()` is `DATETIME(3)` holding UTC - `precision` sets the digits. `timezone` is ignored.
- `bool()` is `BOOLEAN`, read back from `TINYINT(1)`; `json()` is `TEXT`.
- Literals escape backslashes as well as quotes, for servers without `NO_BACKSLASH_ESCAPES`.

## Writes

MySQL has no `RETURNING`. An insert that returns its row - every `Type.insert` - runs the insert, then selects the row back by its incrementing id or by the key values it was given. An insert across joined tables cannot return rows and throws; one without a value for each key column throws too.

- `conflict: "update"` is `ON DUPLICATE KEY UPDATE`. It fires on any unique key, not only `on`. With an incrementing id, the returned row is the one that conflicted.
- `conflict: "ignore"` is `INSERT IGNORE` and resolves `undefined` when a row exists. `INSERT IGNORE` also turns some other errors, like a foreign key or `NOT NULL` violation, into warnings.
- A `Query` updating several joined tables renders one `UPDATE … JOIN … SET`; a delete across a join renders `DELETE t FROM … JOIN`.

## Transactions

`db.transaction(fn)` as in `expressive-orm`. Each transaction runs on its own pool connection, side by side; statements outside one don't wait.

## Live rows

None - MySQL has no change notifications. Loaded entities update only through this connection's writes.
