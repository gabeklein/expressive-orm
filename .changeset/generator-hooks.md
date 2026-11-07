---
"@expressive/sql": minor
"@expressive/postgres": patch
---

**`Generator` exposes protected hooks for dialects.** `literal(value)` renders every literal in values, `SET` and `WHERE`; `insertWith(cte, into, select)` places a data CTE in an insert; `table(table)` renders a table with its alias for `FROM`, joins, `UPDATE` and `DELETE`. A schema-qualified table's alias is now quoted everywhere, fixing Postgres queries and updates that aliased one.
