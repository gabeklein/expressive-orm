---
"@expressive/postgres": minor
---

`@expressive/postgres` depends on `@expressive/sql` and re-exports it: import `Type`, `Query`, the field helpers and `PGConnection` or `PGLiteConnection` from `@expressive/postgres`. `@expressive/orm` is a dependency, no longer a peer; `@expressive/mvc` stays a peer.

- Datatypes come from sql's shared vocabulary, so a column config moves between SQLite and Postgres unchanged. postgres adds `num` `serial`, `date` `interval` with `fields`, and `timezone` on `timestamp` and `time`; `num` gains `float` and `decimal`, `bool` gains `integer` and `text`, `date` gains `integer` and `text`.
- `TimeColumn` exports postgres's subclass; importing only a connection narrows `type` options.
