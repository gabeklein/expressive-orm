---
"@expressive/sql": minor
---

Breaking: `SQLiteConnection` no longer adapts vendor hosts. A Cloudflare D1 binding, a libSQL client and a `libsql:`/`https:`/`ws:` address are refused as a source or session client, and `@libsql/client` is gone from the built-in loader - it opens a file through `bun:sqlite`, `node:sqlite`, `better-sqlite3` or `sqlite3`. Any other host is an `Engine` the app writes and passes as `{ source }` or to `db.session(fn, engine)`. An engine without interactive transactions rejects from `transaction()`; `db.transaction(fn)` then rejects before `fn` runs.

Migrating:

- D1 - copy the adapter in the README's "SQLite hosts" (about 25 lines) and pass `d1(env.DB)` where you passed `env.DB`: `db.session(fn, d1(env.DB))`, `{ source: d1(env.DB) }`.
- libSQL or Turso - wrap the client in an `Engine`: `all`/`get`/`run` over `client.execute({ sql, args })` (`rows`, `rows[0]`, `{ changes: Number(rowsAffected) }`), `exec` over `executeMultiple`, `batch` over `client.batch(sql, "write")`, and `transaction` over `client.transaction("write")` with its `commit` and `rollback`. Pass the engine as `{ source }`.
- A local file opened only through `@libsql/client` - install `better-sqlite3`, or run on Bun or Node 24.
