# DesignRail implementation progress

Working record for the first release. Kept short so work can resume after interruptions.

## Plan

| Phase | Scope                                                                                  | Status                                             |
| ----- | -------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A     | Inspect environment, verify AI-tool conventions and Tailwind formats, record decisions | done                                               |
| B     | Package scaffold, schemas, path safety, filesystem utilities, CLI frame, exit codes    | done                                               |
| C     | `init`, `status`, `import-tokens`, `add-component`, `list-components`                  | done                                               |
| D     | Adapters, `sync` (+ `--dry-run`, `--check`), `task`                                    | done                                               |
| E     | TSX/CSS parsing, class extraction, rules DR001–DR008, suppressions, reports, `check`   | done                                               |
| F     | Stale-report detection, `fix-prompt`, `doctor`                                         | done                                               |
| G     | Demo app, fixtures, evaluation notes                                                   | done (demo builds with Vite; repair loop verified) |
| H     | Tests, docs, CI, packaged end-to-end test, final fixes                                 | done                                               |

## Environment facts (verified 2026-10-25)

- Node 22.22.0, pnpm 10.28.0, npm registry reachable. The `designrail` npm name returned 404 (unclaimed) on that date.
- `typescript@7` ships only an `unstable/*` JS API, so dev tooling uses `typescript@~6.0.3` (typescript-eslint supports `<6.1`).
- Runtime parser: `@babel/parser@8` (requires Node `^22.18 || >=24.11`); CSS: `postcss` + `postcss-value-parser`.
- Claude Code docs (code.claude.com/docs/en/memory) were fetched directly. Cursor and OpenAI docs hosts were blocked by
  the sandbox egress proxy; those conventions come from search-result summaries of the official pages and secondary
  sources. See docs/ai-tools.md.
- Tailwind v4 namespaces were verified from the `tailwindcss@4.3.3` package's `theme.css`, and the demo build confirmed
  that `@theme` variables generate the expected utilities.
- GitHub Action majors (checkout v7, setup-node v7, pnpm/action-setup v6, upload-artifact v7) were read from the
  actions' git tags.

## Decisions log

See docs/architecture.md ("Decisions and tradeoffs").
