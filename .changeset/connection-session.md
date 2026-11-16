---
"@expressive/orm": minor
---

Add `connection.session(fn, client?)` - runs `fn` with its own identity map, so `get` reads rows afresh where other processes write the database, and hands drivers a per-call client. Code outside a session keeps the process-wide identity map.
