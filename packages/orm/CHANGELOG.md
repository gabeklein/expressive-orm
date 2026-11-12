# Change Log

All notable changes to this project will be documented in this file.
See [Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [0.12.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.12.0...@expressive/orm@0.12.1) (2025-10-30)


### Bug Fixes

* add 'as const' assertion to orNull and optional constants for better type inference ([46ba8fc](https://github.com/gabeklein/orm/commit/46ba8fc4ba5ab1f7d2893e9238e6831e1c3b4a23))





# [0.12.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.11.2...@expressive/orm@0.12.0) (2025-10-30)


### Bug Fixes

* ensure date value is properly converted to ISO string format ([5dcf709](https://github.com/gabeklein/orm/commit/5dcf7099ffab5bf72e747fc4b8ba3c654b4a3562))
* replace cached fetch with direct call to Class.one for improved clarity ([05314a4](https://github.com/gabeklein/orm/commit/05314a483cf3d642b1f0e78d86a65d04ac020573))
* update type inference for nullable fields and improve json function return type ([19e37ed](https://github.com/gabeklein/orm/commit/19e37ed6ab4f1c5f321e1414c9247f0f89dc472e))


### Features

* add orNull and optional configurations; export lazy from one module ([511f011](https://github.com/gabeklein/orm/commit/511f011274fe1355408042b0ee5f5567679e4635))





## [0.11.2](https://github.com/gabeklein/orm/compare/@expressive/orm@0.11.1...@expressive/orm@0.11.2) (2025-09-24)


### Bug Fixes

* enhance field value handling to support arrays in query construction ([ff5b4eb](https://github.com/gabeklein/orm/commit/ff5b4eb60c4b8954dc8462179a634932148ae168))
* handle SET values to null ([e3d19cf](https://github.com/gabeklein/orm/commit/e3d19cfd89b0961ead9271691cec79304314708d))





## [0.11.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.11.0...@expressive/orm@0.11.1) (2025-09-10)


### Bug Fixes

* update property definition to use 'this' context in get function ([b42915c](https://github.com/gabeklein/orm/commit/b42915cd88957471d307d7112f5024b5c1bdff20))





# [0.11.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.3...@expressive/orm@0.11.0) (2025-09-09)


### Features

* implement Type.one(id) caching ([a2dde78](https://github.com/gabeklein/orm/commit/a2dde784c7a778027257492da30705d2f922d784))





## [0.10.3](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.2...@expressive/orm@0.10.3) (2025-09-09)


### Bug Fixes

* await prepare function in update method for proper data handling ([224b1cb](https://github.com/gabeklein/orm/commit/224b1cb1d0d21560efbfe608ae2fbd409644f238))





## [0.10.2](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.1...@expressive/orm@0.10.2) (2025-09-08)


### Bug Fixes

* add tests for nullable types ([9030c80](https://github.com/gabeklein/orm/commit/9030c80774116b0fc54f72296bac9c8fb5ab76e2))
* update property definition in get function to use Child class ([125e228](https://github.com/gabeklein/orm/commit/125e22891ee5bd41a158967b693a64e269896a5a))





## [0.10.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.10.0...@expressive/orm@0.10.1) (2025-09-08)


### Bug Fixes

* update one() function to accept Config<OneToOneField> for nullable parameter ([643b434](https://github.com/gabeklein/orm/commit/643b4347076a3a4b02b4eb8743b2dfb2c8450a0f))





# [0.10.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.9.1...@expressive/orm@0.10.0) (2025-09-08)


### Bug Fixes

* verify many property ([cf3b908](https://github.com/gabeklein/orm/commit/cf3b9080b8506a31fe4d9a36fc29bf5ad51041b8))


### Features

* implement lazy one() ([e6c7213](https://github.com/gabeklein/orm/commit/e6c72130f0ee100933f134922ec715114337e9f4))
* **orm:** replace config methods with OneToOneField ([a5faf3e](https://github.com/gabeklein/orm/commit/a5faf3e023990920d72df470e00f5497ecadf5c9))
* **tests:** add extended types support and related tests ([0e95e58](https://github.com/gabeklein/orm/commit/0e95e588de74def6ddd8baaacb27511a1d055b40))





## [0.9.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.9.0...@expressive/orm@0.9.1) (2025-09-08)


### Bug Fixes

* **orm:** exclude get types from required fields on new ([ef32aaf](https://github.com/gabeklein/orm/commit/ef32aaf95e4614d9bf1d6130b65b324c2b7555f8))





# [0.9.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.8.0...@expressive/orm@0.9.0) (2025-09-08)


### Bug Fixes

* **orm:** refactor constraint building to support async ([4568abd](https://github.com/gabeklein/orm/commit/4568abd50c2643150730e6fcb365cca069b3d10f))


### Features

* **orm:** handle field proxies in updates ([a315be7](https://github.com/gabeklein/orm/commit/a315be79a0458308fa0227bfd6d0f7adc4ef6ca7))
* **orm:** support type fields in query ([3dad689](https://github.com/gabeklein/orm/commit/3dad68903bcbc7c9d676cb70cdcef6968a0684c5))





# [0.8.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.7.1...@expressive/orm@0.8.0) (2025-09-07)


### Bug Fixes

* **orm:** remove unnecessary second argument from User.new method call in tests ([ae793e6](https://github.com/gabeklein/orm/commit/ae793e67ac4891291ccbaa0b07bcb646728eb092))


### Features

* **orm:** one-fields now support ID, instance and inline create ([9c07aed](https://github.com/gabeklein/orm/commit/9c07aed68a050e600920b5a91882b55b1ff0ebb5))





## [0.7.1](https://github.com/gabeklein/orm/compare/@expressive/orm@0.7.0...@expressive/orm@0.7.1) (2025-09-07)


### Bug Fixes

* **orm:** add preversion script ([f84a6d2](https://github.com/gabeklein/orm/commit/f84a6d2ef404d961cec3a3fe6f19c0db2a683f2b))





# [0.7.0](https://github.com/gabeklein/orm/compare/@expressive/orm@0.6.0...@expressive/orm@0.7.0) (2025-09-07)


### Bug Fixes

* initialize database connection in reset method ([5734b6a](https://github.com/gabeklein/orm/commit/5734b6aa72f2550ec5e913d646a7152896746a17))
* **orm:** inserts do not break on added methods ([413cbbe](https://github.com/gabeklein/orm/commit/413cbbe1ec6cd9586b0df7bd97d486265c591c64))
* overloads for better type inference ([c60da9b](https://github.com/gabeklein/orm/commit/c60da9b87f7a17917f14cf431f8dd199a73273aa))


### Features

* **orm:** add init method to connection for database initialization ([31c345e](https://github.com/gabeklein/orm/commit/31c345eff4de8fae7f3af03a0440696d7a44d0e9))
* **orm:** implement eager one field ([ee3b1ca](https://github.com/gabeklein/orm/commit/ee3b1ca80e005352c1b123f83c1414a1b33771fe))





# @expressive/orm

## 0.16.0

### Minor Changes

- [#37](https://github.com/gabeklein/expressive-orm/pull/37) [`da081bd`](https://github.com/gabeklein/expressive-orm/commit/da081bd0ed401965f6ec097099034022adb6e215) **`memory({ persist })` survives a reload.** An adapter loads every table when the connection opens and saves the changed ones a macrotask after each write, id counters included; a failed save logs and retries, and `close()` waits for an open transaction and the last save. `memory.indexedDB(name)` persists in the browser, `memory.file(path)` to a JSON file on Bun, Node 20.16+ or 22.3+, or Deno, keeping `Date`s, through a temp file and rename. A transaction saves once it commits; a rollback saves nothing.

## 0.15.1

### Patch Changes

- [#49](https://github.com/gabeklein/expressive-orm/pull/49) [`8d351b8`](https://github.com/gabeklein/expressive-orm/commit/8d351b81030922a9135f779f94af6baae37d475f) **`@expressive/orm` bundles under Metro.** `transaction` takes `AsyncLocalStorage` from `process.getBuiltinModule` instead of a dynamic `import()`, which Metro's bundler rejects, so a React Native app importing `@expressive/orm` - `memory()` included - builds. `transaction` now needs Node 20.16+ or 22.3+, Bun, Deno, or Workers with `nodejs_compat`; elsewhere, React Native included, it throws.

## 0.15.0

### Minor Changes

- [#51](https://github.com/gabeklein/expressive-orm/pull/51) [`8905fb4`](https://github.com/gabeklein/expressive-orm/commit/8905fb4a3553437e2ac3d7c3e33e564c7a46cd55) Fields declare portable datatypes and connections own storage. A field checks plain values the same on every side - integer ranges, decimal precision and scale, string length - and a connection takes and returns them, Dates and JSON values included, storing them through codecs chosen by the field's base helper (`Connection.Codec`, a protected `codecs` getter). One schema module importing only `@expressive/orm` binds to SQLite, D1, Postgres, `memory()` or a connection forwarding to a server, and the SQL floor checks forwarded values again before storing them. `Connection.new` throws for a field the connection can't store.
  
  Breaking: orm declares the portable types - `str` text, varchar, char, uuid; `num` integer (now the default everywhere), smallint, bigint, real, double, decimal, numeric; `date` timestamp, date, time, with `timezone`; `bool` boolean. Storage-only types are dropped - `date` ms, seconds, integer and text, `num` float, `bool` with `either`, `one` integer and bigint (a relation takes its key's type), Postgres `serial` and `interval` - with their `sql.*` tokens. The column classes and `X.Type` hooks are gone (`StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn`); `@expressive/sql` exports `codecs` instead. `Field.datatype` is gone. `memory()` stores values as given.
  
  Every helper gains `.and(...presets)`, returning the same helper with those options first; `date.created` and `date.updated` are presets of `date`.
  
  A `date({ type: "date" })` column is a calendar day, not an instant: a Date gives its local day, a `"YYYY-MM-DD"` string is that day, and it reads as local midnight. It crosses every connection and is stored as `YYYY-MM-DD`, so a client and server in different time zones agree.

- [#50](https://github.com/gabeklein/expressive-orm/pull/50) [`f5cafff`](https://github.com/gabeklein/expressive-orm/commit/f5cafff8d048e390a48dd6c67315ccdc2496e464) `Type.load(where?, limit?, offset?)` resolves live entities for a filter in one select, reusing and settling loaded ones; `rows()` handles gain `load`. `connection.before(Type, { delete(row) })` gates a delete by id - a throw cancels it - and `connection.after(Type, { delete(row) })` runs best-effort effects once it is done: awaited, errors logged rather than thrown, after commit inside a transaction. Each returns a remover.

## 0.14.0

### Minor Changes

- [#34](https://github.com/gabeklein/expressive-orm/pull/34) [`7603ed0`](https://github.com/gabeklein/expressive-orm/commit/7603ed0b12d4305c34adc1cca5b0126dcdde01ee) **`evaluate(store, builder, params)` runs a query in JS over any row store.** The memory driver's evaluator is now exported from `@expressive/orm/driver`, so a driver without a query language implements `evaluate.Store` (`rows`, `insert`, `update`, `delete` per table) and gets joins, filters, ordering, computed values and writes from `prepare`. `rows` receives the conditions the query puts on that table alone, for a store that can filter. A query update now writes each row once, however many joined rows match it.

- [#47](https://github.com/gabeklein/expressive-orm/pull/47) [`9cf9cde`](https://github.com/gabeklein/expressive-orm/commit/9cf9cde5a0b5e74c8f514e44ee68a88d7cb63f03) Driver seams move to `@expressive/orm/driver`: `Builder`, `Where`, `Computed`, `DataField`, `DataTable`, `Parameter` and `QueryTemplate`. The root entry - and `@expressive/sql`'s, which re-exports it - keeps the app API. `Where` stays on the root as a type. A driver imports these, and `evaluate`, from `@expressive/orm/driver`.

- [#41](https://github.com/gabeklein/expressive-orm/pull/41) [`4f3e23c`](https://github.com/gabeklein/expressive-orm/commit/4f3e23c9e75cd4f9dc65e7ebda02577829e4d0d1) **`memory()` runs transactions, and every driver gets them from `@expressive/orm`.** `transaction(fn)`, the connection lock (`lock()`, `idle()`) and the journal that restores instances move from `@expressive/sql`'s `Connection` to `@expressive/orm`'s, over a protected `transact(fn)` hook, so a driver without SQL implements `transact` and nothing else. On `memory()` a rollback restores every table and the next id, subscribers hear of changes once a transaction commits, and statements from outside an open transaction wait for it. Like the SQL drivers, it needs `AsyncLocalStorage` and throws without it.

### Patch Changes

- [#46](https://github.com/gabeklein/expressive-orm/pull/46) [`acd61f1`](https://github.com/gabeklein/expressive-orm/commit/acd61f112e38d330fe7c990e974bf6595a59699a) Document the public API in JSDoc, so hovers and completions carry each symbol's contract, and correct the agent skills against the source: `json()` takes one option, relation writes insert an object without `id`, `where(Other)` needs a join condition on SQL, `num()` is a 32-bit integer on SQL, default ordering of `find()` and `one()`, and an error table.

- [#44](https://github.com/gabeklein/expressive-orm/pull/44) [`567a398`](https://github.com/gabeklein/expressive-orm/commit/567a3982aeea543aeadec8d9529b836187671330) Ship each package's agent skill in the package, at `skills/expressive-<pkg>/SKILL.md`, so the docs an agent reads match the installed version. Agents read them from `node_modules/@expressive/<pkg>/skills/` - point one there with a line in `AGENTS.md`, or `npx skills add gabeklein/expressive`.

- [#46](https://github.com/gabeklein/expressive-orm/pull/46) [`acd61f1`](https://github.com/gabeklein/expressive-orm/commit/acd61f112e38d330fe7c990e974bf6595a59699a) `Rows`, the type of a `rows()` field, is exported. `static subset` is documented: it scopes a class to part of a shared table.

## 0.13.0

### Minor Changes

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`23f442c`](https://github.com/gabeklein/expressive-orm/commit/23f442c449927b10c9fb9b240eaa5161e6a01672) **Datatypes as modifiers.** `sql.*` names a column's datatype, with factories for sized ones: `num(sql.bigint, null)`, `str(sql.varchar(120), unique)`, `num(sql.decimal(10, 2))`. A datatype of another helper, like `num(sql.text)`, is a type error. `@expressive/postgres` adds `sql.serial`, `sql.timestamptz`, `sql.timetz` and `sql.interval`. `unique` and `index` join `optional` as modifiers; `null` replaces `orNull`, which is deprecated.
  
  **Indexes.** `index`, or `{ index: "name" }`, makes `sync` create a missing index, named `<table>_<column>` by default. On SQLite an existing single-column index on the column counts.
  
  **`key()` declares any id.** `key()` is an incrementing integer, typed `number`; `key(sql.text, { column: "name" })` a string required on insert; `key(sql.uuid)` a string generated on insert as a UUIDv7 when absent. A non-integer numeric key does not increment. `uuid()` is deprecated for `key(sql.uuid)` or `str(sql.uuid)`.
  
  **Epoch dates.** `date(sql.ms)` stores a `Date` as epoch milliseconds - INTEGER on SQLite, BIGINT on Postgres; `date(sql.seconds)` names the existing epoch-seconds `integer` storage.
  
  **`Query` is a `Promise`.** It has `catch` and `finally`, so returning one from an async function typechecks.

- [#16](https://github.com/gabeklein/expressive-orm/pull/16) [`d4ee4e4`](https://github.com/gabeklein/expressive-orm/commit/d4ee4e443867520f8422b4c9b5bb240157ae3449) Rebuilt on `@expressive/mvc`. Entities are Models, the driver contract is a small floor with optional capabilities, and `Query` lives here.
  
  **Entities are Models.** `Type` extends `Model` from `@expressive/mvc`, now a peer dependency (`^0.94.0`). Observe an entity with `get(effect)` or `set(callback)`; destroy it with `set(null)`. Field helpers (`str`, `num`, `bool`, `date`, `uuid`, `json`, `one`) are `def` instructions; the private `use`/`init` registry is gone.
  
  **Renamed**
  
  - Static `Type.get(where, limit, offset)` is `Type.find`.
  - Field `get(Child)` is `rows(Child, key?)`: a handle with `find`, `one` and `insert` applying the foreign key. It no longer mints a subclass of `Child`.
  - The driver floor's `get(table, constraints, limit, offset)` is `select` - `get` is Model's.
  - The constraint query behind `find`, `one` and `all` is the protected `fetch`.
  - A `Field`'s JS constructor moves from `type` to `kind`; `type` is the datatype string.
  - `Type.KeyOf` and `Type.Result` are removed.
  - `values` is `columns`: the row keyed by property, decoded, a relation as its id - never suspending or loading a relation - in the shape `insert` takes. `get()` is the full snapshot. The `Values` type is `Columns` (`Type.Columns<T>`).
  
  **Rows.** Static reads return plain data; an instance is a reference for working with one live row.
  
  - `find`, `one` (`one(id)` included), `all` and the `rows()` handle's `find` and `one` resolve rows in the `columns` shape: decoded, a relation as its id, frozen, JSON-safe. They neither read nor fill the identity map; `one(id, reload)` is gone. Take an instance with `Type.get(id)`.
  - A row passed as a relation value - to `insert`, a filter or a query insert - stands for its id.
  
  **Writes**
  
  - Entities are read-only: assigning a field throws `User.name is read-only; use set().` `save()`, instance `update(data)` and dirty tracking are gone.
  - `await entity.set(patch)` is the write: it prepares the patch, updates the row, then settles the stored values into the entity - observers notified once - and resolves to the keys that changed. A relation takes an entity, an id or a row; `null` clears a nullable column, here and in static `update`. It rejects on a deleted entity, or one still loading. `set`'s other forms are Model's.
  - `Type.new(values)` inserts a row. It returns the entity at once, its columns suspending until the row lands; awaiting resolves to it with its `id` and defaults, registered in the identity map. A failed insert destroys it and rejects awaits and pending reads; awaited, it stops there, otherwise mvc reports it to `catch` as `setup`.
  - Static `update(id, data)` writes by id, resolves `void` and settles the written values into a loaded entity, so it stays current without live rows.
  - `insert(data)` always inserts, so a supplied key is written, and resolves the stored row - `id` and database defaults included - not an entity. `rows()`'s `insert` likewise.
  - Static `delete(id)` removes a row by id, evicting and destroying a loaded entity.
  - `delete()` evicts the entity and destroys it. `set(patch)` and `delete()` on a deleted entity reject.
  - `all(pageSize, where?)` pages through `find`; `subset` scopes a class's reads and writes.
  
  **Relations**
  
  - `one(Other)` holds a reference: not adopted, not destroyed with its parent, and parents sharing a row read the same instance. It records `onDelete` and `onUpdate`.
  - `one(Other, lazy)` reads like an unset mvc property: the first read starts the load and throws mvc's suspense, resolving when the entity lands. Setting an id loads it the same way unless already loaded.
  
  **Columns**
  
  - `str`, `num`, `bool` and `date` build datatype-aware fields that validate on write: `str` checks type and `length`, `num` rejects non-numbers and `NaN`, `bool` rejects non-booleans and stores through `either` (default `1`/`0`), `date` rejects values that are not a date. `datatype` composes `type` with `length`, `precision`/`scale` and `collate`. `json` is `text`.
  - Each helper and `one` carries a `Types` interface for adapters to augment - `declare module '@expressive/orm' { namespace str { interface Types { varchar: VarChar } } }` - narrowing `type` and typing options per datatype. `str.Type`, `num.Type`, `bool.Type`, `date.Type` and `one.Type` hold the field class each helper constructs; an adapter replaces it with a subclass.
  - `optional`, `fallback`, `increment` and `primary` make a key optional in `Type.Insert` and a query insert; the property stays value-typed.
  - `id` is `num({ primary: true, increment: true })`, typed `string | number`. Redeclare it with any helper carrying `primary` to narrow it: `id = num({ column: "user_id", primary: true })` is a `number`, `id = uuid({ primary: true })` a `string`. `one(id)`, `update(id)`, the identity map and relation inputs follow it.
  
  **Connections**
  
  - `Connection` is an abstract class extending `Model`, exported from here. Construct one with `.new(types, ...)`, or bare `new` as a field of a Model that owns it. `using` binds each class's `Type.connection`; `close()` destroys the connection, its identity map and every entity loaded through it, and unbinds the classes. Awaiting a connection runs `sync` once, when it has one.
  - The floor is `select`, `insert`, `update(id)` and `remove(id)`, keyed by the class's primary column. Optional: `prepare(builder)` for `Query`, `subscribe(listener)` for live rows, `sync(fix?)` for schema.
  - The identity map is held per connection instead of module-global.
  
  **New**
  
  - Live rows. A driver's `subscribe(listener)` reports `{ table, op, id, row? }`. A loaded entity settles an `update`, reloading the row when `row` is absent; a `delete` destroys and evicts it; an `insert` changes nothing.
  - References. `Type.get(id)` returns the loaded entity or a placeholder registered in the identity map at once, loading the row. Its columns suspend until the row lands; awaiting it resolves to the entity. It and `Type.new` return `Type.Async<T>` - the entity, typed awaitable, so `await` is not flagged as redundant. A missing row rejects awaits and pending reads with `No {Type} found with id {id}` and evicts the placeholder. `get()` and `get(false)` stay Model's context lookup.
  - `memory()`, an in-memory connection: auto-increment ids, every constraint operator, `Query` executed over arrays (joins, nested and/or filters, order, limit, offset, projections, math and bitwise ops, parameters, data tables, inserts, updates and deletes across joins; raw templates throw), and every write reported through `subscribe`.
  - `Query` moves in from `@expressive/sql`. `Query(where => ...)` records tables, joins, filters, order, limit, selections, inserts, updates and deletes over entity classes; a connection's `prepare` renders or runs it. `where(Post).user.name` joins through `one()` - inner when required, left when nullable. A whole-entity selection resolves rows, as `find` does; `Query.Selects<Query.From<T>>` resolves `Type.Columns<T>[]`. A table inside a projection is the same row (`undefined` for a missing left join), and every result object is frozen. Without `prepare`, awaiting throws and `String(query)` lists the intent. `Type.query(fn?)` starts from the class.
  - Exports for drivers and generators: `Connection`, `Builder`, `Computed`, `DataField`, `DataTable`, `Parameter`, `QueryTemplate`. `Builder` carries `offset`.
  
  **Packaging.** ESM only, built with tsdown; modules no longer trip over circular imports when evaluated one by one. Most applications install `@expressive/sql`, which depends on and re-exports this package. The PGLite test harness is removed.
  
  Requires `@expressive/mvc` `^0.94.0`.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`0149fbe`](https://github.com/gabeklein/expressive-orm/commit/0149fbefd67b74f87ac9599b6f9b9bde4935e434) **A relation's column is named after its property.** `author = one(User)` stores `author_id`, not `user_id`; relations named after their class keep their column. Two fields on one column throw when the class is first used. On a table still holding the old column, sync reports the relation instead of adding an empty one: add `{ column: "user_id" }` to keep it.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`b9d339f`](https://github.com/gabeklein/expressive-orm/commit/b9d339f65bfdaf9fc68d06e2d4d9b509c86600b8) **`expressive sql check | sync [--force] <entry>`.** A bin, shared by `@expressive/*` packages, that imports the module creating your connections with `sync` held back, then reports or applies what each connection's schema needs. `check` exits 1 when anything would change and marks drift `--force` can rebuild.
  
  **`plan(force?)`.** SQL connections return what `sync` would do - `{ steps, problems }`, each step with `action`, `reason` and `sql` - without doing it. `sync` applies the plan in one transaction, and verify-only `sync(false)` now also reports missing indexes. A table referencing one the same sync creates no longer fails as a missing referenced table.
  
  **`sync(true, true)` rebuilds drift.** A column whose type or nullability differs from its class is altered on Postgres and rebuilt with its table on SQLite, keeping columns the class doesn't declare, indexes and triggers, and casting values. It refuses while a row would not fit - a NULL under `NOT NULL`, or text that is not a number for a numeric column - or while any row references a missing one. `plan()` is abstract on `Connection`; a custom subclass implements it.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`3c9c7a2`](https://github.com/gabeklein/expressive-orm/commit/3c9c7a2737be328077bf4c8c34060b60fbf338ef) **Transactions.** `connection.transaction(fn)` runs `fn` in one database transaction, committing when it resolves and rolling back when it throws. Statements inside join it without a handle, through `AsyncLocalStorage` loaded on first use; a nested call joins the open transaction, so a caught nested failure commits with it. On SQLite and PGlite, other statements wait until it ends and transactions queue; `pg` runs each on its own pooled client, discarding a client whose `BEGIN`, `COMMIT` or `ROLLBACK` failed. A rollback restores instances changed inside, destroys entities created inside and keeps entities deleted inside; a commit destroys those. SQLite and Postgres support it. Where `AsyncLocalStorage` is missing it throws, and `memory()` has none.
  
  **Driver contract.** orm's `Connection` declares an optional `transaction(fn)`. `@expressive/sql`'s `Connection` implements it over a protected `transact(fn)`, which a driver provides, plus `lock()` and an `idle()` its statements await - a pooled driver overrides both.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`cdf383b`](https://github.com/gabeklein/expressive-orm/commit/cdf383be6f92e34b2b75b3764696855ba83c872f) **Upsert.** `Type.insert(data, { conflict })` writes `ON CONFLICT`. `"update"` overwrites the existing row with every column given, minus the target and `keep`, returns it and settles a loaded instance; `"ignore"` leaves it and resolves `undefined`. `on` names the target - a key or keys, the primary key by default. The memory driver matches.
  
  **Composite keys.** `id = key(() => [this.account, this.role])` keys an entity by the fields it lists, with no column of its own. `id` is a string - the parts as JSON - typed as a key of their tuple (`Type.Id<T>` takes either), so it compares by value. `get`, `one`, `update` and `delete` take the key or the tuple, the identity map holds it, a part change through `set` or `update` rekeys a loaded instance, and `sync` declares `PRIMARY KEY (...)` - existing tables included. Live rows report a composite id on Postgres and memory. `one()` cannot relate to a composite-keyed class.
  
  **Driver contract.** `insert(table, data, returns?, conflict?)` takes `Connection.Conflict` (`{ on, update? }` by column). `update` and `remove` take `Connection.Key`, which is a tuple for a composite key; `Change.id` likewise. `Field.parts` lists a composite key's fields.

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`a5fe1d2`](https://github.com/gabeklein/expressive-orm/commit/a5fe1d2b7c60a8a5a4485924d6ac50e99719caee) **`sql.now`.** The current time, wherever a date goes: a column `fallback`, an insert or update value, a comparison. In `Query` it renders as the database's clock in the column's own storage - ISO text with milliseconds, epoch ms or seconds, `date`, `time`, `timestamptz`; statics resolve it from the app's clock so settled instances hold the exact value. `fallback: "NOW"` is a deprecated alias, and a new SQLite `timestamp` default is ISO text with milliseconds rather than `CURRENT_TIMESTAMP`'s `YYYY-MM-DD HH:MM:SS`, which reads as UTC.
  
  **`date.created()` and `date.updated()`.** Date columns defaulting to now; `created` is never overwritten after insert, `updated` is set to now on every update and upsert that doesn't give it. They are `date()` with `{ fixed: true }` and `{ update: sql.now }`, which any column takes. A fixed column is left out of update types and throws if given to `update()` or `set()`; `update` also takes a function, called once per write.
  
  **`conflict: "replace"`.** An upsert setting every column from the new row - an omitted one to its default or NULL - except the primary key, `date.created` columns and `keep`. An upsert's `update` values apply only on conflict; a new row gets its `fallback`.
  
  **Writes by query.** `update(where, data)` and `delete(where)` take a query object in place of an id and resolve the rows affected, settling into or destroying loaded instances; an empty query throws. `count(where?)` counts rows. `null` in a query object matches a missing value. In `Query`, `where(table).match({ ... })` adds an `equal` per key.
  
  **`json()`** reads unparseable text as `undefined` instead of throwing, and `isLike` matches a `json()` column's stored text.
  
  **`Key<P>`** is exported, and a composite `id` is typed `Key<[number, string]>` rather than `Optional<KeyOf<...>>`.
  
  **Fallbacks fill on insert.** An omitted column with a `fallback` is written with it by the orm, not left to a database `DEFAULT` - a table created before the fallback existed gets it too. A nullable column defaulting to now can now be added to an existing SQLite table.
  
  **SQLite enforces foreign keys** on every driver; `bun:sqlite` left them off.

### Patch Changes

- [#22](https://github.com/gabeklein/expressive-orm/pull/22) [`338865e`](https://github.com/gabeklein/expressive-orm/commit/338865e3a62f411801517b02fc04b0c13832fc89) Fixes found adopting an existing SQLite database:
  
  - SQLite `sync` accepts a primary key column not declared `NOT NULL`, as tables created outside the library usually are.
  - A count `Query` (no selection) resolves the matching row count on SQLite and Postgres; it resolved 0 on SQLite and the affected rows on Postgres.
  - A table joined twice in one `Query`, such as two relations to the same class, is aliased instead of failing with an ambiguous column.
  - `insert({})` writes `DEFAULT VALUES`. An insert per joined row with no values throws a clear error.

## 0.6.0

### Minor Changes

- Added one() instruction, field process is now asyncronous.

## 0.5.3

### Patch Changes

- build

## 0.5.2

### Patch Changes

- bugfix: preprocess where-fields before sending to query

## 0.5.1

### Patch Changes

- build

## 0.5.0

### Minor Changes

- refactored fields, snake_case table and column names

## 0.4.7

### Patch Changes

- bugfix: child types could not be renamed

## 0.4.6

### Patch Changes

- build

## 0.4.5

### Patch Changes

- init orm
