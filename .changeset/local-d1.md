---
"@expressive/sql": minor
---

`d1(file, { migrations, seed })` opens a local SQLite file as a D1 binding - for a Worker's `env.DB` in dev or tests, without wrangler. It applies pending migrations (tracked in `d1_migrations`, as wrangler does) and seeds an empty file on first use.
