---
"@expressive/postgres": minor
---

`PGConnection` and `PGLiteConnection` take `{ live: false }` to turn off live rows - no LISTEN, so no client is held between requests, as Cloudflare Workers and Hyperdrive need.
