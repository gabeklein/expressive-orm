# Spike: MongoDB driver (`@expressive/mongo`)

`MongoConnection extends Connection` (from `@expressive/orm`) on the official `mongodb` driver (v6). Simple queries go straight to Mongo. Anything the translator can't express falls back to `evaluate` over a store backed by Mongo collections. 51 tests run on `mongodb-memory-server`: a single-node replica set for everything, plus one standalone server to check the limits. Coverage floors are 96/86/97/96. The package is `private` and has no changeset.

```ts
const db = MongoConnection.new([User, Post], "mongodb://localhost:27017", "app");
await db;                      // sync: collections + indexes
```

## Ids: `_id` *is* the primary key, numbered by a counters collection

I didn't pick one of the two options. I combined them. A single-column primary key is stored as `_id`, and the driver renames `id` ⇄ `_id` at the edge. When the key auto-increments (the default `key()`), a `__counters` collection issues the numbers through `findOneAndUpdate({ _id: table }, { $inc: { seq: 1 } })`. An explicit id `$max`-bumps the counter, the way the memory driver continues after an explicit id. The first number a connection issues for a collection seeds the counter from the highest numeric `_id` already there, so documents written by other means don't collide.

Why:
- **Numbers keep the ORM's types honest.** `key()` is typed `number`, `one()` stores the referenced id in a `num` column, and `Field.set` validates numbers. Switching to ObjectId would mean a Mongo-specific key type and FK column, and every entity written for SQL would change shape.
- **Storing it as `_id` costs nothing.** You get the mandatory unique index, `$lookup` on `foreignField: "_id"`, and change-stream `documentKey` all for free. A separate `id` field would need its own unique index and a lookup on every change event.
- String keys (`key({ type: "uuid" })`) pass straight through to `_id`. Composite keys stay as plain columns with a unique compound index, and `_id` stays an ObjectId that the driver hides.
- **Cost:** one extra round trip per insert, and a single hot counter document per collection. Counter updates deliberately run *outside* the transaction session, like a SQL sequence. Rolled-back inserts leave gaps, but concurrent transactions don't write-conflict on the counter.

## What maps cleanly

| ORM | Mongo |
|---|---|
| `select(table, constraints, limit, offset)` | `find(filter, { sort, skip, limit })` |
| `=` `>` `<` `>=` `<=` | `$eq` `$gt` `$lt` `$gte` `$lte` |
| `!=` / `<>`, `NOT IN` | `$nin: [v, null]`: SQL semantics, so a null never matches a negation |
| `IN` | `$in`, with nulls dropped |
| `IS NULL` / `IS NOT NULL` | `$eq: null` (also matches missing) / `$ne: null` |
| `LIKE` | anchored `$regex` (`%`→`.*`, `_`→`.`), case-sensitive like the memory driver |
| `LIKE`, `>` etc. against null | `$in: []`: matches nothing, as in SQL and `evaluate` |
| `insert` | `insertOne` |
| `insert` + `conflict: ignore` | `findOneAndUpdate(on, { $setOnInsert }, { upsert })`, checking `updatedExisting` |
| `insert` + `conflict: update` | `findOneAndUpdate(on, { $set })` first; on a miss, the upsert above (a lost race runs the `$set` once more) |
| `insert` + conflict, an `on` column missing | plain `insertOne`: like SQL, an absent value never conflicts |
| `update(id)` / `remove(id)` | `updateMany` / `deleteMany` on `_id` or the key parts |
| `sync()` | `createCollection` + `createIndex` for `unique` / `index` and composite keys |
| `transaction(fn)` | orm's `transaction` over `transact(fn)`: a `ClientSession` with `startTransaction` / `commit` / `abort`, kept on the journal's `session` |
| `subscribe` | `db.watch()`: insert, update (`updatedFields` / `removedFields`), replace and delete become `Connection.Change` |

`prepare(builder)` compiles a `Builder` to one of these:

- **Read:** one `aggregate` pipeline: `$match` on root conditions → `$lookup` + `$unwind` per joined table → `$match` on the remaining conditions → `$sort` (with an `_id` tiebreaker; BSON puts null and missing first ascending, which matches `evaluate`) → `$skip` / `$limit` → `$project`. `toString()` renders the pipeline, so the tests snapshot what Mongo receives.
- **Count:** the same pipeline plus `$count`.
- **Update / delete:** `updateMany(filter, { $set })` / `deleteMany(filter)` when there's one table, no ordering or paging, plain values, and no change to the primary key.

Parameters bind at execution time, and `now` is supported. AND/OR groups map to `$and` / `$or`, alternating the same way `evaluate` does.

**Joins become `$lookup` when** each joined table has exactly one `=` join condition to a table already bound. That covers every `one()` relation, including nested and repeated ones. Conditions on an inner-joined table move into the `$lookup` sub-`pipeline` (`localField`/`foreignField` + `pipeline` needs MongoDB 5.0+). Conditions on a left-joined table stay after `$unwind`, so `WHERE` semantics hold.

