---
'@expressive/orm': minor
'@expressive/sql': minor
'@expressive/postgres': minor
---

Fields declare portable datatypes and connections own storage. A field checks plain values the same on every side - integer ranges, decimal precision and scale, string length - and a connection takes and returns them, Dates and JSON values included, storing them through codecs chosen by the field's base helper (`Connection.Codec`, a protected `codecs` getter). One schema module importing only `@expressive/orm` binds to SQLite, D1, Postgres, `memory()` or a connection forwarding to a server, and the SQL floor checks forwarded values again before storing them. `Connection.new` throws for a field the connection can't store.

Breaking: orm declares the portable types - `str` text, varchar, char, uuid; `num` integer (now the default everywhere), smallint, bigint, real, double, decimal, numeric; `date` timestamp, date, time, with `timezone`; `bool` boolean. Storage-only types are dropped - `date` ms, seconds, integer and text, `num` float, `bool` with `either`, `one` integer and bigint (a relation takes its key's type), Postgres `serial` and `interval` - with their `sql.*` tokens. The column classes and `X.Type` hooks are gone (`StringColumn`, `NumericColumn`, `BooleanColumn`, `TimeColumn`, `ForeignColumn`); `@expressive/sql` exports `codecs` instead. `Field.datatype` is gone. `memory()` stores values as given.

Every helper gains `.and(...presets)`, returning the same helper with those options first; `date.created` and `date.updated` are presets of `date`.

A `date({ type: "date" })` column is the local calendar day on every side - stored `YYYY-MM-DD` from the local day, read as local midnight; a `"YYYY-MM-DD"` string is that day.
