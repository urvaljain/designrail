# Evaluation

This page describes what the checker detects, where it can be wrong, and how to reproduce the results.
It makes no claims about time savings, adoption, or benchmarks; none have been measured.

## How to reproduce

```sh
pnpm install
pnpm test       # unit + integration tests, including every rule's positive and negative cases
pnpm test:e2e   # builds, packs, installs into a temp project, runs the full loop via the installed CLI
```

- `tests/unit/rules/` holds the rule tests: each rule has detected cases, accepted cases, and false-positive
  fixtures (color strings in prose, URLs, data attributes, constants, and test files; unrelated identifiers
  sharing a component name; implementation files).
- `tests/integration/demo-fixtures.test.ts` copies each fixture in
  [`examples/react-tailwind-demo/fixtures`](../examples/react-tailwind-demo/fixtures) into a copy of the demo
  and compares the result with [`expected-findings.json`](../examples/react-tailwind-demo/fixtures/expected-findings.json),
  rule by rule and position by position. It also confirms the demo app itself has no findings.
- Manual reproduction: follow the [demo walkthrough](../examples/react-tailwind-demo/README.md).

## What the checker detects

| Rule  | Detects reliably                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| DR001 | Hex and CSS color-function literals in CSS, inline style objects, Tailwind arbitrary values and properties; Tailwind default palette keys; hard-coded fallbacks of unknown variables |
| DR002 | Raw lengths in margin/padding/gap (CSS, inline styles, arbitrary utilities); token-type mismatches in `var()`; raw lengths inside `calc()` under `tokens-only`                       |
| DR003 | Families outside font tokens and fallbacks in `font-family`, `font-[...]`, and inline styles                                                                                         |
| DR004 | Raw elements with an explicit `replaces` mapping, outside the component's implementation files                                                                                       |
| DR005 | Inline style entries that are not token references, per policy                                                                                                                       |
| DR006 | `img` (and `next/image`) without `alt`, or with `alt={undefined}`                                                                                                                    |
| DR007 | Form controls with no accessible-name evidence in the same file                                                                                                                      |
| DR008 | Restricted imports, imports bypassing the registered specifier, imports of internal implementation files                                                                             |

## Known false-positive risks

- **DR001 default palette:** `bg-white` or `text-black` are reported when the palette policy is `flag`, even
  if a team considers them acceptable. Set `policies.tailwind.defaultPalette: allow` or register tokens.
- **DR001/DR002/DR003 unregistered variables:** variables from third-party libraries are reported as
  medium-confidence warnings when used in color, spacing, or font positions (variables defined in the same
  file and `--tw-*` are ignored).
- **DR001 custom property definitions** outside `tokens.definitionFiles` (for example component-scoped
  `--card-bg: #fff`) are reported. Add the file to `definitionFiles` or reference a token.
- **DR002 literals equal to tokens** are reported under the default `rawValues: forbid`. This is intentional
  but can surprise teams that expect value matching.
- **DR003** reports a literal font list that repeats a token's families, by policy.
- **DR004** reports raw elements in wrappers that legitimately need them (for example a third-party
  integration). Use `implementationFiles`, an exception, or a suppression with a reason.
- **DR007** cannot see labels rendered by a parent component. Mitigations: controls returned directly by a
  component and static IDs without a local label are capped at warning; dynamic IDs and spread props are
  coverage notes.
- **DR008** warns about relative imports of a component's module when a different specifier is registered,
  which some codebases use deliberately inside a feature folder.
- **Tailwind prefixes:** a configured class `prefix` is not applied, so prefixed classes are not recognized
  (false negatives rather than false positives).

## Known false-negative areas

- Classes and styles computed at runtime: identifiers (`className={styles.root}`), member access, arbitrary
  function calls, template expressions. These are listed as "not analyzed".
- Styles in CSS-in-JS, SCSS, Less, CSS Modules composition, Vue/Svelte/Astro/MDX files.
- Named CSS colors (`red`, `rebeccapurple`) are not reported.
- Font sizes, weights, line heights, radii, shadows, and z-index are not checked against tokens.
- Tailwind numeric spacing (`p-4`) with the default `numericSpacing: unknown`, and unregistered named keys.
- Theme variants: only base token values are imported.
- Behavior inside registered components (DesignRail trusts that `Input` renders a label).
- Labels that exist in another file, `aria-labelledby` pointing to a missing ID, and inaccessible label text.
- Accessibility beyond alt attributes and local labels: focus, keyboard, contrast, ARIA validity, headings.
- Visual fidelity and responsive layout.

## Unsupported syntax

| Area                                                               | Behavior                                                    |
| ------------------------------------------------------------------ | ----------------------------------------------------------- |
| File types other than `.tsx .jsx .ts .js .mjs .cjs .mts .cts .css` | Skipped (listed by `doctor`, and in `skipped` when matched) |
| Syntax errors                                                      | Parse failure with location; run is `incomplete` (exit 2)   |
| Dynamic class and style expressions                                | Coverage note; file marked partially analyzed               |
| `font` shorthand                                                   | Coverage note                                               |
| Tailwind config functions, plugins, presets, spreads               | Reported during import, not evaluated                       |
| CSS theme variants and media-scoped variables                      | Reported during import as skipped                           |
| DTCG composite types (typography, border, transition, gradient)    | Skipped during import                                       |

## Coverage reporting

Each report lists files as `complete`, `partial`, or `parse-error`, and counts unanalyzed patterns. A
passing check with partial files says so in its result line. Treat "no findings" as "no findings in the
patterns DesignRail could inspect".
