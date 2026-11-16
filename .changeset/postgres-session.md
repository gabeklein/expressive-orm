---
"@expressive/postgres": minor
---

`db.session(fn, client)` runs every statement inside on `client` - a `pg` `Client` or `Pool` for `PGConnection`, a `PGlite` for `PGLiteConnection` - transactions included, so a Worker can open a client per request from Hyperdrive and close it after.

`sync`, or awaiting the connection, inside a session on a client other than the connection's own rejects - sync from a deploy step.
