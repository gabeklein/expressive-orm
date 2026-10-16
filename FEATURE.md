# Expressive ORM on mvc

`@expressive/orm` rebuilt on `@expressive/mvc` Model, with `Query` moved in from `@expressive/sql`. Scope and agreed shape - update as decisions land.

## Workflow

- `feat/mvc` is the trunk. Each step lands as its own PR into it, small enough to hand-review; the trunk merges to `main` when `@expressive/orm` is release-ready.
- Merge `main` into the trunk as it moves. A seam missing in mvc lands on `expressive-mvc` `main` as its own PR; the trunk takes the released version, never a link.
- Stack PRs: each targets the previous one's branch, the bottom one the trunk; merge a lower branch up into the ones above it as it moves.
- `pr.yml` verifies PRs into any base: typecheck, tests under each package's coverage gate, build, changeset status. Gates ratchet up as the rebuild lands; `orm` reaches 100% in PR 1.
- Tests: vitest via `bun run test`, adjacent `*.test.ts`, root `vitest.config.ts` as in expressive-mvc. The memory driver is the test floor; PGLite and sqlite suites stay in their adapters.
- Policy lives in `AGENTS.md`; changesets per user-facing change, written in the PR that makes it.
- Trunk commits carry no trailers.

## Why

A Model is reactive, owned, placed, observable and - through dev - remote. It is not durable. The entity is a Model whose identity is a row: the same class is the domain model, the schema, the server instance and the client twin. Drivers are pluggable behind a small contract; SQL is the top rung, not the floor.

Baseline: `@expressive/mvc` 0.89.0.

## Agreed shape

