---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

**Upsert.** `Type.insert(data, { conflict })` writes `ON CONFLICT`. `"update"` overwrites the existing row with every column given, minus the target and `keep`, returns it and settles a loaded instance; `"ignore"` leaves it and resolves `undefined`. `on` names the target - a key or keys, the primary key by default. The memory driver matches.

**Composite keys.** `id = key<[number, string]>("account", "role")` keys an entity by the tuple of its parts, with no column of its own. `get`, `one`, `update` and `delete` take the tuple, the identity map holds it, an instance's `id` is one frozen tuple until a part changes, and `sync` declares `PRIMARY KEY (...)` - existing tables included. Live rows report a composite id on SQLite, Postgres and memory. `one()` cannot relate to a composite-keyed class.

**Driver contract.** `insert(table, data, returns?, conflict?)` takes `Connection.Conflict` (`{ on, update? }` by column). `update` and `remove` take `Connection.Key`, which is a tuple for a composite key; `Change.id` likewise. `Field.parts` lists a composite key's fields.

**Breaking.** `Type`'s `id` is declared `string | number | readonly (string | number)[]`, so a class that keeps the default `id` reads the wider type. Redeclare `id` to narrow it.
