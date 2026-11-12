---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

Breaking: `Type.all(pageSize, where?)` is gone - use `query(where, pageSize)`, arguments swapped. `query(where, limit, offset?)` with a numeric `limit` now returns `Type.Results` rather than a plain `Promise<Columns[]>`: it resolves its first `limit` rows when awaited and, iterated with `for await`, yields every match `limit` rows per select. A `limit` typed `number | undefined` resolves rows. A limit of `0` reads every match in one batch. `rows()` handles follow.

A read with a limit is always totally ordered: the filter's `asc()` / `desc()`, else the class's newest first, then by id. Every limited select now carries an `ORDER BY` - `one`, `load(where, limit)` and the by-id load behind `get` included. `one({ ... })` now resolves the newest match rather than any.
