---
'@expressive/orm': minor
'@expressive/sql': patch
'@expressive/postgres': patch
---

Driver seams move to `@expressive/orm/driver`: `Builder`, `evaluate`, `Where`, `Computed`, `DataField`, `DataTable`, `Parameter` and `QueryTemplate`. The root entry - and `@expressive/sql`'s, which re-exports it - keeps the app API. `Where` stays on the root as a type. A driver imports these from `@expressive/orm/driver`.
