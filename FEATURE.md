# Scopes and lists - a query as a value, and a list field over it

Status: proposal. Nothing here is built; the public surface below needs sign-off before it is.

## Why

An app showing related rows - a claim's notes, an attorney's payments - wants a list it can render, and that it can add rows to and remove rows from without reloading. orm gives it `rows()`, which runs a query, but nothing that holds the result.

LFCP's `app/src/lib/orm.ts` is the worked example. It defines `Results`, an observed `Array` subclass, and a `list(source, where?, limit?)` loader. Its 17 call sites now read `files = list(() => this.claim.files)`. Dogfooding a live `rows()` field there (#98, closed) showed what a relation alone can't carry:

- **Filters and orders.** Five of the 17 lists filter or order (`claimants` by `id: asc()`, `payments` by `date: desc()`, claimant files by `uploaderType`) or cover a whole table (`list(User)`). A `rows()` field has nowhere to put them.
- **Array shape.** Consumers read `.length`, `[0]` and `.reduce`, and pass the list as `<Table data>`. A `has.List` has `size` and `get(i)` instead.
- **Inserts that match the list.** `rows().insert` fills the foreign key. Filling any other field the list filters on, such as `uploaderType`, is the caller's job. Three inserts in LFCP carry a `@ts-expect-error`, because `Results.insert` types the foreign key as required even though the relation fills it.
- **Lazy inputs.** `ClaimantClaim extends ClaimPage` overrides `uploaderType`. A filter evaluated in the field initializer reads the parent's value. Anything a list reads from the instance has to be read when it loads, not when the field is declared.

The common thread: the list is a view over a **query**, and a relation is one way to scope a query. orm already does this for one case. `static subset` is an equality filter merged into every read on a class, and filled into every insert. `rows()` does the same thing per entity, with `{ [fk]: id }`. A scope is that idea as a value.

## Shape

### `Class.where(query)` - a scope

```ts
const files = FileUploaded.where({ claim, uploaderType: "claimant" });

await files.load();                     // the matching entities, read once
await files.query({ name: isLike("%.pdf") }, 20);
await files.one();
const file = await files.insert({ name: "a.pdf", url }); // claim and uploaderType filled
const pdfs = files.where({ name: isLike("%.pdf") });     // narrower, still a scope
```

- A scope runs nothing until a method is called. It is cheap to make, and makes no request when built.
- `query`, `load` and `one` take the extra `where`, `limit` and `offset` that `Class.query`, `Class.load` and `Class.one` already take. The scope's query is merged in, and the scope wins on a key both set, as `rows()` does with its foreign key today.
- `where(more)` returns a narrower scope. Its keys merge the same way.
- **Equalities** are the keys whose value is plain: a value, an entity or an id for a relation, or `equal(x)`. Operators, arrays, `null` and orders are not equalities.
- `insert(values)` is `Class.new({ ...values, ...equalities })`: the entity at once, awaitable, the same as `rows().insert` after #95. Its type makes the equality keys optional.
- **Order:** a scope with no order key takes the class's newest-first default, even when it has filters. Today `newest()` drops the default as soon as any filter is present. A scope should not lose its order because it filters, so it gets its own rule here instead of a change to `Class.load`.

### `rows()` returns a scope

`user.posts` becomes `Post.where({ author: user })`, built once per entity as the handle is today. `query`, `load`, `one` and `insert` keep their signatures. `where` is new. The `Rows` type becomes, or aliases, `Type.Scope`.

### `list(() => source)` - a list field

```ts
class ClaimPage extends Component {
  claim = set(() => Claim.one({ sequenceId: this.claimNumber }));
  notes = list(() => this.claim.notes);
  files = list(() => this.claim.files.where({ uploaderType: this.uploaderType }));
  users = list(() => User);
  cases = list(() => this.attorney && this.attorney.cases);
}
```

