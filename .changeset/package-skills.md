---
"@expressive/orm": patch
"@expressive/sql": patch
"@expressive/postgres": patch
---

Ship each package's agent skill in the package, at `skills/expressive-<pkg>/SKILL.md`, so the docs an agent reads match the installed version. Agents read them from `node_modules/@expressive/<pkg>/skills/` - point one there with a line in `AGENTS.md`, or `npx skills add gabeklein/expressive`.
