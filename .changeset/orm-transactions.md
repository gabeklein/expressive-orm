---
"@expressive/orm": minor
"@expressive/sql": minor
---

**`memory()` runs transactions, and every driver gets them from `@expressive/orm`.** `transaction(fn)`, the connection lock (`lock()`, `idle()`) and the journal that restores instances move from `@expressive/sql`'s `Connection` to `@expressive/orm`'s, over a protected `transact(fn)` hook, so a driver without SQL implements `transact` and nothing else. On `memory()` a rollback restores every table and the next id, subscribers hear of changes once a transaction commits, and statements from outside an open transaction wait for it. Like the SQL drivers, it needs `AsyncLocalStorage` and throws without it.
