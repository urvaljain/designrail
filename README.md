# DesignRail

**Keep AI-generated UI consistent with your design system.**

DesignRail is a local command-line tool for React and TypeScript projects. It turns your design tokens,
approved components, and UI conventions into instruction files for AI coding tools, then checks the code
those tools produce against the same rules and writes evidence-based repair prompts.

You keep using whichever AI coding assistant you prefer. DesignRail supplies shared context and an
independent check. It needs no account, no hosted service, no database, and no AI API key.

> **Status: first release (0.1.0), not yet published to npm.** Install it from a local build or package
> archive as described below. See [what is available, partial, and planned](#feature-status).

## The problem

AI coding tools write plausible UI quickly, but they drift: `bg-blue-500` instead of your `bg-brand`
token, `p-[13px]` instead of your spacing scale, a hand-rolled `<button>` instead of your `Button`
component, an `<img>` without `alt`. Instruction files help, but nothing confirms the result followed them.

DesignRail closes that loop:

```text
Define design rules → generate AI instructions → ask your AI tool for a feature →
check the result → give the AI a repair prompt built from the findings → check again
```

## Example workflow

```sh
designrail init --yes                      # create designrail/ (never overwrites existing files)
designrail import-tokens src/index.css     # tokens from CSS variables / Tailwind v4 @theme
designrail add-component Button src/components/ui/button.tsx --replaces button
designrail sync                            # write AGENTS.md / CLAUDE.md / Cursor rules sections
designrail task "Add a billing panel with a coupon field"   # structured brief + prompt
# ...your AI tool implements the task...
designrail check                           # exit 1 if design errors were found
designrail fix-prompt                      # designrail/reports/latest-fix-prompt.md
# ...give the prompt to your AI tool...
designrail check                           # verify the repair
```

A finding looks like this:

```text
src/features/billing/BillingPanel.tsx
  11:41    error   DR002  Spacing value 18px is not a registered spacing token
                          → Use the closest suitable token: p-md (spacing.md = 1rem) or p-lg (spacing.lg = 1.5rem).
  22:7     error   DR004  Raw <button> used where the registered component Button is expected
                          → Use <Button> (import { Button } from "@/components/ui/button").
```

The [demo walkthrough](examples/react-tailwind-demo/README.md) runs the complete loop on a small
Vite + React + Tailwind app.

## Installation

DesignRail requires **Node.js `^22.18.0` or `>=24.11.0`**.

The package name `designrail` is not published yet, so `npm install designrail` will not work until a
release is published. Build and install it locally:

```sh
git clone <this repository> designrail
cd designrail
pnpm install
pnpm build
npm pack                      # creates designrail-0.1.0.tgz
```

Then, in your project:

```sh
npm install --save-dev /path/to/designrail/designrail-0.1.0.tgz
# or: pnpm add -D /path/to/designrail/designrail-0.1.0.tgz
npx designrail --version
```

Installing it as a dev dependency pins the version that your scripts, CI, and generated AI instructions
run. Add a script so everyone uses the same invocation:

```json
{ "scripts": { "design:check": "designrail check" } }
```

`designrail init` detects such a script and writes it into the generated instructions.

## Commands

| Command                                           | What it does                                                                                                                                                                                        |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `designrail init`                                 | Detects framework, Tailwind version, source folders, and import aliases; creates `designrail/`. Interactive on a terminal; `--yes` for non-interactive use. Existing files are kept.                |
| `designrail status [--json]`                      | Setup state, token and component counts, enabled rules, adapter freshness, last check, setup gaps.                                                                                                  |
| `designrail import-tokens <file>`                 | Imports tokens from DesignRail JSON, a DTCG-style JSON subset, CSS custom properties, Tailwind v4 `@theme`, or a static Tailwind v3 config. Shows added, changed, conflicting, and skipped entries. |
| `designrail add-component <Name> <path>`          | Registers a component (`--import`, `--export`, `--replaces`, `--variants`, `--usage`, ...).                                                                                                         |
| `designrail list-components [--json]`             | Lists registered components and whether their files exist.                                                                                                                                          |
| `designrail sync [--dry-run] [--check] [--force]` | Writes AI instruction files. `--check` exits 1 on drift without writing.                                                                                                                            |
| `designrail task "<description>" [--stdout]`      | Writes a structured task brief and copyable implementation prompt to `designrail/tasks/`.                                                                                                           |
| `designrail check [paths...]`                     | Checks code. `--json`, `--strict`, `--quiet`, `--output <path>`, `--no-report`. Never modifies source files.                                                                                        |
| `designrail fix-prompt [--refresh] [--stdout]`    | Builds a repair prompt from the latest report. Refuses stale reports.                                                                                                                               |
| `designrail doctor [--json]`                      | Diagnoses runtime, configuration, tokens, components, adapters, patterns, and report freshness.                                                                                                     |

Every command accepts `--cwd <dir>` and `--help`. Exit codes are consistent:
`0` success, `1` findings over the threshold or drift (`sync --check`), `2` invalid configuration or usage,
unreliable run (for example a parse failure), or operational error. See [docs/ci.md](docs/ci.md).

## Rules

| ID    | Checks                                                                                                                                                    | Default |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| DR001 | Hard-coded colors (hex, `rgb()`, `hsl()`, other color functions) in CSS, inline styles, and Tailwind arbitrary values; Tailwind default-palette utilities | error   |
| DR002 | Margin, padding, and gap values that are not spacing tokens                                                                                               | error   |
| DR003 | Font families that are not approved font tokens or configured fallbacks                                                                                   | error   |
| DR004 | Raw elements where a registered component explicitly replaces them                                                                                        | error   |
| DR005 | Inline `style` policy (`forbid`, `allow-token-references`, `allow`)                                                                                       | warning |
| DR006 | Images without an `alt` attribute                                                                                                                         | error   |
| DR007 | Form controls without local evidence of an accessible name                                                                                                | error   |
| DR008 | Imports that bypass a registered component                                                                                                                | error   |

Details, options, and suppression syntax: [docs/rules.md](docs/rules.md).

## Supported syntax and limits

**Parsed:** `.tsx`, `.jsx`, `.ts`, `.js` (with `@babel/parser`) and `.css` (with PostCSS).

**Analyzed:** literal `className` strings, static template literal parts, static branches inside
`cn`/`clsx`/`classnames`/`twMerge`/`cva`/`tv` (configurable), JSX `style` object literals, CSS
declarations, and `@apply`.

**Not analyzed:** classes computed at runtime, dynamic style values, the CSS cascade, styles behind
arbitrary function calls, CSS-in-JS libraries, SCSS/Less, Vue/Svelte/Astro/MDX files, and component
behavior. Patterns DesignRail cannot analyze are listed in the report as "unsupported" and the file is
marked partially analyzed. They are never counted as validated.

**Tailwind:** class names are parsed statically. DesignRail does not run Tailwind or read its compiled
output. Numeric utilities such as `p-4` are not interpreted as pixels: they are reported as unverified
unless you set `policies.tailwind.numericSpacing`.

A passing check is not proof of visual fidelity or complete accessibility. Keyboard behavior, focus,
responsive layout, and contrast still need manual review. See [docs/evaluation.md](docs/evaluation.md)
for known false-positive and false-negative areas.

## AI tools

`designrail sync` writes, for the adapters you select:

| Adapter       | File                                                 | Notes                                           |
| ------------- | ---------------------------------------------------- | ----------------------------------------------- |
| `codex`       | `AGENTS.md` (managed section)                        | Also read by other tools that support AGENTS.md |
| `claude-code` | `CLAUDE.md` or `.claude/CLAUDE.md` (managed section) |                                                 |
| `cursor`      | `.cursor/rules/designrail.mdc` (owned file)          | Format based on secondary sources; see docs     |
| `generic`     | `DESIGNRAIL_CONTEXT.md` (owned file)                 | Attach or paste into any other assistant        |

Shared files keep everything outside `<!-- DESIGNRAIL:START -->` / `<!-- DESIGNRAIL:END -->`. Malformed
markers, hand edits inside the section, and files DesignRail did not create stop sync with an error
instead of guessing. Instruction files guide AI behavior; they cannot guarantee compliance, and tools may
not always load them. See [docs/ai-tools.md](docs/ai-tools.md) for what was verified.

## Privacy and data boundaries

- DesignRail runs locally. It makes no network requests, sends no project contents anywhere, and has no
  telemetry.
- It never executes project code: Tailwind configs are parsed as syntax trees, YAML and JSON are read as
  data, and commands found in project files are only written into instructions, never run.
- It skips `.env*` files, keys and certificates, `node_modules`, `.git`, build output, coverage,
  lockfiles, and its own reports.
- The AI tool you give DesignRail's instructions or prompts to has its own data handling. DesignRail does
  not control what that tool sends or stores.

## Feature status

**Available in this release:** everything in the command and rule tables above, Tailwind v3 (static
config) and v4 (`@theme`) token import, CSS custom properties, DTCG-style JSON subset, the four adapters,
suppressions with required reasons, config exceptions, stale-report detection, JSON reports, and the
programmatic API (`import { runCheck, loadProject } from "designrail"`).

**Partially supported:**

- Tailwind configs: only literal values; plugins, presets, functions, and spreads are reported, not evaluated.
- Theme variants (`.dark`, media queries): reported as skipped; only base values are imported.
- Form labels (DR007): only relationships visible in a single file.
- Cursor rules format: based on secondary documentation sources.

**Planned (not implemented):** see [docs/roadmap.md](docs/roadmap.md), including runtime focus and
responsive checks, screenshot comparison, Figma import, and editor integrations.

## Documentation

- [Getting started](docs/getting-started.md)
- [Configuration](docs/configuration.md)
- [Tokens](docs/tokens.md) and [components](docs/components.md)
- [AI tools](docs/ai-tools.md)
- [Rules](docs/rules.md)
- [CI](docs/ci.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Evaluation](docs/evaluation.md)
- [Architecture](docs/architecture.md)
- [Roadmap](docs/roadmap.md)

## Development

```sh
pnpm install
pnpm lint && pnpm typecheck && pnpm test && pnpm build
pnpm test:e2e       # packs the build and runs the full workflow in a temporary project (needs npm registry access)
node dist/cli/bin.js --help
```

## Contributing

Bug reports with a minimal reproduction (a snippet of the code DesignRail misjudged and the relevant
config) are the most useful contribution. See [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). Security issues: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
