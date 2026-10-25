# Configuration

DesignRail reads `designrail/config.yaml` from the project root (or the directory given with `--cwd`).
The file is validated against a versioned schema; unknown keys, wrong types, and invalid values are
configuration errors (exit code 2) that name the offending path, for example `rules.DR001.severity`.

- Paths are relative to the project root. They are normalized (`./src//x/` becomes `src/x`), and any path
  that resolves outside the root, including through a symlink, is rejected.
- The file is plain YAML data. Custom tags (for example `!!js/function`) are rejected, and nothing in it is executed.
- `designrail init` writes a commented copy with detected values. `import-tokens` updates
  `tokens.definitionFiles` through the YAML document model, so your comments are kept.
- Every field has a default, so `schemaVersion: 1` alone is a valid configuration.

## Generated example

This is what `designrail init --yes` writes for a React project with Tailwind v4 and a `src/` folder:

```yaml
# DesignRail configuration (schema version 1).
# Paths are relative to the project root. DesignRail reads this file as data only;
# it never executes project code or commands found in project files.
# Reference: docs/configuration.md in the DesignRail repository.
schemaVersion: 1

project:
  name: my-app
  # react | next | unknown (Next.js projects are also React projects)
  framework: react
  styling:
    # v3 | v4 | none — controls which Tailwind utility conventions the checker applies
    tailwind: v4
    css: true

source:
  # Files DesignRail checks. Secrets, node_modules, .git, build output, coverage, lockfiles,
  # and DesignRail's own reports/tasks are always skipped, even if matched here.
  include:
    - src/**/*.{tsx,jsx,ts,js,css}
  exclude:
    - "**/*.test.*"
    - "**/*.spec.*"
    - "**/__tests__/**"
    - "**/__mocks__/**"
    - "**/*.d.ts"
  # Import aliases (from tsconfig "paths"), used to resolve component imports for DR008.
  importAliases: {}
  # Class-composition helpers whose static string arguments are analyzed.
  classFunctions: [cn, clsx, classnames, classNames, cx, twMerge, twJoin, cva, tv]

paths:
  tokens: designrail/tokens.json
  components: designrail/components.json
  designRules: designrail/design-rules.md
  accessibilityRules: designrail/accessibility-rules.md
  productContext: designrail/product-context.md
  tasks: designrail/tasks

tokens:
  # Files that define tokens (for example the CSS file with :root variables).
  # Raw values are expected there, so DR001-DR003 do not report them.
  definitionFiles: []

policies:
  # forbid: raw values need a token reference or an exception.
  # allow-matching-tokens: a raw value exactly equal to a token value passes.
  rawValues: forbid
  # Pixels per rem when comparing values across units. null keeps px and rem distinct.
  remBasePx: null
  spacing:
    zero: allow # allow | flag   (0, 0px)
    auto: allow # allow | flag   (margin: auto)
    percentages: allow # allow | flag
    calc: tokens-only # tokens-only | allow | flag
  # Generic or fallback font families accepted after (or instead of) a font token.
  fontFallbacks:
    [
      serif,
      sans-serif,
      monospace,
      cursive,
      fantasy,
      system-ui,
      ui-serif,
      ui-sans-serif,
      ui-monospace,
      ui-rounded,
      emoji,
      math,
      fangsong,
      -apple-system,
      BlinkMacSystemFont,
    ]
  tailwind:
    # unknown: numeric utilities such as p-4 are reported as unverified coverage, not violations.
    # allow: Tailwind's numeric spacing scale is approved. flag: only token-backed spacing keys pass.
    numericSpacing: unknown
    # flag: default palette utilities such as bg-blue-500 are reported (DR001). allow: they pass.
    defaultPalette: flag
  # DR005: forbid | allow-token-references | allow
  inlineStyles: allow-token-references
  # DR006 image elements. A component named "Image" imported from next/image is always checked.
  imageElements: [img]

# Enable/disable rules and override severities (error | warning | info).
rules:
  DR001: { enabled: true, severity: error }
  DR002: { enabled: true, severity: error }
  DR003: { enabled: true, severity: error }
  DR004: { enabled: true, severity: error }
  DR005: { enabled: true, severity: warning }
  DR006: { enabled: true, severity: error }
  DR007: { enabled: true, severity: error }
  DR008: { enabled: true, severity: error }

check:
  # Lowest severity that fails `designrail check`: error | warning | never.
  # --strict always fails on warnings too.
  failOn: error

# Approved exceptions. Each needs a rule, a reason, and optionally files (globs) and values.
# Example:
#   - rule: DR001
#     files: ["src/legacy/**"]
#     values: ["#ff0000"]
#     reason: Legacy marketing page scheduled for redesign
exceptions: []

responsive:
  # mobile-first | desktop-first | unspecified
  approach: unspecified
  # Short project-specific guidance included in generated AI instructions.
  guidance: []

# AI instruction targets generated by `designrail sync`: codex | claude-code | cursor | generic
# Optional "path" overrides the default file location.
adapters:
  - id: codex
  - id: claude-code

commands:
  # How this project runs DesignRail (shown to AI tools). DesignRail never runs these itself.
  check: npx designrail check
  projectChecks: []

reports:
  enabled: true
  directory: designrail/reports
```

