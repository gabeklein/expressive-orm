---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

Breaking: `Type.all` is gone. `query(where, limit, offset?)` resolves its first `limit` rows when awaited and, iterated with `for await`, yields every match `limit` rows per select (`Type.Results`). `rows()` handles follow.

A read with a limit - `one` included - is always totally ordered: the filter's `asc()` / `desc()`, else the class's newest first, then by id. `one({ ... })` now resolves the newest match rather than any.
