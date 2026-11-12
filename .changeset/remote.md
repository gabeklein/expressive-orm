---
"@expressive/orm": minor
---

`Remote` - a connection forwarding every read and write through a function you give it, to `Remote.handle(connection)` on a server. Requests name classes by the key they are bound under and fields by property, never table or column, so the server alone decides storage. Statics, relations and instance writes travel; `Query`, transactions and live rows don't.
