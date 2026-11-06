---
"@expressive/orm": patch
"@expressive/sql": patch
"@expressive/postgres": patch
---

Fixes found adopting an existing SQLite database:

- SQLite `sync` accepts a primary key column not declared `NOT NULL`, as tables created outside the library usually are.
- A count `Query` (no selection) resolves the matching row count on SQLite and Postgres; it resolved 0 on SQLite and the affected rows on Postgres.
- A table joined twice in one `Query`, such as two relations to the same class, is aliased instead of failing with an ambiguous column.
- `insert({})` writes `DEFAULT VALUES`. An insert per joined row with no values throws a clear error.