## What still needs `evaluate`

The fallback kicks in for:
- computed values (`fn.add(...)`) in a select, a filter or an update (`count = count + 1`)
- joins with zero conditions, more than one condition, or a non-`=` condition (self-joins, `a.x < b.y`)
- `DataTable` input (`where([...rows])`)
- `Query` inserts
- updates or deletes across joins, or with order, limit or offset
- primary-key changes inside a query update
- `QueryTemplate`: rejected outright, same as memory

The fallback isn't naive. Its `evaluate.Store` runs `find()` per table with the `where` constraints `evaluate` hands to `rows()`: that table's own root-level AND conditions (none for left-joined tables). Writes go back through `updateOne` / `deleteMany` by `_id`: a single-column key is read from the row, so a key changed earlier in the query is followed, and a WeakMap tracks the hidden `_id` for composite-key rows.

## Measurements

Setup: 1,000 authors and 50,000 posts, local single-node replica set, averaged over 5 runs.

| Query | `$lookup` pipeline | `evaluate` + per-table prefilter | `evaluate`, full scans |
|---|---|---|---|
| Posts with `views > 5` by author `name = "a7"` (filter on the joined side, 50 rows) | 918 ms | **80 ms** | 9,730 ms |
| Posts with `views = 7` plus author name (selective root, 500 rows) | **18 ms** | 99 ms | — |
| Single table, `views = 7` (500 rows) | 9 ms (1 ms with an index) | 9 ms | 64 ms |

How to read this:
- **`$lookup` drives from the root collection.** When the selective condition is on the joined side, it runs one lookup per root document (~20 µs each, ~47k of them), and moving the condition into the sub-pipeline doesn't save that. `evaluate` with prefilters wins here: it loads the one matching author and the posts with `views > 5`, then joins in JS.
- **When the root is selective, `$lookup` wins by about 5×.** That's the usual pattern: page a table, enrich it with `one()` relations.
- **`evaluate` without prefilters is unusable past toy sizes.** It's a nested-loop cross product over full collections. Prefiltering is required, not optional.
- A real planner would choose based on where the selective condition sits. It could rewrite a joined-side filter as a semi-join: query the joined table first, then `$match: { fk: { $in: ids } }`. That's the next step if this ships. The current compiler always prefers `$lookup`.

## Caveats and limits

- **No codecs.** Since fields declare portable types and connections own storage, fields hand the driver plain values. Mongo stores them as they come, like `Memory`: dates as BSON dates, booleans as BSON booleans, `json()` as embedded documents. Declaring `codecs` would only buy rejection of field types at bind time.
- **No schema validation in `sync`.** It creates collections and indexes and nothing else: no `$jsonSchema` validator and no `plan()` diff.
- **Nullable `unique` fields** get a partial index on non-null types, because Mongo otherwise treats every null as a duplicate. Non-nullable `unique` fields get a plain unique index.
- **Transactions need a replica set or mongos.** A standalone server rejects them with Mongo's own error, which a test checks. The driver doesn't use `withTransaction`'s automatic retry, because the callback runs ORM journal side effects. A `TransientTransactionError` reaches the caller. Nested `transaction()` calls join the outer one. Like `PGConnection`, the driver overrides `lock`, so transactions run side by side on their own sessions and other statements don't wait.
- **Change streams need a replica set.** On a standalone, the stream errors and is dropped silently, which a test checks. A `watch()` opened just before a write can miss it: the cursor opens lazily and nothing passes `startAtOperationTime`. Deletes in composite-key collections aren't reported, because `documentKey` holds only the hidden ObjectId. Fixing that needs pre-images (`changeStreamPreAndPostImages`).
- **Changing a primary key** on a single-key table is an insert plus a delete. It's atomic only inside `transaction()`.
- **`$lookup` null semantics:** a null `localField` matches documents whose `foreignField` is missing or null. That can't happen for `_id` (every `one()` relation) but can for joins on other columns.
- **`count` runs through `aggregate` + `$count`,** not `countDocuments`, to keep one read path. That's the same cost.

## Public surface (needs sign-off)

`MongoConnection` is the only new export. Its constructor is `(using, client: MongoClient | string, dbName?)`, and it exposes `client` and `db`. The package re-exports `@expressive/orm` the way `@expressive/sql` does. `mongodb` is a peer dependency. When given a URI string, the connection owns the client and closes it in `close()`.

## Is it worth shipping?

**Yes as an experimental package. Not yet as a peer of `@expressive/sql`.** The contract held up. CRUD, upserts, indexes, sessions and change streams all map almost one-to-one, the id choice keeps entities portable, and the `evaluate` fallback means every `Query` runs. Before calling it production-ready:

1. Cost-aware join planning: a semi-join rewrite for joined-side filters, instead of always using `$lookup`.
2. Push the common computed update `x = x + n` down as `$inc`.
3. Pre-images for composite-key change events, and `startAtOperationTime` for subscribe.
