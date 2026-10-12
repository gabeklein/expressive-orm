---
"@expressive/sql": minor
---

sql's `Connection` extends orm's: it keeps the SQL floor over `Query`, `prepare` through the generator, and schema `sync`; `using`, awaiting and the identity map come from orm. Construct connections with `SQLiteConnection.new(using, filename)`. The floor's `get` is renamed `select`, and `update`/`remove` match the class's primary column, so a renamed key round-trips.
