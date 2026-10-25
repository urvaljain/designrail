# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow semantic versioning.

## [Unreleased]

## [0.1.0] - Not yet published

First release candidate. Built and verified locally; not published to npm.

### Added

- CLI commands: `init`, `status`, `import-tokens`, `add-component`, `list-components`, `sync`, `task`,
  `check`, `fix-prompt`, `doctor`, with `--help`, `--version`, `--cwd`, and JSON output where useful.
- Versioned, validated schemas for configuration (`designrail/config.yaml`), tokens, components, and reports.
- Token import from DesignRail JSON, a DTCG-style JSON subset, CSS custom properties, Tailwind v4 `@theme`,
  and literal values in Tailwind v3 configs (parsed, never evaluated).
- AI instruction adapters: `AGENTS.md` and `CLAUDE.md` managed sections, `.cursor/rules/designrail.mdc`,
  and `DESIGNRAIL_CONTEXT.md`, with drift detection (`sync --check`) and protection against malformed
  markers, collisions, and hand edits.
- Checker rules DR001–DR008 with suppressions that require a reason, config exceptions, coverage
  reporting for patterns that cannot be analyzed, and deterministic JSON reports.
- Repair prompts built only from fresh reports (`fix-prompt`), with stale-evidence detection.
- Demo app (`examples/react-tailwind-demo`) and a packaged end-to-end test.
