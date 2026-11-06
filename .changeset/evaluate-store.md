---
"@expressive/orm": minor
---

**`evaluate(store, builder, params)` runs a query in JS over any row store.** The memory driver's evaluator is now exported, so a driver without a query language of its own implements `evaluate.Store` (`rows`, `insert`, `update`, `delete` per table) and gets joins, filters, ordering and writes from `prepare`.