- An mvc `def` instruction, usable on any Model, not only a `Type`. The factory runs once, when the field is first needed. It may suspend, as `set(() => ...)` does. A falsy result leaves the field `undefined`.
- The source is a scope or a class. Filtering and ordering live in the scope. Because the factory reads the instance, the `uploaderType` case is lazy with no second argument.
- The value is array-shaped: `length`, indexing, `map`, `reduce`, `Array.isArray`. Methods that return a new array (`map`, `filter`, `slice`) return a plain `Array`. The value is the same object for the life of the field.
- A change to a member re-renders whatever reads its slot. A deleted or destroyed member leaves the list.
- `insert(values | entity)`: values go through `source.insert`, so equalities are filled. An entity is added as it is (the `FileUploaded.from` and `ClaimEvent.new` cases). New members go first.

This is LFCP's `Results` plus its new `list` instruction, minus anything LFCP-specific.

## Not in scope

- Live queries. A list changes only through its own `insert` and its members' deletes. A row written elsewhere shows on the next `load`. No NOTIFY, polling or server push.
- Matching on anything but equalities. A scope with `date: greaterThan(x)` loads fine; its `insert` just fills nothing for `date`.
- Paging inside `list`. A limit can be a scope option later if a consumer needs one.

## Open questions

1. **Name.** `Class.where` reads well at the call site, but `where` is also the parameter name everywhere. Alternatives: `Class.scope`, `Class.of`.
2. **Insert position in an ordered list.** First, as LFCP does, or at its sorted place when the scope orders on plain columns? Sorted is cheap for one key, but it's a promise the list then has to keep.
3. **An inserted entity outside the scope.** `list.insert(entity)` with an entity that doesn't match the equalities: accept it (LFCP today), or throw? Separately, values that contradict an equality: should the scope win silently (as `subset` and `rows()` do), or throw as `Remote` does for a subset field ("fixed by its subset")?
4. **Cross-list membership.** Should an insert through any scope join every open `list` whose equalities it matches, client-side, sorted? It would make two lists over the same relation agree (LFCP's `cases` and `historyCases`). It needs a registry of open lists. Deferred unless a consumer needs it.
5. **Where `list` lives.** orm, because it knows scopes and entity deletes? Or mvc, as an observed array with orm adding only the source? The array mechanics, `observer`, `event` and `touch`, are mvc's public `observable` exports either way.

## Public surface - needs sign-off

| surface | kind |
|---|---|
| `Type.where(query)` | new static |
| `Type.Scope<T>` - `query`, `load`, `one`, `insert`, `where` | new type; `Rows` becomes it |
| `rows()` handle gains `where` | new method |
| `list(factory)` | new export |
| `Type.List<T>` (the list value, with `insert`) | new type |

## Build plan

Stacked PRs into a `feat/scope` trunk, each small enough to hand-review:

1. **Scope.** Add `Type.where` and `Type.Scope`, with `query`, `load`, `one`, `insert` filling equalities, `where`, and the order rule. `rows()` returns a scope. Tests on Memory, README, skill and changeset.
2. **List.** Add the `list` instruction and `Type.List`: array shape, slot re-render, delete eviction, and `insert` of values or an entity. Tests cover an effect reading the list, an async factory, a falsy source, a subclass overriding a field the factory reads, and a failed insert.
3. **LFCP.** Delete `Results` and `list` from `app/src/lib/orm.ts` and import `list` from orm. Call sites change only where a filter moves into `.where(...)`.

## LFCP, after

`orm.ts` keeps the `Remote` connection and `observed` (used by `lib/query.ts`). `HistoryCases.tsx` imports `Type.List` in place of `Results`. The five filtered or ordered lists move their filter into the scope:

```ts
claimants = list(() => this.claim.claimants.where({ id: asc() }));
payments = list(() => this.attorney.payments.where({ date: desc() }));
files = list(() => this.claim.files.where({ uploaderType: this.uploaderType }));
```
