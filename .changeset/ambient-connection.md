---
"@expressive/orm": minor
---

**A class without a connection joins the last one created.** On first use, a class no connection binds joins the connection created last while it is open, as if listed in its `new` - field codecs included, and covered by `sync` if the connection is not yet awaited. A test needs only `Memory.new()`. Closing it unbinds them; with none open, statements still reject with `No database connection`. Previously such a class rejected even with a connection open.
