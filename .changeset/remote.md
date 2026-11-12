---
"@expressive/orm": minor
"@expressive/sql": minor
"@expressive/postgres": minor
---

`Remote` - a connection forwarding every read and write through a function you give it, to `Remote.handle(connection, options)` on a server. Requests name classes by the key they are bound under and fields by property, never table or column, so the server alone decides storage. The server validates each request and runs it as the class's own statics would, and masks failures past validation as `Request failed.`; `expose` names the classes and properties served and `check` authorizes each request with a context you pass. Reads, inserts, writes by id, relations and instance writes travel; `count`, writes by filter, `Query`, transactions and live rows don't.

SQL generation now refuses an unknown operator, sort order, or a limit or offset that isn't a whole number. A failed SQLite statement over 4KB is reported unformatted. Ordering by, or matching null on, a required relation no longer throws.
