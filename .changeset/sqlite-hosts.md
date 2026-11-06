---
"@expressive/sql": minor
---

**`d1Engine`, `libsqlEngine` and `expoEngine` run `SQLiteConnection` on Cloudflare D1, Turso and expo-sqlite.** Each wraps a binding or client you pass in. `Engine` gains optional `transaction()` and `batch(sql)`: a remote libSQL client runs transactions on its own sessions, and `sync` applies through `batch` where an engine has one. D1 refuses `transaction` with a clear error.
