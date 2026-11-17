---
"@expressive/orm": minor
---

A subclass that declares no fields of its own is a view on its parent's table: it reads and writes the parent's rows, `get(id)` builds it from the parent's loaded row without a select, and `entity.set` or `Type.update(id)` settles every loaded instance of that row, whichever class loaded it.

Breaking: such a subclass no longer defaults to a table named after itself. Give it `static table` to keep one. A parent holding only statics, such as a shared `connection`, still isn't a table.
