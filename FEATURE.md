# Lazy queries - a query as a value, and a list field over it

Status: proposal. Nothing here is built; the public surface below needs sign-off before it is.

## Why

An app showing related rows - a claim's notes, an attorney's payments - wants a list it can render, and that it can add rows to and remove rows from without reloading. orm gives it `rows()`, which runs a query, but nothing that holds the result.

LFCP's `app/src/lib/orm.ts` is the worked example. It defines `Results`, an observed `Array` subclass, and a `list(source, where?, limit?)` loader. Its 17 call sites now read `files = list(() => this.claim.files)`. Dogfooding a live `rows()` field there (#98, closed) showed what a relation alone can't carry:

- **Filters and orders.** Five of the 17 lists filter or order (`claimants` by `id: asc()`, `payments` by `date: desc()`, claimant files by `uploaderType`) or cover a whole table (`list(User)`). A `rows()` field has nowhere to put them.
- **Array shape.** Consumers read `.length`, `[0]` and `.reduce`, and pass the list as `<Table data>`. A `has.List` has `size` and `get(i)` instead.
- **Inserts that match the list.** `rows().insert` fills the foreign key. Filling any other field the list filters on, such as `uploaderType`, is the caller's job. Three inserts in LFCP carry a `@ts-expect-error`, because `Results.insert` types the foreign key as required even though the relation fills it.
- **Lazy inputs.** `ClaimantClaim extends ClaimPage` overrides `uploaderType`. A filter evaluated in the field initializer reads the parent's value. Anything a list reads from the instance has to be read when it loads, not when the field is declared.

The common thread: the list is a view over a **query**, and a relation is one way to scope a query. orm already does this for one case. `static subset` is an equality filter merged into every read on a class, and filled into every insert. `rows()` does the same thing per entity, with `{ [fk]: id }`. What's missing is the query as a value: something that can be held, narrowed and inserted into before it is run.

## One kind of value, two ways to describe it

orm has two read paths today:

| | `Query(where => ...)` | `Class.query({ ... })` |
|---|---|---|
| described by | a function - joins, computed columns, writes, templates | data - one table, a filter object |
| runs | lazily, again on each `then` | eagerly, when called |
| on | connections with `prepare` (Memory, SQLite, Postgres) | any connection - `select` is the driver minimum, so `Remote` too |
| composes by | calling `where(fn)` inside another query | nothing yet |

The builder already has the shape this feature needs: `Query` is "a Promise that runs each time it is awaited", with `get()` and `one()`. The object form is the odd one out only because it runs eagerly.

The unity: **a query is a lazy value; it is described either as code or as data.** Code is opaque - it can join and compute, but nothing can look inside it. Data can be looked inside, so the object form is the one that can:

- **be extended** - merging objects gives a narrower query;
- **be inserted into** - its equality keys are values a new row must have;
- **cross the wire** - `Remote` sends the object; it can't send a function;
- **merge with `subset`**, and with policies later (`feat/remote-policy`).

So the object form doesn't become the builder. It stays the data half, made lazy and extendable, sharing the builder's value protocol.

## Shape

### `Class.query(where)` returns a lazy, extendable query

```ts
const files = FileUploaded.query({ claim, uploaderType: "claimant" });

await files;                                 // frozen columns, as today - selected now
await files;                                 // selected again
for await (const batch of files.query({}, 50)) …
const pdfs = files.query({ name: isLike("%.pdf") });   // narrower, nothing run
await files.load();                          // entities
await files.one();
await files.count();
const file = await files.insert({ name: "a.pdf", url }); // claim and uploaderType filled
```

- **Lazy.** Nothing is selected until `then` or iteration. Each await selects again, as a builder `Query` does.
- **The class is the unscoped query.** A query's methods are the class's statics, scoped: `query`, `load`, `one` and `count` take the same arguments as `Class.query`, `Class.load`, `Class.one` and `Class.count`. `insert` is `Class.new`. No new verbs.
- **Narrowing.** `query(more, limit?, offset?)` merges `more` in, and the outer query wins on a key both set, as `rows()` does with its foreign key today. A limit or offset carries into what it returns.
- **Iteration** is what `Type.Results` does today: batches of `limit`, or one batch with no limit. `Type.Results` folds into this value.
- **Equalities** are the keys whose value is plain: a value, an entity or an id for a relation, or `equal(x)`. Operators, arrays, `null` and orders are not equalities. `insert(values)` is `Class.new({ ...values, ...equalities })`: the entity at once, awaitable, the same as `rows().insert` after #95. Its type makes the equality keys optional.
- **Order.** A query with no order key takes the class's newest-first default, even when it has filters. Today `newest()` drops the default as soon as any filter is present. That should change everywhere, as part of this.
- **Protocol.** It is built on the same base as the builder: `then`, `catch` and `finally`, `toString()` outlining the filter, `[Symbol.toStringTag]` `"Query"`. It is a thenable, not a `Promise` - `instanceof Promise` stops holding for `Class.query(...)`.

### `rows()` returns one

`user.posts` is `Post.query({ author: user })`, built once per entity as the handle is today. `query`, `load`, `one` and `insert` keep their signatures. The field becomes awaitable: `await user.posts` resolves columns, as any query does.