## Reference

### `project`

| Key                | Values                     | Default                          | Notes                                                                             |
| ------------------ | -------------------------- | -------------------------------- | --------------------------------------------------------------------------------- |
| `name`             | string                     | package.json name or folder name | Shown in generated instructions                                                   |
| `framework`        | `react`, `next`, `unknown` | detected                         | `next` adds `app/` and `pages/` patterns at init; checks do not depend on Next.js |
| `styling.tailwind` | `v3`, `v4`, `none`         | detected                         | With `none`, Tailwind class checks are off (except `@apply` in CSS)               |
| `styling.css`      | boolean                    | `true`                           | Informational                                                                     |

### `source`

| Key              | Default                                                                      | Notes                                                                      |
| ---------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `include`        | `src/**/*.{tsx,jsx,ts,js,css}` plus detected `app/`, `pages/`, `components/` | picomatch globs, matched against project-relative paths                    |
| `exclude`        | tests (`*.test.*`, `*.spec.*`, `__tests__`, `__mocks__`) and `*.d.ts`        | Applied after `include`, including to explicit `check` paths               |
| `importAliases`  | from `tsconfig.json`/`jsconfig.json` `compilerOptions.paths`                 | Used to resolve imports for DR008 and to infer component import specifiers |
| `classFunctions` | `cn, clsx, classnames, classNames, cx, twMerge, twJoin, cva, tv`             | Static arguments of these calls are analyzed as class names                |

Some paths are never scanned, whatever `include` says: `.env*`, private keys and certificates
(`*.pem`, `*.key`, `id_rsa*`, ...), `.npmrc`, `.netrc`, `node_modules`, `.git`, build output (`dist`,
`build`, `out`, `.next`, `.nuxt`, `.output`, `.vercel`, `.turbo`, `.svelte-kit`, `storybook-static`, ...),
`coverage`, lockfiles, and DesignRail's own `reports` and `tasks` directories.

### `paths`

Locations of `tokens.json`, `components.json`, the three Markdown context files, and the task directory.
Change them only if you keep DesignRail files elsewhere.

### `tokens.definitionFiles`

Files that define tokens, such as a stylesheet with `:root` variables or a Tailwind v4 `@theme` block.
DR001-DR003 do not report raw values in these files. `import-tokens` adds CSS sources here automatically.

### `policies`

