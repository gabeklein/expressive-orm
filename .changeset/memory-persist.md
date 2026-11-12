---
"@expressive/orm": minor
---

**`memory({ persist })` survives a reload.** An adapter loads every table when the connection opens and saves the changed ones a macrotask after each write, id counters included; a failed save logs and retries, and `close()` waits for an open transaction and the last save. `memory.indexedDB(name)` persists in the browser, `memory.file(path)` to a JSON file on Bun, Node 20.16+ or 22.3+, or Deno, keeping `Date`s, through a temp file and rename. A transaction saves once it commits; a rollback saves nothing.
