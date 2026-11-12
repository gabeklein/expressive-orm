---
"@expressive/orm": minor
---

A class bound as an object - `Connection.new({ User, Post })` - takes its default table name from its key, in snake case. Keys survive minification where class names don't, so a bundled app keeps its tables without `static table`. An explicit `static table` still wins, and an array binds as before.
