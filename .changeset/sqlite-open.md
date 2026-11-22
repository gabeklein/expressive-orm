---
"@expressive/sql": minor
---

`sqlite(file, { migrations, seed })` opens a SQLite file as an `Engine` for `db.session(fn, engine)` or `{ source }`, after applying pending `.sql` migrations and seeding an empty file in one transaction.
