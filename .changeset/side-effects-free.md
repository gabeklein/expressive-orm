---
"@expressive/orm": patch
"@expressive/sql": patch
"@expressive/postgres": patch
---

Declare the packages free of side effects, so a bundle importing only entities from `@expressive/sql` or `@expressive/postgres` drops SQLite, Postgres and `sql-formatter` - it matches importing the same names from `@expressive/orm`.
