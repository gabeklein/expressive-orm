---
"@expressive/sql": minor
---

**SQLite engines can bring their own transactions and batches.** An `Engine` may implement `transaction()`, returning a session whose statements, `commit` and `rollback` back `transaction(fn)`, and `batch(sql)`, through which `sync` applies atomically. A batched rebuild turns foreign keys off around it and is refused where the engine keeps them on. A failed rollback no longer hides the error that caused it.
