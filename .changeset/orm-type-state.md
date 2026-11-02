---
"@expressive/orm": minor
---

`Type` extends `State` from `@expressive/mvc`, now a peer dependency (`^0.88.0`). Entities are observable States; field helpers (`str`, `num`, `bool`, `date`, `uuid`, `json`, `one`, `get`) are `def` instructions, and the private `use`/`init` registry is gone.

- `Type.new(values)` is State's: it constructs an unsaved entity synchronously. Persist with `Type.insert(data)`, which now returns the saved entity.
- Static `Type.get(where, limit, offset)` is renamed `Type.find`.
- Instance `update(data)` assigns the written values onto the entity.
- The identity map is held per connection instead of module-global.
- New `memory()` driver: an in-memory `Type.Connection` with auto-increment ids, honouring every constraint operator the ORM emits.
- The PGLite test harness is removed.
