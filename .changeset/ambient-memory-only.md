---
"@expressive/orm": minor
---

Only a connection without `sync` - a `Memory` - takes classes no connection binds. A class left unlisted on SQLite or Postgres rejects with `No database connection` again, instead of joining without a table.