| Key                       | Values                                      | Default                                                                  | Effect                                                                                                                                                            |
| ------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rawValues`               | `forbid`, `allow-matching-tokens`           | `forbid`                                                                 | With `forbid`, a raw value needs a token reference or an exception even when it equals a token value. With `allow-matching-tokens`, an exactly equal value passes |
| `remBasePx`               | number or `null`                            | `null`                                                                   | Pixels per rem for comparing px and rem values. `null` never equates them                                                                                         |
| `spacing.zero`            | `allow`, `flag`                             | `allow`                                                                  | `0`, `0px`, `m-0`                                                                                                                                                 |
| `spacing.auto`            | `allow`, `flag`                             | `allow`                                                                  | `margin: auto`, `mx-auto`                                                                                                                                         |
| `spacing.percentages`     | `allow`, `flag`                             | `allow`                                                                  | `padding: 5%`                                                                                                                                                     |
| `spacing.calc`            | `tokens-only`, `allow`, `flag`              | `tokens-only`                                                            | `tokens-only` accepts `calc()`/`min()`/`max()`/`clamp()` built from spacing tokens, unitless numbers, zero, and allowed percentages                               |
| `fontFallbacks`           | list                                        | CSS generic families, `system-ui`, `-apple-system`, `BlinkMacSystemFont` | Families accepted after (or instead of) a font token                                                                                                              |
| `tailwind.numericSpacing` | `unknown`, `allow`, `flag`                  | `unknown`                                                                | How `p-4`-style utilities are treated. `unknown` records a coverage note; it never guesses pixel values                                                           |
| `tailwind.defaultPalette` | `flag`, `allow`                             | `flag`                                                                   | Whether `bg-blue-500`-style default palette utilities are DR001 findings                                                                                          |
| `inlineStyles`            | `forbid`, `allow-token-references`, `allow` | `allow-token-references`                                                 | DR005 policy                                                                                                                                                      |
| `imageElements`           | list                                        | `[img]`                                                                  | Elements DR006 checks. A default import from `next/image` is always checked                                                                                       |

### `rules`

Each rule has `enabled` (boolean) and `severity` (`error`, `warning`, `info`). Some findings carry a
severity cap (for example unregistered CSS variables are at most `warning`); the reported severity is the
lower of the rule severity and the cap. See [rules.md](rules.md).

### `check.failOn`

The lowest severity that makes `designrail check` exit 1: `error` (default), `warning`, or `never`.
`--strict` sets the effective threshold to `warning` for that run. Human output prints the effective
policy; JSON reports include both `failOn` and `effectiveFailOn`. There is no other threshold setting.

### `exceptions`

Approved, documented exceptions. Each entry needs `rule` and a `reason` (at least three characters).
`files` (globs) and `values` narrow it; omitting both applies the exception to every finding of that rule,
so prefer narrow entries.

```yaml
exceptions:
  - rule: DR001
    files: ["src/marketing/legacy/**"]
    values: ["#ff6600"]
    reason: Legacy campaign page, scheduled for redesign
  - rule: DR004
    files: ["src/vendor-widgets/**"]
    values: ["button"]
    reason: Third-party widget requires native buttons
```

`values` are compared case-insensitively with the finding's subject: the color literal (CSS) or class (Tailwind) for DR001,
the raw value such as `13px` (or the class, for numeric utilities) for DR002, the family list or class for DR003, the element selector for DR004 (for
example `button` or `input[type=text]`), the property for DR005, the element for DR006/DR007, and the
import source for DR008.

### `responsive`

`approach` (`mobile-first`, `desktop-first`, `unspecified`) and free-text `guidance` lines are copied into
generated instructions and task briefs. DesignRail does not verify responsive behavior.

### `adapters`

List of `{ id, path? }` with ids `codex`, `claude-code`, `cursor`, `generic`. See [ai-tools.md](ai-tools.md).

### `commands`

`check` is the command AI tools are told to run (detected from your package manager and scripts at init).
`projectChecks` lists other project checks (detected from `lint`, `typecheck`, `type-check`, and `test`
scripts). DesignRail prints these in instructions; it never runs them.

### `reports`

`enabled` (default `true`) writes `latest.json` to `directory` (default `designrail/reports`) after each
check. `init` adds a `.gitignore` there so reports are not committed by default.
