---
"@expressive/orm": minor
---

**`Memory` is a connection class.** `Memory.new([User, Post])` binds classes like `SQLiteConnection.new`, so tests and prototypes swap one class name. `db.clear()` deletes every row, restarts ids and destroys loaded entities - between tests. Persistence moves to a second argument: `Memory.new(types, "data.json")` is a JSON file on Bun, Node or Deno and an IndexedDB database in a browser, or pass a `Memory.Adapter`. `memory({ persist })`, `memory.file` and `memory.indexedDB` are removed; `memory()` is deprecated.
