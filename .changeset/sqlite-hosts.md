---
"@expressive/sql": minor
---

**`d1Engine`, `libsqlEngine` and `expoEngine` run `SQLiteConnection` on Cloudflare D1, Turso and expo-sqlite.** Each wraps a binding or client you pass in. A remote libSQL client runs `transaction(fn)` on a libSQL transaction of its own, and D1 and libSQL apply `sync` through their batches. D1 refuses `transaction` with a clear error, and a rebuild, since it keeps foreign keys on. A table created by `sync` now plans its indexes as statements of their own, so a batch that runs one statement per entry creates them.
