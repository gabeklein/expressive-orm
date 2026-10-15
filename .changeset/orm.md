---
"@expressive/orm": minor
---

Rebuilt on `@expressive/mvc`. Entities are States, the driver contract is a small floor with optional capabilities, and `Query` lives here.

**Entities are States.** `Type` extends `State` from `@expressive/mvc`, now a peer dependency (`^0.89.0`). Observe an entity with `get(effect)` or `set(callback)`; destroy it with `set(null)`. Field helpers (`str`, `num`, `bool`, `date`, `uuid`, `json`, `one`) are `def` instructions; the private `use`/`init` registry is gone.

**Renamed**

- Static `Type.get(where, limit, offset)` is `Type.find`.
- Field `get(Child)` is `rows(Child, key?)`: a handle with `find`, `one` and `insert` applying the foreign key. It no longer mints a subclass of `Child`.
- `Type.new(values)` is State's: it builds an unsaved entity synchronously. Persist with `insert(data)`, which now returns the saved entity.
- The driver floor's `get(table, constraints, limit, offset)` is `select` - `get` is State's.
- The constraint query behind `find`, `one` and `all` is the protected `fetch`.
- A `Field`'s JS constructor moves from `type` to `kind`; `type` is the datatype string.

**Writes**

- Assigning a field marks it dirty. `save()` writes what is dirty and returns the entity: one without an `id` is inserted, taking `id` and defaults from the row; one with an `id` updates only the columns that changed. Loading a row and a completed save leave the entity clean.
- `update(data)` assigns, then saves - one write. Static `update(id, data)` settles the written values into a loaded entity.
- `insert(data)` is `Type.new(data).save()` and always inserts, so a supplied key is written.
- `delete()` evicts the entity and destroys it. `save()`, `update()` and `delete()` on a deleted entity throw.
- `all(pageSize, where?)` pages through `find`; `subset` scopes a class's reads and writes.

**Relations**

- `one(Other)` holds a reference: not adopted, not destroyed with its parent, and parents sharing a row read the same instance. It records `onDelete` and `onUpdate`.
- `one(Other, lazy)` reads like an unset mvc property: the first read starts the load and throws mvc's suspense, resolving when the entity lands. Assigning an id loads it the same way unless already loaded.

**Columns**

- `str`, `num`, `bool` and `date` build datatype-aware fields that validate on write: `str` checks type and `length`, `num` rejects non-numbers and `NaN`, `bool` rejects non-booleans and stores through `either` (default `1`/`0`), `date` rejects values that are not a date. `datatype` composes `type` with `length`, `precision`/`scale` and `collate`. `json` is `text`.
- Each helper and `one` carries a `Types` interface for adapters to augment - `declare module '@expressive/orm' { namespace str { interface Types { varchar: VarChar } } }` - narrowing `type` and typing options per datatype. `str.Type`, `num.Type`, `bool.Type`, `date.Type` and `one.Type` hold the field class each helper constructs; an adapter replaces it with a subclass.
- `optional`, `fallback`, `increment` and `primary` make a key optional in `Type.Insert` and a query insert; the property stays value-typed.
- `id` is `num({ primary: true, increment: true })`, typed `string | number`. Redeclare it with any helper carrying `primary` to narrow it: `id = num({ column: "user_id", primary: true })` is a `number`, `id = uuid({ primary: true })` a `string`. `one(id)`, `update(id)`, the identity map and relation inputs follow it.

**Connections**

- `Connection` is an abstract class extending `State`, exported from here. Construct one with `.new(types, ...)`, or bare `new` as a field of a State that owns it. `using` binds each class's `Type.connection`; `close()` destroys the connection, its identity map and every entity loaded through it, and unbinds the classes. Awaiting a connection runs `sync` once, when it has one.
- The floor is `select`, `insert`, `update(id)` and `remove(id)`, keyed by the class's primary column. Optional: `prepare(builder)` for `Query`, `subscribe(listener)` for live rows, `sync(fix?)` for schema.
- The identity map is held per connection instead of module-global.

**New**

- Live rows. A driver's `subscribe(listener)` reports `{ table, op, id, row? }`. A loaded entity takes an `update` into the fields it has not changed locally - unsaved edits win - reloading the row when `row` is absent; a `delete` destroys and evicts it; an `insert` changes nothing.
- `memory()`, an in-memory connection: auto-increment ids, every constraint operator, `Query` executed over arrays (joins, nested and/or filters, order, limit, offset, projections, math and bitwise ops, parameters, data tables, inserts, updates and deletes across joins; raw templates throw), and every write reported through `subscribe`.
- `Query` moves in from `@expressive/sql`. `Query(where => ...)` records tables, joins, filters, order, limit, selections, inserts, updates and deletes over entity classes; a connection's `prepare` renders or runs it. `where(Post).user.name` joins through `one()` - inner when required, left when nullable. A whole-entity selection hydrates through the identity map. Without `prepare`, awaiting throws and `String(query)` lists the intent. `Type.query(fn?)` starts from the class.
- Exports for drivers and generators: `Connection`, `Builder`, `Computed`, `DataField`, `DataTable`, `Parameter`, `QueryTemplate`. `Builder` carries `offset`.

**Packaging.** ESM only, built with tsdown; modules no longer trip over circular imports when evaluated one by one. Most applications install `@expressive/sql`, which depends on and re-exports this package. The PGLite test harness is removed.

Requires `@expressive/mvc` `^0.89.0`.
