---
"@expressive/orm": minor
---

orm's field helpers become the column vocabulary.

- `str`, `num`, `bool` and `date` build datatype-aware fields that validate on write: `str` checks type and `length`, `num` rejects non-numbers and `NaN`, `bool` rejects non-booleans and stores through `either` (default `1`/`0`), `date` rejects values that are not a date. `datatype` composes `type` with `length`, `precision`/`scale` and `collate`.
- Each helper and `one` carries a `Types` interface for adapters to augment - `declare module '@expressive/orm' { namespace str { interface Types { varchar: VarChar } } }` - which narrows `type` and types the options per datatype, with `default` used when no `type` is given. `str.Type`, `num.Type`, `bool.Type`, `date.Type` and `one.Type` hold the field class each helper constructs; an adapter replaces it with a subclass. Options apply after construction, so a subclass's defaults yield to them.
- `optional`, `fallback`, `increment` and `primary` make a key optional in `Type.Insert` and a query insert; the property stays value-typed.
- `id` is `num({ primary: true, increment: true })`, typed `string | number`. A subclass redeclares it with any helper carrying `primary`, which narrows the type: `id = num({ column: "user_id", primary: true })` is a `number`, `id = uuid({ primary: true })` a `string`. `one(id)`, `update(id)`, the identity map and relation inputs follow the entity's `id` type. `Type.insert` always inserts, so a supplied key is written.
- `one()` records `onDelete` and `onUpdate`.
