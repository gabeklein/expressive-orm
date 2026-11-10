---
"@expressive/sql": patch
---

**`@expressive/sql` bundles under Metro.** The SQLite driver loader sits in its own module, which a `react-native` package field swaps for one that loads nothing, so Metro no longer rejects its dynamic `import()`. On React Native, pass an `Engine` in place of a filename; a filename or libSQL address rejects when the connection opens.
