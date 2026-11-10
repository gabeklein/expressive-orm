---
"@expressive/orm": patch
---

**`@expressive/orm` bundles under Metro.** `transaction` takes `AsyncLocalStorage` from `process.getBuiltinModule` instead of a dynamic `import()`, which Metro's bundler rejects, so a React Native app importing `@expressive/orm` - `memory()` included - builds. Where the built-in is missing, `transaction` throws as before.
