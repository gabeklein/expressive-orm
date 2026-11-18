---
"@expressive/orm": minor
---

A `rows()` field is now a live `has.List` of every related entity, newest first, alongside `query`, `load`, `one` and `insert`. It loads once, on first await or first read (a read before then suspends); awaiting it resolves the list itself. An entity added through its `insert` joins first and a deleted or destroyed one leaves; effects reading it re-run. `load(where?)` still resolves a one-time array.
