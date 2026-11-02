---
"@expressive/sql": minor
---

`@expressive/sql` is driver infrastructure for `@expressive/orm`, which it now peers (with `@expressive/mvc`).

- `Table`, `Field`, `Query`, `Builder`, `Parameter`, `DataTable`, `Primary` and the `Str`, `Num`, `Bool`, `Time`, `One` columns are removed. Entities are `Type` subclasses with orm's `str`, `num`, `bool`, `date`, `one` helpers; `Query` comes from orm.
- `Generator` renders orm's `Builder`. `null` comparisons render `IS NULL` / `IS NOT NULL`, an insert with a selection renders `RETURNING`, and `offset` renders `OFFSET`.
- `Connection` implements orm's driver contract. `get`, `insert`, `update` and `remove` are expressed as builder statements against the class registered for the table and run through the adapter's `prepare`, so `Type.find`, `one`, `insert`, `save`, `update` and `delete` work on any SQL adapter. Values are bound as parameters.
- `Connection.None` is removed; a query without a connection prints orm's intent dump.
