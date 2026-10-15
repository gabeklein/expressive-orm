---
"@expressive/sqlite": minor
---

Deprecated: install `@expressive/sql`, which now holds `SQLiteConnection` and its runtime driver selection (`bun:sqlite`, `node:sqlite`, then `better-sqlite3`, `sqlite3` or `@libsql/client`). This package re-exports `@expressive/sql` and is removed in a later release.

```diff
- import { SQLiteConnection } from '@expressive/sqlite';
+ import { SQLiteConnection } from '@expressive/sql';
```

Everything in `@expressive/sql`'s notes applies: entities are `@expressive/orm` `Type` subclasses, `Table` and its columns are gone, and connections construct with `SQLiteConnection.new(types, filename?)`. ESM only.

Requires `@expressive/mvc` `^0.89.0`.
