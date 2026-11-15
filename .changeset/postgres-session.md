---
"@expressive/postgres": minor
---

`db.session(fn, client)` runs every statement inside on `client` - a `pg` `Client` or `Pool` for `PGConnection`, a `PGlite` for `PGLiteConnection` - transactions included, so a Worker can open a client per request from Hyperdrive and close it after.
