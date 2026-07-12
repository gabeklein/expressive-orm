# @expressive/sqlite

## 0.5.0

### Minor Changes

- [#4](https://github.com/gabeklein/expressive-orm/pull/4) [`f0ccb5e`](https://github.com/gabeklein/expressive-orm/commit/f0ccb5e2265221935d18c4ff55279a3496170de1) Pluggable SQLite driver with runtime fallback (bun:sqlite → node:sqlite → better-sqlite3 → sqlite3 → @libsql/client); better-sqlite3 is now an optional dependency. Packages are now ESM-only, built with tsdown. Fixes circular-dependency initialization and type-only export issues surfaced by per-module ESM evaluation.

### Patch Changes

- Updated dependencies [[`f0ccb5e`](https://github.com/gabeklein/expressive-orm/commit/f0ccb5e2265221935d18c4ff55279a3496170de1)]:
  - @expressive/sql@0.4.5

## 0.4.0

### Minor Changes

- 6f4c66b: Major upgrade: generic Fields

### Patch Changes

- Updated dependencies [6f4c66b]
  - @expressive/sql@0.4.0

## 0.3.0

### Minor Changes

- aa94a15: Generic fields

### Patch Changes

- Updated dependencies [aa94a15]
  - @expressive/sql@0.3.0

## 0.2.0

### Minor Changes

- 9720a38: Multiple Updates

### Patch Changes

- e78c530: chore: fix tests
- 004ebe8: replaced bad test scripts
- Updated dependencies [9720a38]
- Updated dependencies [004ebe8]
  - @expressive/sql@0.2.0

## 0.1.1

### Patch Changes

- cef396d: limit published files to "dist" in package.json
- Updated dependencies [cef396d]
  - @expressive/sql@0.1.1
