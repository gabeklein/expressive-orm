---
name: expressive-mongo
description: MongoDB for Expressive ORM (@expressive/mongo, experimental) - MongoConnection over the official mongodb driver, numeric ids stored as _id, sync of collections and indexes, Query pushdown to aggregate pipelines with $lookup joins, session transactions and change-stream live rows on a replica set. Use when connecting entities to MongoDB or debugging how a Query, transaction or live row runs there.
---

# @expressive/mongo

A MongoDB connection for Expressive ORM. It re-exports `@expressive/orm`, so import everything from `@expressive/mongo`. Entities, `Query`, transactions and live rows work as described in `expressive-orm`. This page covers only what differs on Mongo. The package is experimental and not yet published.

```bash
npm install @expressive/mongo @expressive/mvc mongodb
```

Requires MongoDB 5.0 or later. Transactions and live rows also need a replica set or mongos.

## Connect

```ts
import { MongoConnection, Type, str } from '@expressive/mongo';

class User extends Type {
  name = str();
  email = str({ unique: true });
}

const db = await MongoConnection.new([User], "mongodb://localhost:27017", "app");
```

- `MongoConnection.new(types, client, dbName?)` takes a connection string or a `MongoClient`. Without `dbName`, it uses the database named in the URI.
- `close()` closes the change streams. It also closes the client, but only if the connection created that client from a string.
- `db.db` is the driver's `Db`, for anything the ORM doesn't cover.

## Storage

- Each table is a collection with the same name, or `schema.table` when the class sets `static schema`.
- A single-column key is stored as `_id`, and rows read back with `id`. An incrementing `key()` draws numbers from a `__counters` collection. An explicit id advances the counter past it. Counter updates run outside transactions, so a rollback leaves a gap in the ids.
- A composite `key(() => [...])` stores its parts as ordinary fields, and `_id` stays an ObjectId the ORM never shows.
- Values are stored as fields return them. Dates become BSON dates, booleans become BSON booleans, and `json()` values become embedded documents.

## Sync

Awaiting the connection creates missing collections, plus an index for each `unique` and `index` field and for each composite key. A nullable `unique` field gets a partial index, so several null values don't collide. `sync` doesn't validate documents or compare them against the schema.

## Query

`Query` compiles to a single `aggregate` pipeline or to `updateMany` / `deleteMany`. `String(query)` shows exactly what is sent to Mongo.

- Filters on the root table run before any join. `one()` relations and other single `=` joins become `$lookup` + `$unwind`. Filters on an inner-joined table run inside its `$lookup`.
- Ordered reads add `_id` as a final tiebreaker.
- Anything else falls back to `evaluate`, and `String(query)` starts with `evaluate`. That covers computed values, joins with several conditions or a non-`=` condition, `where([...rows])` input, `Query` inserts, and writes that join, order or page. The fallback loads each table with that table's own conditions applied in Mongo, then joins in memory.
- `$lookup` runs one lookup per root document. A filter that only the joined table narrows can therefore be slow on a large root collection.
- `isLike` is case-sensitive.

## Transactions

`db.transaction(fn)` works as in `expressive-orm/SKILL.md#transactions`. Each transaction runs in its own `ClientSession`. Transactions run side by side, and statements outside a transaction don't wait for them. A transient write conflict isn't retried and reaches the caller. On a standalone server, `transaction` rejects with Mongo's own error.

## Live rows

On a replica set, loaded entities follow changes made by any client through a change stream on the database, as in `expressive-orm/SKILL.md#live-rows`. On a standalone server, the stream closes quietly and entities don't update.

Limits:
- A write made right as the first class loads can be missed while the stream opens.
- Deletes in composite-key collections aren't reported.
