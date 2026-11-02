# AGENTS.md

Contributor guide for AI agents working in this repository.

## Overview

Expressive ORM - entities on `@expressive/mvc` State with a pluggable driver contract and a `Query` builder. `@expressive/sql` holds the SQL dialect toolkit; `@expressive/sqlite` and `@expressive/postgres` are drivers. Root `FEATURE.md` on a trunk branch holds the agreed scope and build plan for work in progress - read it first.

Monorepo: bun workspaces + changesets. Everything runs under bun (`bun install`, `bun run test`, `bun run build`); never call node or npm directly. Node appears only in `release.yml`, where `changeset publish` shells to npm for the OIDC-authenticated publish.

## Structure

```
packages/orm      - Entities, fields, relations, driver contract, Query (@expressive/orm)
packages/sql      - SQL generator base, SQL connection base, schema sync (@expressive/sql)
packages/sqlite   - SQLite driver, runtime-selected engine (@expressive/sqlite)
packages/postgres - Postgres and PGLite driver (@expressive/postgres)
```

## Commands

```bash
bun install          # Install deps
bun run test         # Per package: tsc --noEmit, then bun test with coverage gates
bun run build        # tsdown per package
bun run changeset    # Write a changeset
```

## Testing

Runner: **vitest** with istanbul coverage, executed on node (`bun run test` invokes it - never call node directly). Config is centralized in root `vitest.config.ts`, which defines the workspace projects and exports `suite(thresholds?)`; per-package `vitest.config.ts` files are two-liners calling it. `suite()` gates statements, branches, functions and lines at 100%; a package below that passes its current floors explicitly. Floors ratchet: raise them in the PR that raises coverage, never lower one. `packages/orm` drops its floors and takes the 100% default once its rebuild lands - a conditional arm is exercised by a test or deleted as dead code; `sql` and the drivers climb as the rebuild touches them.

```ts
import { vi, describe, it, expect } from 'vitest';
```

Use `vi.fn()` for mocks and `vi.spyOn(...)` for spies. Tests live in `*.test.ts` files adjacent to the source they cover.

The memory driver in `packages/orm` is the test floor for entity behaviour. SQL rendering is asserted by inline snapshots in `sql` and the drivers. `postgres` tests run on PGLite; the `pg` connection test expects nothing listening on 5432.

Naming: positive `it('will create instance')`, negative `it('will not trigger update')`, error `it('will throw if not found')`.

## Conventions

- Entities extend `State`; fields are `def` instructions. Anything a State already provides - construction, assignment, observation, destruction - is not reimplemented here.
- Driver-agnostic logic belongs in `packages/orm`. SQL strings belong in `sql` or a driver, never in `orm`.
- Update tests alongside behavioural or type changes - tests must fail without the change.
- Merged code carries essentially no comments. Strip explanatory comments before committing; keep one only where the code would otherwise be misread.
- **Ask before adding public surface.** No new exported functions, classes, types, fields, statics or contract methods without confirming first. Prefer reshaping existing surface.
- Keep `@expressive/mvc` as a peer; take its released version, never a link. A seam missing in mvc lands on `expressive-mvc` `main` as its own PR.

## Change flow

- Branch from `origin/main`, or from the trunk when working under a `FEATURE.md`. Conventional names: `feat/...`, `fix/...`, `chore/...`.
- Trunk work: each step is its own PR into the trunk, small enough to hand-review. Stack PRs: each targets the previous one's branch, the bottom one the trunk. Update `FEATURE.md` in the PR that changes scope or shape. The trunk merges to `main` when release-ready.
- Capture agreed scope and approach in the PR description before implementation - it is the shared plan and review context.
- Prefer more, logically scoped commits over one squashed blob; the PR squashes on merge.
- Commit messages follow conventional prefixes (`feat`, `fix`, `refactor`, `test`, `chore`, `build`, `ci`), optionally scoped by package. No AI attribution: no `Co-authored-by` bot trailers, no "Generated with" footers.
- Write a changeset for anything user-facing: new feature, behaviour change, API addition, breaking change. None for internal refactors, test-only changes, or fixes with no observable effect. `changeset status` runs on every PR as a reminder, not a gate.
- Pushing publishes. Do not push a branch or open a PR beyond what the task calls for. A branch's first push is `git push -u origin <branch>`.
- Never use `git stash` as scratch. Check untracked files before removing a worktree or running `git clean`.

## Releasing

All four packages publish. Merged changesets accumulate on `main`; `release.yml` maintains a "chore: version packages" PR and publishes from CI when it merges. No local publishing.
