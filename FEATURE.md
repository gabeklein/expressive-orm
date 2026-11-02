# Expressive ORM on mvc

`@expressive/orm` rebuilt on `@expressive/mvc` State, with `Query` moved in from `@expressive/sql`. Scope and agreed shape - update as decisions land.

## Workflow

- `feat/mvc` is the trunk. Each step lands as its own PR into it, small enough to hand-review; the trunk merges to `main` when `@expressive/orm` is release-ready.
- Merge `main` into the trunk as it moves. A seam missing in mvc lands on `expressive-mvc` `main` as its own PR; the trunk takes the released version, never a link.
- Stack PRs: each targets the previous one's branch, the bottom one the trunk; merge a lower branch up into the ones above it as it moves.
- `pr.yml` verifies PRs into any base: typecheck, tests under each package's coverage gate, build, changeset status. Gates ratchet up as the rebuild lands; `orm` reaches 100% in PR 1.
- Tests: vitest via `bun run test`, adjacent `*.test.ts`, root `vitest.config.ts` as in expressive-mvc. The memory driver is the test floor; PGLite and sqlite suites stay in their adapters.
- Policy lives in `AGENTS.md`; changesets per user-facing change, written in the PR that makes it.
- Trunk commits carry no trailers.

## Why

A State is reactive, owned, placed, observable and - through dev - remote. It is not durable. The entity is a State whose identity is a row: the same class is the domain model, the schema, the server instance and the client twin. Drivers are pluggable behind a small contract; SQL is the top rung, not the floor.

Baseline: `@expressive/mvc` 0.88.0.

## Agreed shape

