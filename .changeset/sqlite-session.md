---
"@expressive/sql": minor
---

`db.session(fn, source)` runs every statement inside on `source` - a D1 binding, a libSQL client or an `Engine` - with its own identity map, so a Worker can run each request on that request's binding without swapping the connection's engine.

Inside a session, `sync` brings the session's source in line and resolves nothing, leaving the connection unready - `Connection.sync` from `@expressive/sql` now resolves `this | undefined`.
