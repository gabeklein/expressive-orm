---
"@expressive/orm": minor
---

**`memory({ persist })` survives a reload.** An adapter loads every table when the connection opens and saves the changed ones once per tick, id counters included; `close()` waits for the last save. `memory.indexedDB(name)` persists in the browser, `memory.file(path)` to a JSON file on Node or Bun through a temp file and rename. `memory()` also runs `transaction(fn)`: a rollback restores tables and instances, nothing half-finished is saved, and change reports arrive on commit.
