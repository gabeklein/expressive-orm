# AGENTS.md

Contributor guide for AI agents working in this repository.

## Overview

Expressive ORM - entities on `@expressive/mvc` Model with a pluggable driver contract and a `Query` builder. `@expressive/sql` holds the SQL toolkit, the SQL datatype vocabulary and SQLite, and re-exports orm; `@expressive/postgres` builds on it and re-exports it. `@expressive/sqlite` is a deprecated re-export of sql. Root `FEATURE.md` on a trunk branch holds the agreed scope and build plan for work in progress - read it first.

Monorepo: bun workspaces + changesets. Install, scripts and builds run under bun (`bun install`, `bun run test`, `bun run build`); tests run on vitest, which executes on node (`bun run test` invokes it). Never call node or npm directly. npm appears only in CI: `pr.yml`'s pack validation (`npm publish --dry-run`) and `release.yml`, where `changeset publish` shells to npm for the OIDC-authenticated publish.

## Structure

```
packages/orm      - Entities, fields, relations, Connection (driver base and identity map), memory driver, Query (@expressive/orm)
packages/sql      - SQL generator and connection base, datatype vocabulary, SQLite driver with runtime-selected engine (@expressive/sql)
packages/postgres - Postgres and PGLite driver (@expressive/postgres)
packages/sqlite   - Deprecated re-export of @expressive/sql (@expressive/sqlite)
```

## Commands

```bash
bun install          # Install deps
bun run test         # Per package: typecheck, then coverage
bun run typecheck    # tsc --noEmit per package
bun run coverage     # vitest with coverage gates per package
bun run build        # tsdown per package
bun run changeset    # Write a changeset
```

## Testing

Runner: **vitest** with istanbul coverage, executed on node (`bun run test` invokes it - never call node directly). Config is centralized in root `vitest.config.ts`, which defines the workspace projects and exports `suite(thresholds?)`; per-package `vitest.config.ts` files are two-liners calling it. `suite()` gates statements, branches, functions and lines at 100%; a package below that passes its current floors explicitly. Floors ratchet: raise them in the PR that raises coverage, never lower one. `orm` and `sql` take the 100% default - a conditional arm is exercised by a test or deleted as dead code; `postgres` passes floors and climbs as the rebuild touches it.

```ts
import { vi, describe, it, expect } from 'vitest';
```

Use `vi.fn()` for mocks and `vi.spyOn(...)` for spies. Tests live in `*.test.ts` files adjacent to the source they cover.

The memory driver in `packages/orm` is the test floor for entity behaviour. SQL rendering is asserted by inline snapshots in `sql` and `postgres`. SQLite tests run on `node:sqlite`; driver fallbacks are tested through mocked modules. `postgres` tests run on PGLite; the `pg` connection test expects nothing listening on 5432.

Naming: positive `it('will create instance')`, negative `it('will not trigger update')`, error `it('will throw if not found')`.

## Conventions

- Entities extend `Model`; fields are `def` instructions. Anything a Model already provides - construction, assignment, observation, destruction - is not reimplemented here.
- Driver-agnostic logic belongs in `packages/orm`. SQL strings belong in `sql` or a driver, never in `orm`.
- Update tests alongside behavioural or type changes - tests must fail without the change.
- A user-facing change updates the root README (and a package README it touches); every sample there runs against the built dists.
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

All four packages publish; `@expressive/sqlite` is a deprecated shim, marked with `npm deprecate` by the maintainer after it publishes. Users install `@expressive/sql` or `@expressive/postgres`; the root README is the guide, each package README a short entry pointing to it. Internal dependencies are carets of the current release, not `workspace:` ranges - `changeset publish` packs with npm, which does not rewrite them. Merged changesets accumulate on `main`; `release.yml` maintains a "chore: version packages" PR and publishes from CI when it merges. No local publishing.
