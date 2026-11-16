---
"@expressive/sql": minor
---

`SQLiteConnection.new(types, options)` takes the source in options - `{ source, timestamps }` - or a filename or address string as before. A D1 binding, libSQL client or `Engine` moves into `{ source }`: `new(types, env.DB)` becomes `new(types, { source: env.DB })`, and `new(types, source, { timestamps })` becomes `new(types, { source, timestamps })`. Any other object in its place, or a third argument, throws instead of being misread.
