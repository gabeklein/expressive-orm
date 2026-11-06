# @expressive/mysql

MySQL and MariaDB connection for Expressive ORM, on `mysql2`. Re-exports [`@expressive/sql`](https://github.com/gabeklein/expressive-orm/tree/main/packages/sql), so entities, field helpers and `Query` come from this one import. Full guide: [README](https://github.com/gabeklein/expressive-orm#readme).

```sh
npm install @expressive/mysql @expressive/mvc mysql2
```

```ts
import { MySQLConnection, Type, str } from '@expressive/mysql';

class User extends Type {
  name = str();
}

const db = await MySQLConnection.new([User], "mysql://root@localhost/app");
```

- `MySQLConnection.new(types, config)` - `config` is a connection string, a `mysql2` `PoolOptions` or a `mysql2/promise` `Pool`. `close()` ends a pool the connection created; one passed in stays open.
- Needs MySQL 8.0.19+ or MariaDB 10.6+ (`JSON_TABLE`, expression defaults).
- An insert that returns its row re-selects it, by its incrementing id or its key. An insert across joined tables cannot return rows.
- A conflict matches any unique key; `conflict: "ignore"` is `INSERT IGNORE`.
- `sync` runs DDL step by step; MySQL commits each, so a failed sync can leave earlier steps applied.
- No live rows: MySQL has no change notifications.
