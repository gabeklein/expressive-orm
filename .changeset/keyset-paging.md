---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

`query(where, limit)` pages by keyset: each batch continues after the last row's order values, so rows inserted or deleted ahead of the reader no longer shift the batches. `Type.Results` gains `more()`, the batch after, and `query(where, limit, row)` resumes after a row it returned - one sent through JSON works. A number there still skips that many rows.
