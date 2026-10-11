---
"@expressive/orm": minor
---

`Query` moves into orm.

- `Query(where => ...)` builds intent - tables, joins, filters, order, limit, returns, inserts, updates and deletes - over entity classes. A connection's optional `prepare(builder)` renders or executes it; without one, awaiting a query throws and `String(query)` dumps the intent.
- `Type.query(fn?)` is `Query(where => fn(where(this), where))`. With no return it selects whole entities, which hydrate through the identity map. The constraint query behind `find`, `one` and `all` is now the protected `fetch`.
- `where(Post).user.name` joins through `one()`: inner for a required relation, left for a nullable one.
- `memory()` executes queries: joins, nested and/or filters, order, limit, projections, computed math and bitwise ops, parameters, data tables, inserts (bulk and from a select), updates and deletes across joins. Raw templates throw.
- `Field` carries sql's column metadata: `type` (now the datatype string), `length`, `unique`, `fallback`, `increment`, `primary`, `absent`, `reference`. The JS constructor a helper records moves to `kind`.
- Exports `Query`, `Builder`, `Parameter` and `DataTable`.
