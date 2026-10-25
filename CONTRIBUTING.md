# Contributing to DesignRail

Thanks for helping. DesignRail is useful only if its findings are trustworthy, so the most valuable
contributions are precise bug reports and well-tested rule changes.

## Reporting a problem

Please include:

- the DesignRail version (`designrail --version`) and Node.js version;
- a minimal code snippet that DesignRail misjudged, and what you expected;
- the relevant parts of `designrail/config.yaml`, `tokens.json`, or `components.json`;
- the output of `designrail check --json` for that snippet, or `designrail doctor`.

Remove anything confidential first. DesignRail reports contain file paths and short code excerpts.

## Development setup

Requirements: Node.js `^22.18.0` or `>=24.11.0` and pnpm (the version is pinned in `package.json`).

```sh
pnpm install
pnpm lint
pnpm format:check
pnpm typecheck
pnpm test        # unit and integration tests
pnpm build
pnpm test:e2e    # packs the build and runs the full workflow in a temporary project (needs registry access)
```

Run the CLI from source after building with `node dist/cli/bin.js <command>`, or against the demo:
`node dist/cli/bin.js --cwd examples/react-tailwind-demo check`.

## Making changes

- Keep core logic callable without the CLI. Commands in `src/cli/` should only parse options, call core
  functions, and format output.
- Never execute project code, evaluate configuration files, or run commands found in a project.
- Prefer reporting a pattern as "not analyzed" over guessing. A new rule check needs tests for detected
  cases, accepted cases, and at least one realistic false-positive case.
- Keep reports deterministic: sort output and avoid depending on filesystem order.
- Update `docs/` and `CHANGELOG.md` when behavior changes, and the demo fixtures
  (`examples/react-tailwind-demo/fixtures/expected-findings.json`) when findings change.
- Do not add runtime dependencies for small utilities.

## Pull requests

Describe the behavior change and how you verified it. CI runs lint, format check, typecheck, tests, build,
and the packaged smoke test on Node.js 22 and 24.

By contributing, you agree that your contributions are licensed under the MIT License.
