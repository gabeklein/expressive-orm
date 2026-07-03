---
"@expressive/sqlite": minor
"@expressive/sql": patch
"@expressive/postgres": patch
"@expressive/orm": patch
---

Pluggable SQLite driver with runtime fallback (bun:sqlite → node:sqlite → better-sqlite3 → sqlite3 → @libsql/client); better-sqlite3 is now an optional dependency. Packages are now ESM-only, built with tsdown. Fixes circular-dependency initialization and type-only export issues surfaced by per-module ESM evaluation.
