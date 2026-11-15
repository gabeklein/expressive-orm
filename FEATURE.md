# Durable hooks - after-effects the database records

Status: proposal. Nothing here is built; the public surface below needs sign-off before it is.

## Why

`connection.after(Type, { delete })` runs host-side effects - deleting a stored file, say - after a row is deleted. Today it runs in the process that deleted the row, and only when orm did the delete by id (`Connection._hook` wraps `remove`). It misses:

- a delete by filter (documented);
- raw SQL against the table;
- `ON DELETE CASCADE` from a parent row;
- a process that dies between commit and the hook - the effect is lost.

In LFCP, the `FileUploaded` delete hook removes the blob from storage, so any of these leaves an orphaned blob.

`before` hooks gate a delete and must stay in process. This is about `after`, which is cleanup: it should hold for every write path, not just orm's own.

## The contract

A durable `after` hook runs **after commit, at least once, eventually**, for every delete of the class's rows - whatever issued it. Handlers must be idempotent. The row they receive is the deleted row, decoded as `query` resolves it, as now.

## Shape

The database records each change in an outbox, in the same transaction as the change. Hooks run when the outbox is drained.

- **Outbox.** A table (`expressive_outbox`: id, table, op, row, attempts, claimed, created) and a trigger per hooked table that writes `OLD` into it on delete. The generator emits both, as Postgres already emits its `expressive_notify` triggers.
- **Drain.** `connection.drain()` claims a batch, runs the matching `after` handlers, deletes each entry whose handlers settled and counts an attempt on the others. Postgres claims with `FOR UPDATE SKIP LOCKED`, so several workers can drain at once.
- **Who drains.** Whoever the host says - nobody owns the outbox:
  - a long-running server on an interval, and right after its own deletes, which keeps today's latency;
  - Workers from a Cron Trigger or a Queue consumer;
  - a webhook: Postgres `pg_net`, or `NOTIFY`, as a doorbell that says "drain now". The outbox is the record; the doorbell can be lost.
- **No double runs.** With a durable hook, the in-process path no longer calls the handler directly; it drains what its own delete wrote.

### Per engine

| engine | records | doorbell |
|---|---|---|
| Postgres, PGlite | trigger into the outbox | `NOTIFY` (already emitted for `subscribe`), or `pg_net` to a URL |
| SQLite, D1 | trigger into the outbox, the row as `json_object(...)` from the known columns | none - drain on a schedule, or after a local write |
| Memory, Remote | in process, as today - nothing to record | - |

Note that Postgres's `NOTIFY` payload leaves the row off deletes (`expressive_notify`), so `subscribe` alone can't drive delete hooks: the outbox keeps `OLD`.

## Opting in

Two choices to decide:

1. Per registration: `db.after(Upload, { delete }, { durable: true })`. A connection with any durable hook keeps an outbox.
2. Per connection: an option at construction; every `after` on it is durable.

(1) keeps today's default and lets a host move one hook at a time. Either way the outbox and its triggers are schema, so a host that doesn't run `sync` - LFCP never awaits its connection - applies them as a migration. The `sql` CLI should emit them.

## LFCP, after

The `FileUploaded`, `ClaimEvent` and `CollectionPayment` delete hooks become durable. The server drains after its own deletes and on an interval. A cascade or a manual cleanup in SQL no longer leaves blobs behind. Moving to D1 swaps the interval for a Cron Trigger.

## Public surface - needs sign-off

- `durable` on `after` (option 1), or a connection option (option 2).
- `Connection.drain()`, and the outbox table's name as a fixed or configurable part of the schema.
- Driver contract: record, claim and settle outbox entries; generator support for the outbox triggers.

## Steps

1. Outbox and triggers in the Postgres generator; `drain` on `PostgresConnection`; tests on PGlite.
2. The same for SQLite, on `node:sqlite`.
3. `durable` on `after`; the in-process path drains instead of calling.
4. CLI output for hosts that migrate instead of syncing; skill and README.

## Later

- Insert and update hooks through the same outbox.
- A doorbell helper per runtime: `pg_net` setup, a Queue producer.
- Dead letters: entries past a number of attempts, surfaced for a person to look at.

## Open questions

- Order: per row, per table, or none promised?
- Retention of settled entries, for audit, or delete on settle?
- Does `subscribe` move onto the outbox too, so live rows survive a dropped `LISTEN`?
