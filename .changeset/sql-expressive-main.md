---
"@expressive/sql": patch
---

`expressive` joins installed `@expressive/*` packages through `main` instead of a hard-coded root: help lists only what is installed, each command parses with its own copy of `@expressive/cli`, and `expressive dev` is no longer an install hint when `@expressive/dev` is missing. Release alongside `@expressive/cli` 0.3.
