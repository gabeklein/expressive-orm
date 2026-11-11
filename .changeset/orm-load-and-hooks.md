---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

`Type.load(where?, limit?, offset?)` resolves live entities for a filter in one select, reusing and settling loaded ones; `rows()` handles gain `load`. `connection.before(Type, { delete(row) })` gates a delete by id - a throw cancels it - and `connection.after(Type, { delete(row) })` runs best-effort effects once it is done: awaited, errors logged rather than thrown, after commit inside a transaction. Each returns a remover.
