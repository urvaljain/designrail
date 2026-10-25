# Architecture

DesignRail is one TypeScript package (`designrail`) with a CLI (`dist/cli/bin.js`) and a programmatic API
(`dist/index.js`). The CLI is a thin layer: every command calls core functions that return data and never
write to stdout themselves.

## Module layout

```text
src/
  cli/            Commander program, commands, terminal formatting, prompts, injectable I/O
  config/         config.yaml schema (Zod), loading, comment-preserving updates, commented template
  tokens/         token schema, registry (aliases, cycles, reference indexes), importers, merge
  components/     component registry schema, export inference, registration
  adapters/       instruction rendering, managed-section markers, sync planning and drift detection
  tasks/          deterministic task-brief templates
  checker/
    parsers/      Babel source parsing, traversal, Tailwind class parser, CSS value helpers
    analysis/     one-pass fact extraction per file (TSX/JSX/TS/JS and CSS)
    rules/        DR001-DR008 and shared helpers
    engine.ts     file collection, rule execution, suppressions, exceptions, report assembly
  reports/        report schema, storage, freshness checks, repair-prompt rendering
  diagnostics/    status and doctor
  filesystem/     path safety, protected paths, atomic writes, file walking
  project/        project detection, init planning, loaded project context
  utilities/      errors and exit codes, hashing, text helpers, JSONC reader
templates/        starter Markdown files copied by init (shipped in the package)
```

## Data flow

```text
designrail/config.yaml ─┐
designrail/tokens.json ─┼─> loadProject() ─> ProjectContext ─┬─> renderInstructions() ─> sync
designrail/components.json┘                                   ├─> renderTaskBrief()    ─> task
                                                              └─> runCheck() ─> CheckReport ─> fix-prompt
```

`runCheck` collects files (protections, then include/exclude), parses each file once, extracts facts
(class tokens, style declarations, JSX elements and attributes, imports, label targets, suppressions,
coverage gaps) into a `FileAnalysis`, and runs every enabled rule against that shared analysis. Rules
emit findings; the engine applies suppressions, config exceptions, severity overrides and caps, then
sorts everything deterministically.

## Rule contract

```ts
interface Rule {
  id: RuleId; // stable ID, e.g. "DR001"
  name: string;
  description: string;
  defaultSeverity: Severity; // overridable in config
  languages: readonly Language[];
  check(context: RuleContext): void;
}
```

`RuleContext` provides the project (config, token registry, components), the file analysis, `report()`,
`coverage()` for patterns the rule cannot evaluate, and `priorFindings()` so DR005 can skip values already
reported by DR001-DR003.

## Exit codes

| Code | Meaning                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------- |
| 0    | Success; checks met the failure threshold                                                                         |
| 1    | Findings at or above the threshold, or drift (`sync --check`)                                                     |
| 2    | Invalid configuration or usage, unsafe path, parse failure (run not reliable), stale report, or operational error |

`DesignRailError` carries a category (`configuration`, `usage`, `unsafe-path`, `collision`, `parse`,
`stale-report`, `operational`), details, and a hint. The CLI maps any thrown error to exit 2 and, with
`--json`, prints `{ "error": { ... } }` on stdout so machine consumers always get valid JSON.

## Decisions and tradeoffs

- **One package, no monorepo.** The CLI and API share all code; there was no concrete need for separate packages.
- **Babel parser instead of the TypeScript compiler API.** `@babel/parser` is about 2 MB with no dependencies, reports
  syntax errors with locations, and parses TS, TSX, JS, and JSX. The TypeScript compiler would add roughly 20 MB to every
  consumer install, and TypeScript 7 (current at the time of writing) exposes only an unstable JS API. Tradeoff: no
  type information, so analysis is syntactic.
- **TypeScript 6.0 for development.** typescript-eslint supports `<6.1`.
- **Node `^22.18.0 || >=24.11.0`.** Required by `@babel/parser@8` and Commander 15; both lines are LTS.
- **Nothing from the project is executed.** Tailwind v3 configs are parsed into a syntax tree and only literals are
  read; YAML is parsed as plain data and documents with unresolved tags are rejected; commands in `package.json` are
  copied into instructions but never run.
- **Tokens separate design values from code references.** A token stores its value and, separately, the CSS variables
  and Tailwind keys that reference it. A raw literal is not accepted just because it equals a token value, unless
  `policies.rawValues: allow-matching-tokens` is set.
- **Unknown is not wrong.** When the effective value of a utility is unknown (for example Tailwind numeric spacing
  without a policy, or an unregistered Tailwind key), DesignRail records a coverage note instead of a violation, and
  the file is reported as partially analyzed.
- **Severity caps for lower-confidence cases.** Unregistered CSS variables, cross-file label relationships, and
  non-recommended (but working) import paths are capped at `warning` so they do not fail CI by default.
- **One failure threshold.** `check.failOn` (`error`, `warning`, `never`) is the only setting; `--strict` sets the
  effective threshold to `warning`. Reports record both values.
- **Managed sections with a content hash.** Shared files (`AGENTS.md`, `CLAUDE.md`) get a section between
  `<!-- DESIGNRAIL:START -->` and `<!-- DESIGNRAIL:END -->` plus a hash of the generated body. A mismatch means someone
  edited inside the section, and sync refuses to overwrite it without `--force`. Comparisons ignore blank lines and
  Markdown table padding so formatters such as Prettier do not cause drift. Changing the hash format in a future version
  would make old sections look edited; that would need a migration.
- **Owned files for Cursor and the generic context.** DesignRail only rewrites them when they contain its markers;
  otherwise sync reports a collision.
- **Stale evidence is rejected.** Reports store configuration, token, and component fingerprints plus a SHA-256 of
  every scanned file. `fix-prompt` refuses a report when any of these changed or new files entered the scope.
- **Atomic writes.** Files are written to a temporary sibling and renamed. DesignRail refuses to write through
  symlinks, outside the project root, or over files it would otherwise overwrite silently.
- **Templates over generation.** Task briefs and repair prompts are deterministic templates filled with project data
  and report evidence. They do not analyze the request or the codebase.

## Assumptions

- Projects use React with TSX/JSX. Next.js is supported as a project layout (`app/`, `pages/`) and through
  `next/image` in DR006; nothing depends on Next.js.
- Tailwind class names are written without a configured `prefix`.
- Import aliases come from `compilerOptions.paths` in `tsconfig.json` or `jsconfig.json` (read as JSON with comments).
- The first matching `:root`/`html`/`:host` declaration set holds base token values; theme variants are separate.
