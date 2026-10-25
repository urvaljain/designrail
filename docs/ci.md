# CI

Install DesignRail as a dev dependency so CI runs the version recorded in your lockfile. Do not fetch an
unpinned package in CI (for example a bare `npx designrail@latest`).

## Exit codes

| Code | `check`                                                                        | `sync --check`                                      | Other commands                                                                               |
| ---- | ------------------------------------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 0    | No findings at or above the effective threshold                                | Generated files are up to date                      | Success                                                                                      |
| 1    | Findings at or above the threshold                                             | Files are missing or out of date                    | (not used)                                                                                   |
| 2    | Invalid config, token cycles, unsafe paths, or a file that could not be parsed | Malformed markers, collisions, hand-edited sections | Invalid usage or configuration, stale report (`fix-prompt`), configuration errors (`doctor`) |

The default threshold is `error` (`check.failOn`). `--strict` also fails on warnings. A parse failure
always exits 2: the report is written, but it is marked `incomplete` and never counts as a clean run.

## Example workflow (GitHub Actions)

A copy is in [`examples/ci/designrail.yml`](../examples/ci/designrail.yml):

```yaml
name: DesignRail
on:
  pull_request:
permissions:
  contents: read
jobs:
  design-check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: pnpm/action-setup@v6
      - uses: actions/setup-node@v7
        with:
          node-version: "24.x"
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec designrail sync --check
      - run: pnpm exec designrail check --output designrail-report.json
      - if: always()
        uses: actions/upload-artifact@v7
        with:
          name: designrail-report
          path: designrail-report.json
          if-no-files-found: ignore
```

With npm, use `npm ci` and `npx designrail ...` (which runs the locally installed binary).

Action versions were current major tags on 2026-10-25 (`actions/checkout@v7`, `actions/setup-node@v7`,
`pnpm/action-setup@v6`, `actions/upload-artifact@v7`). Pin to full commit SHAs if your policy requires it.

## JSON output

`designrail check --json` prints only the report on stdout (no colors, banners, or progress output), so it
can be piped to `jq` or saved. Operational errors print `{ "error": { "category", "message", "details",
"hint" } }` on stdout and a message on stderr, with exit code 2.

Report fields (schema version 1):

| Field                                  | Content                                                                             |
| -------------------------------------- | ----------------------------------------------------------------------------------- |
| `schemaVersion`, `tool`, `generatedAt` | Report format, DesignRail version, timestamp                                        |
| `scope`                                | Paths checked and whether `--strict` was used                                       |
| `policy`                               | Configured `failOn` and the effective threshold                                     |
| `fingerprints`                         | SHA-256 of the effective config, tokens, and components                             |
| `files`                                | Every scanned file with its SHA-256 and `complete`, `partial`, or `parse-error`     |
| `summary`                              | Counts of files, errors, warnings, info, suppressed, excepted, unsupported patterns |
| `violations`                           | Sorted by file, line, column, rule                                                  |
| `parseFailures`                        | Files that could not be parsed, with locations                                      |
| `unsupported`                          | Patterns that could not be analyzed (dynamic classes, unknown mappings, ...)        |
| `skipped`                              | Explicit paths that were excluded, protected, unsupported, or not found             |
| `suppressions`                         | Each suppression comment and whether it was used, unused, or invalid                |
| `result`                               | `pass`, `fail`, or `incomplete`, the exit code, and a reason                        |

The report contains file paths and short evidence snippets from your code, nothing else. Reports are
written atomically to `designrail/reports/latest.json` (disable with `--no-report` or
`reports.enabled: false`); `--output <path>` writes an extra copy inside the project.

## Pull-request annotations

DesignRail does not post comments or annotations itself. The JSON report has everything needed to build
them (file, line, column, rule, message) with your CI system's tooling.
