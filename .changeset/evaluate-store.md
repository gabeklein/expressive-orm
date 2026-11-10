---
"@expressive/orm": minor
---

**`evaluate(store, builder, params)` runs a query in JS over any row store.** The memory driver's evaluator is now exported from `@expressive/orm/driver`, so a driver without a query language implements `evaluate.Store` (`rows`, `insert`, `update`, `delete` per table) and gets joins, filters, ordering, computed values and writes from `prepare`. `rows` receives the conditions the query puts on that table alone, for a store that can filter. A query update now writes each row once, however many joined rows match it.
