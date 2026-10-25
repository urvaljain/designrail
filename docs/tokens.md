# Tokens

`designrail/tokens.json` is the project's token registry. Each token keeps the **design value** separate
from the **code references** that use it.

```json
{
  "schemaVersion": 1,
  "tokens": {
    "color.brand": {
      "type": "color",
      "value": "#2563eb",
      "description": "Primary actions and links",
      "references": { "cssVariables": ["--color-brand"], "tailwindKeys": ["brand"] }
    },
    "color.action": { "type": "color", "value": "{color.brand}" },
    "spacing.md": {
      "type": "spacing",
      "value": "1rem",
      "references": { "cssVariables": ["--spacing-md"], "tailwindKeys": ["md"] }
    },
    "font-family.sans": {
      "type": "fontFamily",
      "value": ["Inter", "sans-serif"],
      "references": { "cssVariables": ["--font-sans"], "tailwindKeys": ["sans"] }
    }
  }
}
```

| Field                     | Meaning                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| key                       | Semantic name (`color.brand`). Letters, digits, `.`, `_`, `/`, `-`                                                                          |
| `type`                    | `color`, `spacing`, `fontFamily`, `fontSize`, `fontWeight`, `lineHeight`, `radius`, `shadow`, `breakpoint`                                  |
| `value`                   | Literal with its unit (`"16px"`, `"1rem"`), a family list, a number (weights, line heights), or an alias `"{other.token}"`                  |
| `references.cssVariables` | Variables code may use: `var(--color-brand)`                                                                                                |
| `references.tailwindKeys` | Theme keys: `brand` means `bg-brand`, `text-brand`, `border-brand`, and other color utilities; `md` for spacing means `p-md`, `gap-md`, ... |
| `unresolved`              | Set when the value cannot be resolved statically (for example `calc()`); references remain usable                                           |
| `description`, `source`   | Informational                                                                                                                               |

A token with no references can be documented but cannot be checked in code, and `doctor` warns about it.

## Policy

By default, code must reference tokens. A raw literal is a finding even when it equals a token's value
(the suggestion names the matching token). Set `policies.rawValues: allow-matching-tokens` to accept
exact matches. `px` and `rem` are never treated as equal unless `policies.remBasePx` is set.

## Aliases and problems

Aliases use `"{name}"`. The registry resolves alias chains and reports:

- **alias cycles** (`color.a -> color.b -> color.a`) and **missing targets**: configuration errors. `check`
  refuses to run (exit 2) and `doctor` lists them.
- **type mismatches** (a spacing token aliasing a color) and **duplicate references** (two tokens claiming
  the same CSS variable or Tailwind key): warnings in `doctor`.

## Importing

```sh
designrail import-tokens <file> [--format <format>] [--replace] [--dry-run] [--assume-type <type>] [--json]
```

The format is detected from the file (`.css` with `@theme` is `tailwind-v4`, other `.css` is `css`,
`.js/.ts/.mjs/.cjs` is `tailwind-v3`, `.json` with `schemaVersion` and `tokens` is `native`, other `.json`
is `dtcg`). The output lists added, changed (references merged), conflicting, and skipped entries, and
notes about unsupported patterns.

**Safe merge.** New names are added. Same type and value: references are merged. Different type or value:
a conflict. Existing values are kept unless you pass `--replace`, or confirm the replacement when running
interactively. Nothing is written when the source cannot be parsed or when the result would contain
missing aliases, cycles, or duplicate references. `--dry-run` shows the result without writing.

After importing a CSS source, DesignRail adds the file to `tokens.definitionFiles` so its raw values are not
reported by the checker.

### CSS custom properties (`css`)

- Reads custom properties declared in `:root`, `html`, or `:host` rules, including inside `@layer`.
- Skips, with a reason: declarations inside `@media`, `@supports`, and other at-rules, and declarations in
  other selectors such as `.dark` or `[data-theme=dark]`. Only base values are imported; theme variants are
  not modeled in this release.
- Units are preserved exactly. `var(--x)` values become aliases when another token owns `--x`; otherwise
  they are kept with `unresolved`. `calc()`, `clamp()`, `min()`, and `max()` are kept with `unresolved`.
- Types are inferred only when unambiguous:
  - from a name prefix: `--color-`, `--space-`/`--spacing-`, `--radius`/`--rounded-`, `--font-size-`,
    `--font-weight-`, `--line-height-`/`--leading-`, `--font-`/`--font-family-`, `--shadow-`, `--breakpoint-`/`--screen-`,
    when the value fits that type;
  - otherwise from a value that is clearly a color (`#hex`, `rgb()`, `hsl()`, `oklch()`, ...).
- Anything else is skipped as ambiguous: for example `--gutter: 24px` (spacing? radius? size?) or bare HSL
  channels such as `--background: 0 0% 100%`. Pass `--assume-type <type>` to apply a type to ambiguous
  entries whose values fit it.

### Tailwind CSS v4 (`tailwind-v4`)