### `list(() => query)` - a list field

```ts
class ClaimPage extends Component {
  claim = set(() => Claim.one({ sequenceId: this.claimNumber }));
  notes = list(() => this.claim.notes);
  files = list(() => this.claim.files.query({ uploaderType: this.uploaderType }));
  users = list(() => User);
  cases = list(() => this.attorney && this.attorney.cases);
}
```

- An mvc `def` instruction, usable on any Model, not only a `Type`. The factory runs once, when the field is first needed. It may suspend, as `set(() => ...)` does. A falsy result leaves the field `undefined`.
- The source is a query or a class. Filtering and ordering live in the query. Because the factory reads the instance, the `uploaderType` case is lazy with no second argument.
- The value is array-shaped: `length`, indexing, `map`, `reduce`, `Array.isArray`. Methods that return a new array (`map`, `filter`, `slice`) return a plain `Array`. The value is the same object for the life of the field.
- A change to a member re-renders whatever reads its slot. A deleted or destroyed member leaves the list.
- `insert(values | entity)`: values go through the query's `insert`, so equalities are filled. An entity is added as it is (the `FileUploaded.from` and `ClaimEvent.new` cases). New members go first.

This is LFCP's `Results` plus its new `list` instruction, minus anything LFCP-specific.

### Later: a data query inside a builder query

`where(...)` in the builder could take an object-form query as a table: `const post = where(user.posts)` adds `Post` with its filter. That lets code reuse data, but not the other way round. It isn't needed for lists, so it stays out of this stack.

## Not in scope

- Live queries. A list changes only through its own `insert` and its members' deletes. A row written elsewhere shows on the next `load`. No NOTIFY, polling or server push.
- Matching on anything but equalities. A query with `date: greaterThan(x)` loads fine; its `insert` just fills nothing for `date`.
- Lists from builder queries. A builder query may join or compute, so its rows aren't one class's entities.

## Open questions

1. **What awaiting gives.** Awaiting `Class.query(...)` resolves columns today. Keeping that keeps `query` meaning one thing. But `await user.posts` and `set(async () => this.claim.notes)` would then give columns, where entities are what an app wants. The alternative is that awaiting a relation's query gives entities - but that's a second meaning for the same value.
2. **Naming the type.** `Type.Query<T>` already names the filter object. The value needs its own name: `Type.Scope<T>`, `Query.Of<T>`, or rename the filter type to `Type.Where<T>` (breaking).
3. **Insert position in an ordered list.** First, as LFCP does, or at its sorted place when the query orders on plain columns? Sorted is cheap for one key, but it's a promise the list then has to keep.
4. **An inserted entity outside the query.** `list.insert(entity)` with an entity that doesn't match the equalities: accept it (LFCP today), or throw? Separately, values that contradict an equality: should the query win silently (as `subset` and `rows()` do), or throw as `Remote` does for a subset field ("fixed by its subset")?
5. **Cross-list membership.** Should an insert through any query join every open `list` whose equalities it matches, client-side, sorted? It would make two lists over the same relation agree (LFCP's `cases` and `historyCases`). It needs a registry of open lists. Deferred unless a consumer needs it.
6. **Where `list` lives.** orm, because it knows queries and entity deletes? Or mvc, as an observed array with orm adding only the source? The array mechanics, `observer`, `event` and `touch`, are mvc's public `observable` exports either way.

## Public surface - needs sign-off

| surface | kind |
|---|---|
| `Class.query(object)` returns a lazy value with `query`, `load`, `one`, `count` and `insert` | breaking: lazy, not a `Promise`; `Type.Results` folds in |
| the value's type (open question 2) | new type; `Rows` becomes it |
| default newest-first order kept under a filter | breaking: order of filtered reads without `asc()`/`desc()` |
| `list(factory)` | new export |
| `Type.List<T>` (the list value, with `insert`) | new type |

## Build plan

Stacked PRs into the `feat/scope` trunk, each small enough to hand-review:

1. **Lazy object queries.** `Class.query(object)` returns a lazy value on the builder's protocol; `Type.Results` folds in. No new methods yet. Breaking minor.
2. **Extend and insert.** Add the value's `query`, `load`, `one`, `count` and `insert` filling equalities, plus the order rule. `rows()` returns one. Tests on Memory, README, skill and changeset.
3. **List.** Add the `list` instruction and `Type.List`: array shape, slot re-render, delete eviction, and `insert` of values or an entity. Tests cover an effect reading the list, an async factory, a falsy source, a subclass overriding a field the factory reads, and a failed insert.
4. **LFCP.** Delete `Results` and `list` from `app/src/lib/orm.ts` and import `list` from orm. Call sites change only where a filter moves into `.query(...)`.

## LFCP, after

`orm.ts` keeps the `Remote` connection and `observed` (used by `lib/query.ts`). `HistoryCases.tsx` imports `Type.List` in place of `Results`. The five filtered or ordered lists move their filter into the query:

```ts
claimants = list(() => this.claim.claimants.query({ id: asc() }));
payments = list(() => this.attorney.payments.query({ date: desc() }));
files = list(() => this.claim.files.query({ uploaderType: this.uploaderType }));
```
