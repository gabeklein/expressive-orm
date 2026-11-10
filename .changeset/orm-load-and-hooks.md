---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

`Type.load(where?, limit?, offset?)` resolves live entities for a filter in one select, reusing and settling loaded ones; `rows()` handles gain `load`. `connection.on(Type, { delete(row) })` runs best-effort host-side effects after a delete by id - awaited, errors logged rather than thrown, after commit inside a transaction - and returns a remover.