- **`Type extends Model`.** Fields are `def` instructions. `Type.new(values)` is Model's sync construct of an unsaved entity, hydration included (`Model.new` accepts an assign overlay). Columns are writable and dirty-tracked; `save()` flushes, `update(data)` is assign then save. `delete()` removes the row and destroys the instance.
- **Field helpers** `str`, `num`, `bool`, `date`, `uuid`, `json` keep their config grammar (`orNull`, `optional`, `{ column }`, codecs). Config is a superset of sql's `Field` - `datatype`, `length`, `unique`, `fallback`, `increment`, `primary`, `reference` - unused by floor drivers, read by schema sync and the builder. Codecs are sync; an optional async `prepare` hook covers hashing.
- **Relations.** `one(Other, orNull, lazy)` is a `def` whose getter suspends through mvc. `rows(Other)` returns a bound collection handle (`find`, `one`, `insert`, `count`) with the foreign key implied - replaces `get(Child)`'s minted subclass.
- **Primary key.** `id` is the property; type (number or string) and column are configurable. The base `id` is `num({ primary: true, increment: true })` typed `string | number`; a subclass redeclares it with any helper carrying `primary`, and the helper's type narrows it - `id = num({ column: "user_id", primary: true })` is a `number`, `id = uuid({ primary: true })` a `string`. No type parameter on `Type`. `one(id)`, `update(id)`, the identity map and relation inputs follow `T["id"]`. sql's `Primary()` init hooks are not ported - statics cover table and schema.
- **One column vocabulary.** orm's helpers `str`, `num`, `bool`, `date`, `uuid`, `json`, `one` are the only column grammar; `sql.Table` and its `Str`/`Num`/`Bool`/`Time`/`One`/`Primary` retire in 5b. Each helper builds a datatype-aware `Field` subclass held in `<helper>.Type` (`uuid` shares `str.Type`) that validates on `set` and composes `datatype` from `type`, `length`, `precision`/`scale`, `collate`; adapters replace the class with a subclass for dialect renderings and checks. Options apply after construction, so subclass defaults yield to them. Adapter datatypes augment the helper: `declare module '@expressive/orm' { namespace str { interface Types { default: Text; varchar: VarChar } } }` narrows `type` and types options per datatype; properties stay value-typed.
- **One SQL vocabulary, in sql.** sql augments the helpers once and registers the column classes (`StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn`, exported) carrying shared validation - `varchar`/`char` length, integer ranges, numeric precision and scale. `str`: `text` (default), `varchar`, `char`, `uuid`; `num`: `integer` (default), `smallint`, `bigint`, `real`, `float`, `double`, `numeric`, `decimal`; `bool`: `boolean` (default, a JS boolean), `integer` (1/0), `text` and `varchar` with `either`; `date`: `timestamp` (default), `date`, `time`, `integer` (unix seconds), `text`; `one`: `integer` (default), `bigint`. A field's `datatype` is the real type; SQLite renders its affinity (`TEXT`, `INTEGER`, `REAL`, `NUMERIC`) in DDL, Postgres the type. postgres adds only what SQLite cannot express - `num` `serial`, `date` `interval` with `fields`, `timezone` on `timestamp` and `time` - merged into the same interfaces without redeclaring a member, and subclasses `TimeColumn`. A column config moves from SQLite to Postgres unchanged. The augmentations live in modules whose class the package root exports, so the built `index.d.ts` carries them to a consumer importing only a connection.
- **Insert optionality.** `optional`, `fallback`, `increment` and `primary` make a key optional in `Type.Insert` and `Query.Insert` through a `"~optional"` brand on the property type; `nullable` keeps `| undefined`.
- **Portable query shape.** `{ name: isLike('a%'), id: desc() }` compiles to constraint tuples. Serialisable, served by every driver through the floor.
- **Class metadata per class.** `fields: Map<string, Field>`, `table`, `schema`, `connection` - exactly what the builder reads. Collected once per class via `Model.on({ type })`.
- **Connection per class, resolvable.** `static connection` stays (multi-provider), read through a getter so a host can default it from context.
- **`Connection extends Model`.** orm's abstract `Connection` holds `using` (binding each class's `Type.connection`, throwing for a class already bound), `ready`, the thenable that runs `sync` once when present, and `close()` as destruction. Construct with `.new(...)` - typed over the subclass constructor - or bare `new` as a field of a host Model that owns it. sql's `Connection` extends it with the SQL floor over `Query`, `prepare` through the generator and schema; `memory()` returns an unexported `Memory` subclass. `Type.Connection` names the contract: the class without `then`, which a `Query` or class static holds.
- **Identity map on the connection.** A plain `Map` per class in the connection's unmanaged `_loaded` - lookups need no reactivity. Destroying the connection destroys every entity loaded through it and unbinds its `using` classes. A class reaching the floor through a connection registers its map there, which is how memory resolves a table's key column. No module-scope registries; placement (context, `static global`) is a host's concern.
- **Driver contract.** Floor: `select(table, constraints, limit, offset)` - not `get`, which is Model's - `insert`, `update(id)`, `remove(id)`, keyed by the class's primary column. Capabilities, each optional: `prepare(builder)` for `Query`, `subscribe` for live rows, `sync` for schema. `Type.query(where => ...)` throws unless the resolved connection has `prepare`.
- **`columns` is the row.** `values` is gone - mvc's `get()` is the snapshot, and as a computed it suspended on an unloaded lazy relation. `entity.columns` is a live accessor (getter plus a throwing setter), so it stays out of `get()` and reads through an effect's proxy: every column, relations included, is subscribed. Keyed by property, decoded, a relation as its id - the loaded entity's `id`, or the id `one()` holds until it loads - never suspending or loading; frozen, JSON-safe, the shape `insert` takes. Typed `Type.Columns<T>`.
- **Live rows.** `subscribe(listener)` returns a stop function; a driver reports changes it did not necessarily make through this instance as `{ table, op: "insert" | "update" | "delete", id, row? }` - `table` the class's `ref`, `id` and `row` as stored. orm subscribes when the first class registers its identity map and stops when the connection is destroyed. An `update` for a loaded entity decodes `row` - or reloads it through `select` when absent - and settles the fields not dirty locally: unsaved edits win, and a later `save()` writes them. A `Date` equal in time is not reassigned. A `delete` evicts and destroys the entity. An `insert` changes nothing - the seam for table-level listeners. Applications observe entities; there is no `connection.subscribe(Type, cb)`. Memory reports every write through it, floor or `Query`. Postgres installs one `expressive_notify()` function and a per-table trigger on `sync`, `pg_notify`ing channel `expressive_orm` with the row unless the payload passes 8000 bytes; `PGConnection` listens on a client checked out of its pool, `PGLiteConnection` through PGLite's `listen`. SQLite has none - neither `node:sqlite` nor `bun:sqlite` exposes an update hook.
- **`Query` ships here.** Builder, values, computed ops record intent; a driver's `prepare` renders or executes it. The string generator stays in sql. `String(query)` with no connection dumps intent.
- **Memory driver in core.** Floor plus `prepare` executed as procedures over arrays - the test floor and the first non-SQL driver. Templates unsupported.
- **Names.** `Type.new` constructs; `insert(data)` persists and returns the entity; `find(where, limit, offset)` replaces static `get`; `rows()` replaces field `get`; `query` is the builder sugar; the constraint query behind `find`, `one` and `all` is the protected `fetch`. `one`, `all`, `update(id, data)`, `subset` keep their names.
- **Package graph.** orm peers mvc; nothing peers orm. sql depends on orm and re-exports it, and holds the generator base, the SQL connection base - the floor over `Query`: `get`, `insert`, `update`, `remove` as builder statements against the class registered for the table, values bound as parameters - the SQL datatype vocabulary, and SQLite: its generator, `SQLiteConnection` and a runtime driver autodetect (`bun:sqlite`, `node:sqlite`, then `better-sqlite3`, `sqlite3`, `@libsql/client` as optional peers). sql alone is a working embedded store on Bun or Node 24. postgres depends on sql and orm and re-exports sql. Each declares mvc as a peer, surfacing orm's. Internal dependencies are carets of the current release, kept in step by changesets. Users import entities, `Query` and a connection from one package - sql, or postgres for Postgres. `@expressive/sqlite` is deprecated: a re-export of sql, removed in a later release. dev depends on sql as its built-in default.
- **Generator seams.** orm exports `Computed`, `DataField` and `QueryTemplate` beside `Parameter` and `DataTable` so a generator can render every value; `Builder.offset` carries the floor's paging. A `null` comparison renders `IS NULL` / `IS NOT NULL`; an insert with a selection renders `RETURNING`.
- **`Query` in orm.** `Query`, `Builder`, `Parameter` and `DataTable` export from orm; the structural table the builder reads is `Query.Table` - `{ fields, table, schema?, connection? }`, which `Type` satisfies. `Query.From<T>` maps a `Type`-valued key to a joined proxy (`Query.Join` when nullable) and any other value `V` to `Field<V>`; methods and `rows()` handles are excluded. Nullability is `undefined extends T[K]`.
- **One `Field`.** `type` is the datatype string; the JS constructor a helper records is `kind`. A relation field holds `entity`, `reference` (the target's `id` field) and `use(builder)`: a required `one()` inner joins, a nullable one left joins.
- **Intent dump.** `String(query)` is the connection's rendering; without `prepare`, and in the memory driver, it is a line per clause: `from`/`join`/`left join`/`with` tables and their `on` conditions, a `where` per top-level filter (groups alternate `or`/`and` in parentheses), `insert`/`update` with indented `key: value` lines, `delete`, `order`, `limit`, then `select` - a value, indented aliases, a table for a whole entity, or `count`.
- **Whole-entity selections hydrate.** A table proxy returned from the top of a query parses through the class's `parse`, so rows are identity-mapped entities; nested proxies and projections return plain objects.
- **Not this repo.** Twin seams (static calls, keyed twins, entity references in replies, `Query` exports) are dev's, generic over Model. orm declares, at most, which base statics may cross.

## Build plan

One PR each, in order.

1. **`Type extends Model`.** `Type` on Model; field helpers as `def`; per-class metadata via the `type` hook; memory driver (floor only); port `Type.test.ts` and `one.test.ts` with the renames. PGLite harness retired.
2. **Relations.** `one()` on mvc suspense, eager and lazy; a related entity is a reference, never adopted; `rows()` handle with `find`, `one`, `insert`. The identity map stays a `WeakMap` keyed by connection.
3. **Writes.** Dirty tracking, `save()`, `update()`, `delete()`, `onDelete`; `insert` returning the entity; `all()` paging; `subset`.
4. **`Query` moves in.** *Landed in substance.* Builder, values, computed, `Query` factory from sql; `Builder.use()` structural over `Type`'s metadata; `From<T>` over value-typed classes (`T[K] extends Type ? From<T[K]> : Field<T[K]>`); `prepare` capability; memory driver executes the builder.
5. **sql thinned.**
   - **5a. Column vocabulary in orm.** Datatype-aware field classes behind the helpers, `Types` augmentation and the `.Type` hook on each, `Insert` optionality from `optional`/`fallback`/`increment`/`primary`, a redeclarable `id`, `one()` `onDelete`/`onUpdate`. sql and the adapters untouched.
   - **5b. sql thinned, adapters re-pointed.** *Landed in substance.* Generator base and SQL connection base remain, peered on orm, the floor over `Query` in the base; `sql.Table`, its columns and sql's `Query` retire; sqlite and postgres augment and subclass orm's helpers and render schema from orm's metadata; string snapshot tests live beside the generator. Entities round-trip on sqlite and PGLite.
6. **Adapters.**
   - **6a. Package consolidation.** sql absorbs sqlite - dialect, connection, driver autodetect and tests; sql depends on and re-exports orm, postgres on and re-exports sql; one SQL datatype vocabulary in sql, postgres declaring only its extras; augmentations reach consumers through the built `index.d.ts`; `@expressive/sqlite` a deprecated re-export. SQLite `sync` awaits validation and creates only missing tables, so a file reopens.
   - **6b.** *Landed in substance.* Connections are Models owning the identity map; `subscribe` in memory and postgres via LISTEN/NOTIFY; the renamed-key-column round trip on memory, SQLite and PGLite. An incrementing Postgres `id` is `GENERATED BY DEFAULT AS IDENTITY`, accepting an explicit id as SQLite and memory do.
7. **Docs + release.** *Landed.* Root README replaced for the rebuilt API, a README per package, every sample run against the built dists (SQLite in memory, PGLite, `memory()`) and under `tsc`; package metadata (`description`, `keywords`, `repository`, `homepage`, `bugs`, `pg` as an optional peer); the trunk's changesets consolidated into one release note per package. Sample runs fixed `json` (no datatype, so Postgres rejected the table) and `time` with `timezone` (read as an invalid date).

## Release

The trunk is release-ready: four minors - `@expressive/orm` 0.13.0, `@expressive/sql`, `@expressive/postgres` and `@expressive/sqlite` 0.5.0. Merging it to `main` lets `release.yml` open the "chore: version packages" PR from the changesets; merging that PR builds and publishes all four from CI. After publish, the maintainer runs `npm deprecate @expressive/sqlite "Use @expressive/sql, which includes the SQLite connection."` - the shim stays installable until a later release removes it.

## Open

- mvc: the value an async effect resolves to is the effect's tracking proxy, not the entity (`user.is === post.user`, `user !== post.user`). Raise upstream.
- `rows()` handle `count` - deferred from PR 2; lands with a driver aggregate or the builder.
- `Type.fields` forces one `new()` + `set(null)` when no instance has activated - a `new()` hook with side effects runs once for metadata. Revisit if it bites.
- Which base statics cross to a client twin, and how orm declares it.
- Templates as inputs to a written column (`where(User, { name })` with `name` a template argument) - unsupported, as in sql.
- Async codec hook naming and where it runs relative to the builder's sync digest.
- A host defaulting `Type.connection` from context - a connection placed by a provider, resolved through the getter - is dev's concern.
- Constructing a connection with bare `new` outside an owning Model leaves it unactivated: mvc warns at the end of the tick. `.new()` is the root form.
- `vi.spyOn` on a Model method not yet read fails - tinyspy calls mvc's binding getter without a receiver. Tests read the method first; a fix belongs in mvc.
- A `pg` LISTEN that fails rejects unhandled; queries surface the same fault, but a pooler that drops notifications (transaction mode) does so silently.
- Postgres `sync` reinstalls the trigger function and triggers each time, including `sync(false)`. Notifications carry the bare table name; postgres maps it to the class's `ref` through `using`, so a table no class uses is ignored.
- A Postgres identity sequence does not advance past an explicit id - a later generated id can collide.
- The postgres trigger's row is `to_jsonb` - numbers, booleans and strings decode as from a query; a `json` column read as text would not. Untested beyond scalars and `timestamp`.
- A query with no selection (`select count`) runs through the statement's `run`; SQL adapters return affected rows, so a bare select counts 0 there while memory counts rows.
- `one()` with `optional` or `fallback` is not optional in `Insert` - the brand would add a key to the entity type the relation maps over.
- One program holding both SQLite and Postgres connections shares one registered column class per helper - postgres's `TimeColumn` then formats SQLite timestamps too. Column serialisation is per helper, not per connection.
- postgres's `TYPE_SYNONYMS` maps `real` to `float`, but Postgres `float` is `double precision`; verification would pass a mismatch.
- orm's built `query/Query.d.ts` declares `const Builder: typeof Builder` inside `namespace Query`; a consumer with `skipLibCheck: false` gets TS2502.

- `date({ type: "interval" })` renders the column but its values do not round-trip: a read is an invalid `Date`, a written `Date` is not an interval. Needs a value shape other than `Date`.
- `time` writes drop milliseconds whatever `precision` says (`toISOString().slice(11, 19)`), on SQLite and Postgres.
- `one(Other)` defaults its column to `${Other.table}_id`, so a second relation to the same class collides unless given a `column`. The README says so; a key-based default would rename existing columns.
- Hydrating a row through `find` or `Query` overwrites fields with unsaved edits and clears them (as agreed: loading leaves an entity clean), and reassigns an equal `Date`, so observers see a `joined` change on every reload. Live updates skip both.
- `num({ type: "serial" })` needs `optional` to insert without a value; the column default is the sequence, but nothing marks it omissible.
- Augmenting a helper's `Types` declares `module '@expressive/orm'`, so orm must resolve from the consumer - true under npm and bun hoisting, not under a strict pnpm layout without a direct dependency.

## Rejected

- `Table` from sql as the entity base - properties typed as `Field` cannot be a Model.
- Inline relation insert on assignment (a plain object assigned to `one()` creating a row) - too much magic for the first cut.
- Module-global identity map - contradicts `sideEffects: false`.
- A "lite" entity core in the mvc repo - turnkey sqlite needs schema generation, so dev depends on this repo either way.
- A tagged `sql` template as a product rung - escape hatch only.
