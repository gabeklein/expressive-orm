---
"@expressive/orm": minor
---

Relations on mvc.

- `get(Child)` is replaced by `rows(Child, field?)`, a handle with `find(where, limit, offset)`, `one(where, expect)` and `insert(data)` that apply the foreign key to the parent. It no longer mints a subclass of `Child`.
- A lazy `one(Other, lazy)` reads like an unset mvc property: the first read starts the load and throws mvc's suspense, which resolves and notifies observers when the entity lands. Assigning an id loads it the same way unless the entity is already loaded.
- A related entity is a reference: it is not adopted, destroyed with its parent or joined into its parent's context, and parents sharing a row read the same instance.
- Instance `update(data)` assigns the values as decoded from the written row, so a relation updated by object reads back as the entity.
