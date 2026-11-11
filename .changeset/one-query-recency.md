---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

Breaking: `Type.one(where?, expect?)` resolves the live entity, loaded as `load(where, 1)` - a loaded entity settles the fetched row and is returned as is. It takes a filter only; `get(id)` covers ids, and an id throws. `Type.find` is now `Type.query(where?, limit?, offset?)`, still resolving frozen rows through the driver's `select` alone; `query(callback)` stays the `Query` builder, and `query()` without arguments now reads rows rather than building a `Query`. `rows()` handles follow: `find` is `query`, and `one` resolves an entity.

`date.created()` marks the class's recency. Without a filter, `query`, `load` and `one` take the newest first by it, else by an incrementing `id`, else unordered - and `one()` without a filter then throws asking for one. A second `created()` on one class throws.
