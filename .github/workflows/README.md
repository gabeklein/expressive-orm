# CI/CD Workflow Overview

## pr.yml (pull requests -> main)

Blocking:

- `bun run test` and `bun run build`.
- `skills-check.ts` - each published package ships its skill with valid
  frontmatter, packs `skills`, and lists exactly its direct `@expressive/*`
  dependencies in the `skills` field; links between skills resolve as installed.
- `example-check.ts` - every JSDoc `@example` typechecks against its package's
  source.
- `dts-check.ts` - every JSDoc block in the built `.d.ts` attaches to a
  declaration, so it shows on hover.
- `bundle-check.ts` - a browser bundle of `{ Type, str, Remote }` from
  `@expressive/sql` or `@expressive/postgres` is the same size as the same
  names from `@expressive/orm`, with no driver code or `sql-formatter`; and a
  probe app (SQLite, `Query`, `Remote`, `Memory`) bundled with tree-shaking
  prints the same as bundled whole, so a module dropped under `"sideEffects"`
  takes nothing the app relies on. It covers what the probe exercises, not
  every path. Bundles with `rolldown`, a root dev dependency.

The frozen-lockfile install in the `setup` action doubles as the
internal-dependency desync guard - a workspace version outside a sibling's range
cannot reach main.

Non-blocking signals: `changeset status` (a preview of which packages would
bump) and `npm publish --dry-run` pack validation for the publishable packages.

## release.yml (push -> main)

`changesets/action` maintains the "Version Packages" PR (`changeset version`
+ `bun install` so the lockfile stays consistent with the bumps). Merging that
PR builds the packages and runs `changeset publish`.

Publishing authenticates via npm OIDC trusted publishing - no token secrets.
Each published package's npm settings trust this exact workflow filename under
the GitHub `release` environment (deployment branches restricted to `main`).
Renaming this file breaks every npm-side config. `changeset publish` skips
versions already on the registry, so re-running a failed job completes a
partial release.

First publish of a new package cannot use OIDC (npm requires the package to
exist before a trusted publisher attaches) - publish a stub manually, attach
the trusted publisher, then release normally.
