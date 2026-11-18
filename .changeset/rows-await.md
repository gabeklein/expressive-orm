---
"@expressive/orm": minor
---

A `rows()` relation is awaitable - `await user.posts` resolves `load()`, so `posts = set(async () => this.user.posts)` holds the related entities in a Model.
