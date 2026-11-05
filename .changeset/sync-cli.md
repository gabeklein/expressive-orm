---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**`expressive sql check | sync [--force] <entry>`.** A bin, shared by `@expressive/*` packages, that imports the module creating your connections with `sync` held back, then reports or applies what each connection's schema needs. `check` exits 1 when anything would change and marks drift `--force` can rebuild.

**`plan(force?)`.** SQL connections return what `sync` would do - `{ steps, problems }`, each step with `action`, `reason` and `sql` - without doing it. `sync` applies the plan in one transaction, and verify-only `sync(false)` now also reports missing indexes. A table referencing one the same sync creates no longer fails as a missing referenced table.

**`sync(true, true)` rebuilds drift.** A column whose type or nullability differs from its class is altered on Postgres and rebuilt with its table on SQLite, keeping columns the class doesn't declare and existing indexes, and casting values. It refuses while a row would not fit - a NULL under `NOT NULL`, or text that is not a number for a numeric column.
