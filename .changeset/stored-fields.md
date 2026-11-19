---
"@expressive/orm": minor
---

Entity types count a property as a column only when its value is a primitive, a `Date`, a related entity, or a `Field.Object<T>` - new, the type `json<T>()` now returns. A child model, a form or another non-column member no longer appears in `Insert`, `Columns` or `Compat`, so `Type.new` and `insert` stop requiring it and query rows stop claiming it. A custom field helper storing an object types its value as `Field.Object<T>`.
