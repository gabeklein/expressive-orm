---
"@expressive/orm": patch
---

A destroyed entity leaves the identity map: `get(id)`, `load`, relations and view reuse no longer return it, and the next `get(id)` selects again. `entity.set(patch)` writes nothing when the patch names no column with a value, so `set({})` or a patch of unknown keys no longer writes `update` columns such as `date.updated()`.
