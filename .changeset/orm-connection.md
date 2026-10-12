---
"@expressive/orm": minor
---

`Connection`: the driver contract is an abstract class extending `State`, exported from orm.

- Construct a connection with `.new(...)`; bare `new` is for a connection declared on another State, which activates and destroys it. `using` binds each class's `Type.connection`; `close()` destroys the connection, unbinding them.
- The floor's `get(table, constraints, limit, offset)` is renamed `select` - `get` is State's. `insert`, `update` and `remove` are unchanged; `prepare`, `subscribe` and `sync` are optional capabilities. Awaiting a connection runs `sync` once, when it has one.
- The identity map belongs to the connection: destroying it (`set(null)`) destroys every entity loaded through it.
- `subscribe(listener)` lets a driver report row changes as `{ table, op, id, row? }`. A loaded entity takes an `update` into the fields it has not changed locally - unsaved edits win - reloading the row when `row` is absent; a `delete` destroys and evicts it; an `insert` changes nothing. Observe entities as States to follow them.
- `memory()` returns a `Connection` and reports every write through it, floor or `Query`, so its loaded entities stay current.
- `memory()` keys rows by the class's primary column, so `id = num({ column: "user_id", primary: true })` round-trips.
- Static `update(id, data)` settles the written values into a loaded entity.