Reads `@theme`, `@theme inline`, and `@theme static` blocks using the namespaces of Tailwind's default
theme (checked against `tailwindcss@4.3`):

| Variable          | Token type                                       | Example utility                    |
| ----------------- | ------------------------------------------------ | ---------------------------------- |
| `--color-*`       | color                                            | `bg-brand`                         |
| `--spacing-*`     | spacing                                          | `p-md`                             |
| `--spacing`       | spacing (`spacing.base`, the numeric multiplier) | `p-4` = `calc(var(--spacing) * 4)` |
| `--font-*`        | fontFamily                                       | `font-sans`                        |
| `--font-weight-*` | fontWeight                                       | `font-bold`                        |
| `--text-*`        | fontSize                                         | `text-sm`                          |
| `--leading-*`     | lineHeight                                       | `leading-tight`                    |
| `--radius-*`      | radius                                           | `rounded-md`                       |
| `--shadow-*`      | shadow                                           | `shadow-card`                      |
| `--breakpoint-*`  | breakpoint                                       | `md:`                              |

- Variables in a regular `@theme` block are also CSS variables, so both `var(--color-brand)` and `bg-brand`
  are recorded. `@theme inline` variables are not emitted as CSS variables, so only the Tailwind key is recorded.
- `@theme inline { --color-primary: var(--primary); }` attaches the key `primary` to the token that owns
  `--primary` (the common shadcn/ui pattern). If no token owns `--primary`, `color.primary` is registered
  with the key and an unresolved value.
- Reported, not imported: namespace resets (`--color-*: initial`), sub-properties (`--text-sm--line-height`),
  and other namespaces (`--ease-*`, `--animate-*`, `--container-*`, `--tracking-*`, ...).
- Importing `--spacing` does not approve Tailwind's numeric scale. Set
  `policies.tailwind.numericSpacing: allow` if `p-4`-style utilities are part of your design system.

### Tailwind CSS v3 config (`tailwind-v3`)

The config file is parsed, never imported, required, or evaluated. Supported:

- `module.exports = { ... }`, `export default { ... }`, `export default config` with a local
  `const config = { ... }` (including `satisfies Config` / `as Config`), and a wrapper call such as
  `withX({ ... })` (only the literal argument is read, and the wrapper is reported).
- Keys under `theme` and `theme.extend`: `colors` (nested objects and `DEFAULT`), `spacing`, `fontFamily`
  (strings or arrays), `fontSize` (string or the size from a tuple), `fontWeight`, `lineHeight`,
  `borderRadius`, `boxShadow`, `screens` (string values).
- `"hsl(var(--primary))"`, `"rgb(var(--x) / <alpha-value>)"`, and `"var(--x)"` attach the Tailwind key to
  the token that owns the variable (import your CSS variables first). If no token owns it, for example
  because the variable holds bare HSL channels, the key is registered as its own token
  (`color.primary`, value `hsl(var(--primary))`, marked unresolved) so `bg-primary` remains checkable.

Reported, not imported: functions (`colors: ({ theme }) => ...`), `theme()` calls, references such as
`colors.blue`, spreads (`...defaultTheme.fontFamily.sans` is noted and the literal entries are kept),
computed keys, `screens` objects (`{ min: ... }`), other theme keys, `plugins`, `presets`, and `prefix`.
DesignRail does not claim complete Tailwind configuration support.

### DTCG-style JSON (`dtcg`, documented subset)

A subset of the Design Tokens Community Group format:

- Nested groups; tokens are objects with `$value`. `$type` may be set on a token or inherited from a group.
  `$description` is kept. Aliases `"{group.token}"` are kept as aliases.
- Supported `$type` values: `color` (string, or an object with `hex`), `fontFamily` (string or array),
  `fontWeight`, `shadow` (string, or an object with `offsetX`, `offsetY`, `blur`, `spread`, `color`),
  `dimension` and `number`.
- `dimension` tokens need a group name that states their role: `spacing`/`space`/`gap`, `radius`/`radii`,
  `font-size`/`fontSize`, `breakpoint`/`screen`, `line-height`/`lineHeight`. `number` is supported only for
  line heights. Other dimensions are skipped as ambiguous unless `--assume-type` is given. Object
  dimensions (`{ "value": 16, "unit": "px" }`) are supported.
- Other types (duration, cubicBezier, typography, border, gradient, transition, ...) are skipped with a reason.
- Token names are the dot-joined path (`color.brand`). CSS variables are derived from the path
  (`--color-brand`), the common Style Dictionary convention; pass `--no-derive-css-variables` to skip that.

### Native (`native`)

A DesignRail `tokens.json` from another project, validated against the schema and merged with the same
rules as other imports.

## Unconfigured state

`init` creates `tokens.json` with an empty registry and a `$comment` saying it is unconfigured. DesignRail
never writes example colors into your registry. Generated instructions say that no tokens are registered,
and checks that compare against tokens only report clearly raw values.
