---
"@expressive/orm": minor
---

Writes on entities.

- Assigning a field marks it dirty. `save()` persists what is dirty and returns the entity: one without an `id` is inserted and joins the identity map, taking `id` and defaults from the inserted row; one with an `id` updates only the columns that changed - a relation only when its id does. Nothing dirty, no write. Loading a row and a completed save leave the entity clean.
- `update(data)` assigns `data`, then saves: one write, including any fields already dirty.
- `insert(data)` is `Type.new(data).save()`.
- `delete()` evicts the entity from the identity map and destroys it, so observers see the end. `save()`, `update()` and `delete()` on a deleted entity throw.
