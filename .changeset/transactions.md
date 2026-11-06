---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**Transactions.** `connection.transaction(fn)` runs `fn` in one database transaction, committing when it resolves and rolling back when it throws. Statements inside join it without a handle, through `AsyncLocalStorage` loaded on first use; a nested call joins the open transaction, so a caught nested failure commits with it. On SQLite and PGlite, other statements wait until it ends and transactions queue; `pg` runs each on its own pooled client, discarding a client whose `BEGIN`, `COMMIT` or `ROLLBACK` failed. A rollback restores instances changed inside, destroys entities created inside and keeps entities deleted inside; a commit destroys those. SQLite and Postgres support it. Where `AsyncLocalStorage` is missing it throws, and `memory()` has none.

**Driver contract.** orm's `Connection` declares an optional `transaction(fn)`. `@expressive/sql`'s `Connection` implements it over a protected `transact(fn)`, which a driver provides, plus `lock()` and an `idle()` its statements await - a pooled driver overrides both.
