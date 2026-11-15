# Remote policies - row access per caller, declared

Status: proposal. Nothing here is built; the public surface below needs sign-off before it is.

## Why

`Remote` lets a browser use the ORM directly. `Remote.handle`'s `expose` decides which classes and properties are served, and `check(request, context)` decides the rest by hand. Row-level access - "an attorney reads only their own payments" - ends up written imperatively in every host.

LFCP's `api/src/lib/access.ts` is the worked example, and shows what `check` makes hosts write:

- a table of owner properties per class, with the ids each caller may hold in them;
- a heuristic (`scoped`) guessing whether a select's `where` is already narrow enough, else pushing an `IN` onto it;
- for writes by id, a separate `select` of the stored row, compared in JS, then the write - two statements, with a gap between them;
- a staff role and a read-only role as early returns.

orm already has the mechanism for half of this: `static subset` scopes a class to part of a table, merged into every read and insert, and checked on update and remove by id (`remote.ts`, the `subset` branch of `update`/`remove`). A policy is that same scoping, computed per caller.

## Scope

Policies are a companion to `Remote.handle`, and only to it. Code on the server's own connection - reports, rpc calls, scripts - runs unrestricted, as a database's admin or service role does. Restricting server code to a caller (`connection.as(context)`, defense in depth for multi-tenant hosts) is out of scope; see Later.

## Shape

A new `policy` option on `Remote.Options`, keyed by class key like `expose`:

```ts
const serve = Remote.handle(db, {
  policy: {
    Claim: (access: Access) => access.staff || { read: { id: isIn(access.claims) } },
    ClaimEvent: (access) => access.staff || { read: { claim: isIn(access.claims) } },
    FileUploaded: (access) => access.staff || {
      read: [{ claim: isIn(access.claims) }, { attorney: isIn(access.attorneys) }],
      insert: { claim: isIn(access.claims) },
      remove: { claim: isIn(access.claims) }
    }
  }
});

serve(request, await resolve(caller));
```

- A rule is `true` (everything), `false` or absent (nothing), or a filter in the object form `query` already takes - the same `where.ts` helpers (`isIn`, `isNull`, ...). An array is any-of.
- A rule set is `{ read, insert, update, remove }`; `write` sets all three writes at once. A function of the handler's `context` returns one, or `true` / `false` for the whole class.
- With `policy` given, a served class without an entry is refused - deny by default. `true` opts a class out.
- `check` stays, for what a filter can't say. It runs first, as now.

### Semantics, by op

| op | enforced as |
|---|---|
| select | `read` appended to the query's `where`, as `subset` is - no guessing whether the client narrowed it |
| insert | the new row must match `insert`, tested on the prepared values; an upsert's existing row must match `update` |
| update | the stored row must match `update` before, and the merged row after - a row can't be moved out of the caller's reach |
| remove | the stored row must match `remove` |

A row the policy hides behaves as a missing one: reads omit it, writes by id are no-ops, as with `subset` today. Refusing an insert that doesn't match is `invalid`.

### Atomic writes by id

`subset` and LFCP's `check` both select the row, then write it. For policies, the write should carry the condition: `UPDATE ... WHERE id = $1 AND <rule>`, `DELETE ... WHERE id = $1 AND <rule>`. Two ways to get there:

1. Extend the driver contract: `update(table, id, data, where?)` and `remove(table, id, where?)`. SQL drivers render it; `Memory` filters. Hooks select the row with the same condition.
2. Keep the contract; run the select and write in one `transaction` where the driver has one.

(1) is the real fix and moves `subset` onto it too. (2) needs no contract change, but leaves `Remote` and drivers without `transact` on two statements.

## Why not Postgres row-level security as the base

- SQLite and D1 have none, so orm needs this anyway, and every driver gets it for free.
- The caller would travel as session variables (`SET LOCAL` per transaction). Access computed in JS - LFCP's `resolve()` - would have to become SQL.
- It only adds safety when something other than `Remote` connects with a restricted role. With `Remote` the only door, enforcing in the query orm builds is as strong.

A driver may still emit native policies from the same rules later; see Later.

## LFCP, after

`OWNERS` becomes `policy` almost line for line. `scoped`, `owns`, `writable` and the stored-row lookups go. `resolve()` stays in the host, called before `serve`. The anonymous intake becomes a rule rather than an early return. Removal of a pending upload can be tied to its uploader: an `uploader` column the intake fills with a key only the uploader holds, and `remove: { uploader: context.upload }`.

## Public surface - needs sign-off

- `Remote.Options.policy`.
- `Remote.Policy<C>` and `Remote.Rule` types, if the option's type wants a name.
- Driver contract: an optional `where` on `update` and `remove` (option 1).

## Steps

1. Driver contract: conditional `update`/`remove` by id - `Memory`, `sql`, `postgres`; move `subset` onto it.
2. `policy` on `Remote.handle`: read and remove.
3. Insert and update, including upserts and the before/after check.
4. Skill and README: the Remote section, with a worked owner example.

## Later

- `connection.as(context)`: server code under the same rules, opted into per call.
- Native Postgres policies from the same rules, where the context fits session variables.
- Column policies per caller - `expose` is per handler today.

## Open questions

- Rule shape: object filters only, or also `Type.Constraint[]` for what the object form can't say?
- Should `policy` replace `subset`'s Remote checks, or run beside them?
- Is deny-by-default right when `expose` already names the classes?
