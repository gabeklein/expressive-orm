# @expressive/sql

## 0.4.5

### Patch Changes

- [#4](https://github.com/gabeklein/expressive-orm/pull/4) [`f0ccb5e`](https://github.com/gabeklein/expressive-orm/commit/f0ccb5e2265221935d18c4ff55279a3496170de1) Pluggable SQLite driver with runtime fallback (bun:sqlite → node:sqlite → better-sqlite3 → sqlite3 → @libsql/client); better-sqlite3 is now an optional dependency. Packages are now ESM-only, built with tsdown. Fixes circular-dependency initialization and type-only export issues surfaced by per-module ESM evaluation.

## 0.4.4

### Patch Changes

- allow uuid type for Primary

## 0.4.3

### Patch Changes

- fix: failed to build previous change

## 0.4.2

### Patch Changes

- 2acdeb2: primary and fields with defaults are now Optional

## 0.4.1

### Patch Changes

- b8b2195: fix: rebuild libraries

## 0.4.0

### Minor Changes

- 6f4c66b: Major upgrade: generic Fields

## 0.3.1

### Patch Changes

- 857a18c: Improved types for One

## 0.3.0

### Minor Changes

- aa94a15: Generic fields

## 0.2.1

### Patch Changes

- f5c7c31: Allow any number as Str length

## 0.2.0

### Minor Changes

- 9720a38: Multiple Updates

### Patch Changes

- 004ebe8: replaced bad test scripts

## 0.1.1

### Patch Changes

- cef396d: limit published files to "dist" in package.json
