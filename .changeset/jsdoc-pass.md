---
"@expressive/orm": patch
"@expressive/sql": patch
---

Document the public API in JSDoc, so hovers and completions carry each symbol's contract, and correct the agent skills against the source: `json()` takes one option, relation writes insert an object without `id`, `where(Other)` needs a join condition on SQL, `num()` is a 32-bit integer on SQL, default ordering of `find()` and `one()`, and an error table.
