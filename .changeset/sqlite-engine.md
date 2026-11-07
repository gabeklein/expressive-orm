---
"@expressive/sql": minor
---

**`SQLiteConnection` takes an engine.** `new SQLiteConnection(types, engine)` runs on any object implementing the exported `Engine` type (`all`, `get`, `run`, `exec`, `close`), for a SQLite the built-in loader can't open. A filename still selects the built-in engine. A given engine is used as is and left open by `close()`.
