---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**Upsert.** `Type.insert(data, { conflict })` writes `ON CONFLICT`. `"update"` overwrites the existing row with every column given, minus the target and `keep`, returns it and settles a loaded instance; `"ignore"` leaves it and resolves `undefined`. `on` names the target - a key or keys, the primary key by default. The memory driver matches.

**Composite keys.** `id = key(() => [this.account, this.role])` keys an entity by the fields it lists, with no column of its own. `id` is a string - the parts as JSON - typed as a key of their tuple (`Type.Id<T>` takes either), so it compares by value. `get`, `one`, `update` and `delete` take the key or the tuple, the identity map holds it, a part change through `set` or `update` rekeys a loaded instance, and `sync` declares `PRIMARY KEY (...)` - existing tables included. Live rows report a composite id on SQLite, Postgres and memory. `one()` cannot relate to a composite-keyed class.

**Driver contract.** `insert(table, data, returns?, conflict?)` takes `Connection.Conflict` (`{ on, update? }` by column). `update` and `remove` take `Connection.Key`, which is a tuple for a composite key; `Change.id` likewise. `Field.parts` lists a composite key's fields.
