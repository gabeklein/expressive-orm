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
- **Primary key.** `id` is the property; type (number or string) and column are configurable.
- **Portable query shape.** `{ name: isLike('a%'), id: desc() }` compiles to constraint tuples. Serialisable, served by every driver through the floor.
- **Class metadata per class.** `fields: Map<string, Field>`, `table`, `schema`, `connection` - exactly what the builder reads. Collected once per class via `State.on({ type })`.
- **Connection per class, resolvable.** `static connection` stays (multi-provider), read through a getter so a host can default it from context.
- **Identity map on the connection.** A `map` pool per class owned by the connection State, placed through `static global`. No module-scope registries.
- **Driver contract.** Floor: `get(table, constraints, limit, offset)`, `insert`, `update(id)`, `remove(id)`. Capabilities, each optional: `prepare(builder)` for `Query`, `subscribe` for live rows, `sync` for schema. `Type.query(where => ...)` throws unless the resolved connection has `prepare`.
- **`Query` ships here.** Builder, values, computed ops record intent; a driver's `prepare` renders or executes it. The string generator stays in sql. `String(query)` with no connection dumps intent.
- **Memory driver in core.** Floor plus `prepare` executed as procedures over arrays - the test floor and the first non-SQL driver. Templates unsupported.
- **Names.** `Type.new` constructs; `insert(data)` persists and returns the entity; `find(where, limit, offset)` replaces static `get`; `rows()` replaces field `get`; `query` is reserved for the builder. `one`, `all`, `update(id, data)`, `subset` keep their names.
- **Package graph.** orm peers mvc. sql peers orm (builder types) and keeps the generator base, SQL connection base, schema sync. sqlite and postgres depend on sql, peer orm, implement the floor over `Query` plus `prepare`, `sync`, and `subscribe` where the store offers it. dev depends on sqlite as its built-in default and peers orm.
- **Not this repo.** Twin seams (static calls, keyed twins, entity references in replies, `Query` exports) are dev's, generic over State. orm declares, at most, which base statics may cross.

## Build plan

One PR each, in order.

1. **`Type extends State`.** `Type` on State; field helpers as `def`; per-class metadata via the `type` hook; memory driver (floor only); port `Type.test.ts` and `one.test.ts` with the renames. PGLite harness retired.
2. **Relations.** `one()` on mvc suspense, eager and lazy; a related entity is a reference, never adopted; `rows()` handle with `find`, `one`, `insert`. The identity map stays a `WeakMap` keyed by connection.
3. **Writes.** Dirty tracking, `save()`, `update()`, `delete()`, `onDelete`; `insert` returning the entity; `all()` paging; `subset`.
4. **`Query` moves in.** Builder, values, computed, `Query` factory from sql; `Builder.use()` structural over `Type`'s metadata; `From<T>` over value-typed classes (`T[K] extends Type ? From<T[K]> : Field<T[K]>`); `prepare` capability; memory driver executes the builder.
5. **sql thinned.** Generator base, SQL connection base and schema sync remain, peered on orm; `sql.Table` retired or kept as builder-only base; string snapshot tests stay here.
6. **Adapters.** sqlite and postgres implement the floor over `Query`, keep `prepare` and `sync`; postgres `subscribe` via LISTEN/NOTIFY. Connections become States and own the identity map.
7. **Docs + release.** README per package, changesets, 0.x of orm first so dev can take it.

## Open

- mvc: `State.Assign<T>` types methods as `(this: T, ...)`, so a State with a method and a `this`-typed member is invariant and its subclasses stop being assignable to it. `Type` re-declares State's `set` overloads with `Compat<this>` until this is fixed upstream; the "will be assignable to Type" test pins it.
- `rows()` handle `count` - deferred from PR 2; lands with a driver aggregate or the builder.
- Static `Type.query(constraints)` is still public; PR 4 reserves `query` for the builder, so rename or protect it there.
- `Type.fields` forces one `new()` + `set(null)` when no instance has activated - a `new()` hook with side effects runs once for metadata. Revisit if it bites.
- Which base statics cross to a client twin, and how orm declares it.
- `Type.query` sugar shape vs importing `Query` directly.
- Whether `sql.Table` survives as a builder-only base.
- Async codec hook naming and where it runs relative to the builder's sync digest.
- Adapter column-type augmentation after property brands go: option types on the field helper.

## Rejected

- `Table` from sql as the entity base - properties typed as `Field` cannot be a State.
- Inline relation insert on assignment (a plain object assigned to `one()` creating a row) - too much magic for the first cut.
- Module-global identity map - contradicts `sideEffects: false`.
- A "lite" entity core in the mvc repo - turnkey sqlite needs schema generation, so dev depends on this repo either way.
- A tagged `sql` template as a product rung - escape hatch only.
