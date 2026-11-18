---
"@expressive/orm": minor
---

A subclass that declares no fields of its own is a view on its parent's table: it reads and writes the parent's rows, `get(id)` builds it without a select from a row already loaded through the parent or another of its views (not for a `subset` class), and every write or delete - instance or static, by id or filter, upserts and `load` included - settles or destroys each loaded instance of the row, whichever class loaded it.

Breaking: such a subclass no longer defaults to a table named after itself. Give it `static table` to keep one. A parent holding only statics, such as a shared `connection`, still isn't a table, and a class listed in `Connection.new` is never a view.
