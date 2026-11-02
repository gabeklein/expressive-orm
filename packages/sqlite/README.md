# @expressive/sqlite

**Deprecated** - install [`@expressive/sql`](https://github.com/gabeklein/expressive-orm/tree/main/packages/sql), which ships the SQLite connection and driver autodetect. This package re-exports `@expressive/sql` and is removed in a later release.

```sh
npm uninstall @expressive/sqlite
npm install @expressive/sql
```

```diff
- import { SQLiteConnection } from '@expressive/sqlite';
+ import { SQLiteConnection } from '@expressive/sql';
```
