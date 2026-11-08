---
"@expressive/orm": minor
---

**`memory({ persist })` survives a reload.** An adapter loads every table when the connection opens and saves the changed ones once per tick, id counters included; `close()` waits for an open transaction and the last save. `memory.indexedDB(name)` persists in the browser, `memory.file(path)` to a JSON file on Node or Bun through a temp file and rename. A transaction saves once it commits; a rollback saves nothing.