- **`Type extends State`.** Fields are `def` instructions. `Type.new(values)` is State's sync construct of an unsaved entity, hydration included (`State.new` accepts an assign overlay). Columns are writable and dirty-tracked; `save()` flushes, `update(data)` is assign then save. `delete()` removes the row and destroys the instance.
- **Field helpers** `str`, `num`, `bool`, `date`, `uuid`, `json` keep their config grammar (`orNull`, `optional`, `{ column }`, codecs). Config is a superset of sql's `Field` - `datatype`, `length`, `unique`, `fallback`, `increment`, `primary`, `reference` - unused by floor drivers, read by schema sync and the builder. Codecs are sync; an optional async `prepare` hook covers hashing.
- **Relations.** `one(Other, orNull, lazy)` is a `def` whose getter suspends through mvc. `rows(Other)` returns a bound collection handle (`find`, `one`, `insert`, `count`) with the foreign key implied - replaces `get(Child)`'s minted subclass.
- **Primary key.** `id` is the property; type (number or string) and column are configurable. The base `id` is `num({ primary: true, increment: true })` typed `string | number`; a subclass redeclares it with any helper carrying `primary`, and the helper's type narrows it - `id = num({ column: "user_id", primary: true })` is a `number`, `id = uuid({ primary: true })` a `string`. No type parameter on `Type`. `one(id)`, `update(id)`, the identity map and relation inputs follow `T["id"]`. sql's `Primary()` init hooks are not ported - statics cover table and schema.
- **One column vocabulary.** orm's helpers `str`, `num`, `bool`, `date`, `uuid`, `json`, `one` are the only column grammar; `sql.Table` and its `Str`/`Num`/`Bool`/`Time`/`One`/`Primary` retire in 5b. Each helper builds a datatype-aware `Field` subclass held in `<helper>.Type` (`uuid` shares `str.Type`) that validates on `set` and composes `datatype` from `type`, `length`, `precision`/`scale`, `collate`; adapters replace the class with a subclass for dialect renderings and checks. Options apply after construction, so subclass defaults yield to them. Adapter datatypes augment the helper: `declare module '@expressive/orm' { namespace str { interface Types { default: Text; varchar: VarChar } } }` narrows `type` and types options per datatype; properties stay value-typed.
- **Insert optionality.** `optional`, `fallback`, `increment` and `primary` make a key optional in `Type.Insert` and `Query.Insert` through a `"~optional"` brand on the property type; `nullable` keeps `| undefined`.
- **Portable query shape.** `{ name: isLike('a%'), id: desc() }` compiles to constraint tuples. Serialisable, served by every driver through the floor.
- **Class metadata per class.** `fields: Map<string, Field>`, `table`, `schema`, `connection` - exactly what the builder reads. Collected once per class via `State.on({ type })`.
- **Connection per class, resolvable.** `static connection` stays (multi-provider), read through a getter so a host can default it from context.
- **Identity map on the connection.** A `map` pool per class owned by the connection State, placed through `static global`. No module-scope registries.
- **Driver contract.** Floor: `get(table, constraints, limit, offset)`, `insert`, `update(id)`, `remove(id)`. Capabilities, each optional: `prepare(builder)` for `Query`, `subscribe` for live rows, `sync` for schema. `Type.query(where => ...)` throws unless the resolved connection has `prepare`.
- **`Query` ships here.** Builder, values, computed ops record intent; a driver's `prepare` renders or executes it. The string generator stays in sql. `String(query)` with no connection dumps intent.
- **Memory driver in core.** Floor plus `prepare` executed as procedures over arrays - the test floor and the first non-SQL driver. Templates unsupported.
- **Names.** `Type.new` constructs; `insert(data)` persists and returns the entity; `find(where, limit, offset)` replaces static `get`; `rows()` replaces field `get`; `query` is the builder sugar; the constraint query behind `find`, `one` and `all` is the protected `fetch`. `one`, `all`, `update(id, data)`, `subset` keep their names.
- **Package graph.** orm peers mvc. sql peers orm (builder types) and keeps the generator base and the SQL connection base, which implements the floor over `Query` - `get`, `insert`, `update`, `remove` as builder statements against the class registered for the table, values bound as parameters - so every SQL adapter inherits it. sqlite and postgres depend on sql, peer orm, and supply `prepare`, `sync` with schema generation, and `subscribe` where the store offers it. Users import entities and `Query` from orm and only a connection from an adapter; nothing user-facing imports sql. dev depends on sqlite as its built-in default and peers orm.
- **Generator seams.** orm exports `Computed`, `DataField` and `QueryTemplate` beside `Parameter` and `DataTable` so a generator can render every value; `Builder.offset` carries the floor's paging. A `null` comparison renders `IS NULL` / `IS NOT NULL`; an insert with a selection renders `RETURNING`.
- **`Query` in orm.** `Query`, `Builder`, `Parameter` and `DataTable` export from orm; the structural table the builder reads is `Query.Table` - `{ fields, table, schema?, connection? }`, which `Type` satisfies. `Query.From<T>` maps a `Type`-valued key to a joined proxy (`Query.Join` when nullable) and any other value `V` to `Field<V>`; methods and `rows()` handles are excluded. Nullability is `undefined extends T[K]`.
- **One `Field`.** `type` is the datatype string; the JS constructor a helper records is `kind`. A relation field holds `entity`, `reference` (the target's `id` field) and `use(builder)`: a required `one()` inner joins, a nullable one left joins.
- **Intent dump.** `String(query)` is the connection's rendering; without `prepare`, and in the memory driver, it is a line per clause: `from`/`join`/`left join`/`with` tables and their `on` conditions, a `where` per top-level filter (groups alternate `or`/`and` in parentheses), `insert`/`update` with indented `key: value` lines, `delete`, `order`, `limit`, then `select` - a value, indented aliases, a table for a whole entity, or `count`.
- **Whole-entity selections hydrate.** A table proxy returned from the top of a query parses through the class's `parse`, so rows are identity-mapped entities; nested proxies and projections return plain objects.
- **Not this repo.** Twin seams (static calls, keyed twins, entity references in replies, `Query` exports) are dev's, generic over State. orm declares, at most, which base statics may cross.

## Build plan

One PR each, in order.

1. **`Type extends State`.** `Type` on State; field helpers as `def`; per-class metadata via the `type` hook; memory driver (floor only); port `Type.test.ts` and `one.test.ts` with the renames. PGLite harness retired.
2. **Relations.** `one()` on mvc suspense, eager and lazy; a related entity is a reference, never adopted; `rows()` handle with `find`, `one`, `insert`. The identity map stays a `WeakMap` keyed by connection.
3. **Writes.** Dirty tracking, `save()`, `update()`, `delete()`, `onDelete`; `insert` returning the entity; `all()` paging; `subset`.
4. **`Query` moves in.** *Landed in substance.* Builder, values, computed, `Query` factory from sql; `Builder.use()` structural over `Type`'s metadata; `From<T>` over value-typed classes (`T[K] extends Type ? From<T[K]> : Field<T[K]>`); `prepare` capability; memory driver executes the builder.
5. **sql thinned.**
   - **5a. Column vocabulary in orm.** Datatype-aware field classes behind the helpers, `Types` augmentation and the `.Type` hook on each, `Insert` optionality from `optional`/`fallback`/`increment`/`primary`, a redeclarable `id`, `one()` `onDelete`/`onUpdate`. sql and the adapters untouched.
   - **5b. sql thinned, adapters re-pointed.** *Landed in substance.* Generator base and SQL connection base remain, peered on orm, the floor over `Query` in the base; `sql.Table`, its columns and sql's `Query` retire; sqlite and postgres augment and subclass orm's helpers and render schema from orm's metadata; string snapshot tests live beside the generator. Entities round-trip on sqlite and PGLite.
6. **Adapters.** postgres `subscribe` via LISTEN/NOTIFY. Connections become States and own the identity map. The renamed-key-column round trip.
7. **Docs + release.** README per package, changesets, 0.x of orm first so dev can take it.

## Open

- mvc: `State.Assign<T>` types methods as `(this: T, ...)`, so a State with a method and a `this`-typed member is invariant and its subclasses stop being assignable to it. `Type` re-declares State's `set` overloads with `Compat<this>` until this is fixed upstream; the "will be assignable to Type" test pins it.
- `rows()` handle `count` - deferred from PR 2; lands with a driver aggregate or the builder.
- `Type.fields` forces one `new()` + `set(null)` when no instance has activated - a `new()` hook with side effects runs once for metadata. Revisit if it bites.
- Which base statics cross to a client twin, and how orm declares it.
- Templates as inputs to a written column (`where(User, { name })` with `name` a template argument) - unsupported, as in sql.
- Async codec hook naming and where it runs relative to the builder's sync digest.
- The floor contract keys rows by the `id` property: `update(table, id)` and `remove(table, id)` in sql's base follow a redeclared `id` column, the memory driver's generated key does not. The SQL round trip with a renamed key column is untested.
- A query with no selection (`select count`) runs through the statement's `run`; SQL adapters return affected rows, so a bare select counts 0 there while memory counts rows.
- Adapter `Types` augmentations reach consumers only where the adapter's column modules are in the program; tsdown drops side-effect imports from `.d.ts`, so a consumer importing only the connection sees un-narrowed `type` options.
- sqlite's `sync` does not await `valid()`, so a missing table never throws and `checkIntegrity` races schema creation.
- `one()` with `optional` or `fallback` is not optional in `Insert` - the brand would add a key to the entity type the relation maps over.

## Rejected

- `Table` from sql as the entity base - properties typed as `Field` cannot be a State.
- Inline relation insert on assignment (a plain object assigned to `one()` creating a row) - too much magic for the first cut.
- Module-global identity map - contradicts `sideEffects: false`.
- A "lite" entity core in the mvc repo - turnkey sqlite needs schema generation, so dev depends on this repo either way.
- A tagged `sql` template as a product rung - escape hatch only.
