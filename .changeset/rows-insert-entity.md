---
"@expressive/orm": minor
---

Breaking: a `rows()` relation's `insert` returns the entity, as `Type.new` does with the foreign key filled, instead of the stored row. It is usable at once and resolves when awaited; read `entity.columns` for the row.
