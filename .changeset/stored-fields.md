---
"@expressive/orm": minor
---

Entity types count a property as a column only when its value is a primitive, a `Date`, a related entity, `unknown`, or a `Field.Object<T>` - new, the type `json<T>()` now returns (bare `json()` stays `unknown`, and a nullable `T` keeps its `null`). A child model, a form or another non-column member no longer appears in `Insert`, `Columns`, `Compat` or a `Query` table, so `Type.new` and `insert` stop requiring it and query rows stop claiming it.

Breaking for custom field helpers: one typed as an array, a plain object, or a union with one is no longer counted as a column unless it types its value as `Field.Object<T>`.
