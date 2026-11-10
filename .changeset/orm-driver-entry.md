---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

Driver seams move to `@expressive/orm/driver`: `Builder`, `Where`, `Computed`, `DataField`, `DataTable`, `Parameter` and `QueryTemplate`. The root entry - and `@expressive/sql`'s, which re-exports it - keeps the app API. `Where` stays on the root as a type. A driver imports these, and `evaluate`, from `@expressive/orm/driver`.
