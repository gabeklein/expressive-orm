---
"@expressive/orm": patch
---

**`@expressive/orm` bundles under Metro.** `transaction` takes `AsyncLocalStorage` from `process.getBuiltinModule` instead of a dynamic `import()`, which Metro's bundler rejects, so a React Native app importing `@expressive/orm` - `memory()` included - builds. `transaction` now needs Node 20.16+ or 22.3+, Bun, Deno, or Workers with `nodejs_compat`; elsewhere, React Native included, it throws.
