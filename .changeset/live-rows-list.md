---
"@expressive/orm": minor
---

`Type.load` and a `rows()` relation's `load` resolve a live array: a deleted or destroyed entity drops out, a matching entity created through the class or reported by live rows joins first (not when `limit` or `offset` is given), and effects reading it re-run. Awaiting a `rows()` handle resolves `load()`.

Breaking: a `rows()` relation's `insert` returns the entity, as `Type.new` does with the foreign key filled, instead of the stored row. Read `entity.columns` for the row.
