---
"@expressive/sql": minor
---

**`SQLiteConnection` runs on Cloudflare D1 and libSQL (Turso).** In place of a filename it takes a D1 binding, a libSQL client, or a `libsql:`, `https:`, `http:`, `ws:` or `wss:` address, which opens `@libsql/client` and reads a token from `?authToken=`. D1 applies `sync` as one batch, refuses `transaction`, and refuses a rebuild since it keeps foreign keys on. Every libSQL client, the built-in loader's included, runs each `transaction` on a libSQL write transaction, applies `sync` as one batch and rebuilds a table through `migrate`; schema checks inside a transaction run on it. The `@libsql/client` peer is now `>=0.18.0` - older clients lose an in-memory database on its first transaction. A table created by `sync` now plans its indexes as statements of their own, so a batch that runs one statement per entry creates them.
