---
"@expressive/sql": minor
---

**`SQLiteConnection` takes an engine.** `new SQLiteConnection(types, engine)` runs on any object implementing the exported `Engine` type (`all`, `get`, `run`, `exec`, `close`), for SQLite hosts the built-in loader can't open, such as D1 or a remote libSQL database. A filename still selects the built-in engine.
