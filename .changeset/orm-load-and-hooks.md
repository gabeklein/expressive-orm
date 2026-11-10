---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

`Type.load(where?, limit?, offset?)` resolves live entities for a filter in one select, reusing and settling loaded ones; `rows()` handles gain `load`. `connection.on(Type, { delete(row) })` runs host-side effects after every delete path, after commit inside a transaction, and returns a remover.
