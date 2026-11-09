---
"@expressive/orm": patch
"@expressive/sql": patch
"@expressive/postgres": patch
---

Ship each package's agent skill in the package, at `skills/expressive-<pkg>/SKILL.md`, so the docs an agent reads match the installed version. `npx skills experimental_sync` links them into `.claude/skills/` and `.agents/skills/`. `@expressive/sql` lists `expressive-orm`, and `@expressive/postgres` lists `expressive-orm` and `expressive-sql`, in a `skills` field, so sync installs the skills each one builds on.
