# Rules

Each finding has a stable rule ID, a severity (`error`, `warning`, `info`), a confidence (`high` or
`medium`), the project-relative file, 1-based line and column, a message, the evidence (the exact class or
declaration), a suggested correction, and, where relevant, the token or component involved.

Severities come from `rules.<ID>.severity` in the configuration. Some lower-confidence cases are capped at
`warning` (noted below); the reported severity is the lower of the two.

Only supported patterns are analyzed (see [What is analyzed](#what-is-analyzed)). Patterns DesignRail cannot
evaluate are reported under `unsupported` and mark the file as partially analyzed. They are never reported as
violations and never counted as validated.

## DR001: hard-coded colors (default: error)

Reports literal colors in:

- CSS declarations, including shorthands (`border: 1px solid #ccc`) and custom property definitions
  outside token definition files;
- JSX `style` objects;
- Tailwind arbitrary values (`bg-[#ff0000]`, `shadow-[0_0_0_1px_#000]`) and arbitrary properties
  (`[color:#fff]`), including in `@apply`.

Recognized literals: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`) and color functions (`rgb`, `rgba`,
`hsl`, `hsla`, `hwb`, `lab`, `lch`, `oklab`, `oklch`, `color`) whose arguments contain no `var()`.
Named colors (`red`) are not reported.

Also reports:

- Tailwind default palette utilities (`bg-blue-500`, `text-white`) when `policies.tailwind.defaultPalette`
  is `flag` (default) and the key is not a registered token key;
- hard-coded fallbacks of unregistered variables (`var(--unknown, #000)`);
- `var(--x)` in single-color properties (`color`, `background-color`, `border-color`, `fill`, ...) or
  color-only utilities (`bg-(--x)`) when `--x` is not a registered color token, the project registers
  CSS-variable tokens, and the variable is not defined in the same file or Tailwind-internal (`--tw-*`).
  Capped at warning, medium confidence.

Not reported: color strings outside styling positions (prose, URLs, `href="#top"`, data attributes,
constants, test data), values in `tokens.definitionFiles`, `currentColor`/`transparent`, and
`hsl(var(--token))`-style wrappers. When a literal equals a token value, the suggestion names that token,
but the literal is still reported unless `policies.rawValues: allow-matching-tokens`.

## DR002: unapproved spacing (default: error)

Checks `margin*`, `padding*`, `gap`, `row-gap`, `column-gap` (including logical properties) in CSS and
inline styles, and Tailwind `p*`, `m*`, `gap*`, `space-x/y` utilities. Each component of a shorthand is
checked separately and units are preserved.

| Value                                            | Treatment                                                                  |
| ------------------------------------------------ | -------------------------------------------------------------------------- |
| `var(--spacing-md)` of a spacing token           | accepted                                                                   |
| `var(--x)` of another token type                 | reported (warning)                                                         |
| unregistered `var(--x)`                          | reported as medium-confidence warning, unless defined in the same file     |
| `0` / `0px`                                      | `policies.spacing.zero` (default allow)                                    |
| `auto` (margin)                                  | `policies.spacing.auto` (default allow)                                    |
| `5%`                                             | `policies.spacing.percentages` (default allow)                             |
| `calc()`, `min()`, `max()`, `clamp()`            | `policies.spacing.calc` (default `tokens-only`)                            |
| `inherit`, `initial`, `unset`, `revert`, `env()` | accepted                                                                   |
| raw length (`13px`, `1.5rem`, `-8px`)            | reported; suggestion names an equal token or the nearest comparable tokens |
| JSX number (`padding: 16`)                       | treated as `16px` (React semantics)                                        |

`px` and `rem` are compared only when `policies.remBasePx` is set.

Tailwind keys: a key registered for a spacing token (`p-md`, `-mt-md`) is accepted. Numeric keys (`p-4`,
`gap-2.5`, `m-px`) are **not** interpreted as pixels: with `policies.tailwind.numericSpacing: unknown`
(default) they are coverage notes; `allow` accepts them; `flag` reports them. Unregistered named keys
(`p-huge`) are coverage notes. Arbitrary values (`p-[13px]`, `px-[var(--x)]`) and v4 variable shorthand
(`p-(--x)`) are checked like CSS values.

## DR003: unapproved font family (default: error)

Checks `font-family` in CSS and inline styles, `font-[...]` arbitrary values, `[font-family:...]`, and
`font-*` keys.

- Family lists are split on top-level commas and compared exactly after removing quotes, collapsing
  whitespace, and case-folding. `Inter` and `Inter Tight` are different families.
- Accepted: `var()` of a font-family token, families in `policies.fontFallbacks` (generic families and
  `system-ui` by default), and CSS-wide keywords.
- Reported: any family not in a font-family token. A literal list made only of approved families is
  reported under `rawValues: forbid` with a suggestion to use the token.
- Tailwind: registered family or weight keys and the standard weight keys (`font-bold`, ...) are accepted.
  `font-sans`/`font-serif`/`font-mono` that are not registered are reported as medium-confidence warnings
  when the project has font tokens. Numeric arbitrary values (`font-[600]`) are treated as weights.
- The `font` shorthand is not parsed; it is recorded as a coverage note.

## DR004: raw element instead of registered component (default: error)

Reports an intrinsic JSX element when a registered component lists it in `replaces`. Only explicit
mappings are checked. The component's `sourceFile` and `implementationFiles` are exempt, so `button.tsx`
is never told to use `Button`. Selectors may have one attribute qualifier: `input[type=email]`. An
`<input>` without `type` matches `input[type=text]`. If the qualifying attribute is dynamic or may come
from spread props, the element is recorded as a coverage note.

## DR005: inline style policy (default: warning)

Governed by `policies.inlineStyles`:

- `forbid`: every `style` attribute is reported.
- `allow-token-references` (default): `style` object entries must be built from registered token
  variables (optionally inside `calc()`), unitless numbers combined with tokens, `0`, or CSS-wide
  keywords. Entries already reported by DR001-DR003 are not reported again. Dynamic values
  (`style={{ width: w }}`) and non-literal styles (`style={styles}`) are coverage notes.
- `allow`: off.

## DR006: image alt attribute (default: error)

Checks elements in `policies.imageElements` (`img` by default) and any default import from `next/image`.

- Missing `alt`: reported.
- `alt=""`: accepted (decorative image).
- `alt={expression}`: accepted; the text is not judged.
- `alt={undefined}` or `alt={null}`: reported (renders no attribute).
- `alt` without a value: reported (medium confidence).
- Spread props without `alt`: coverage note.

DesignRail does not assess whether alternative text is appropriate.

## DR007: form control labeling (default: error)

Checks `input` (except `hidden`, `submit`, `reset`, `button`, `image`), `select`, and `textarea`. A control
passes with local evidence of an accessible name:

- a wrapping `<label>` (or a registered component that replaces `label`);
- `id` matching a `htmlFor` in the same file (static strings, or identical expressions such as `{id}`);
- non-empty `aria-label`, `aria-labelledby`, or `title`.

`aria-describedby` and `placeholder` are not names; messages say so when they are the only evidence.

| Situation                                                                                          | Result                     |
| -------------------------------------------------------------------------------------------------- | -------------------------- |
| No evidence                                                                                        | error, high confidence     |
| No evidence, control is the root element returned by a component (a parent may wrap it in a label) | warning, medium confidence |
| Static `id` with no matching label in the file                                                     | warning, medium confidence |
| Dynamic `id` with no matching label in the file                                                    | coverage note              |
| Spread props                                                                                       | coverage note              |

Labels in other files, `aria-labelledby` targets that do not exist, and the content of labels are not
verified.

## DR008: registered component import policy (default: error)

For each registered component, outside its implementation files:

- **Restricted import:** importing `importPolicy.restricted[].importName` (`default`, `*`, or a name) from
  `from`. Aliased named imports are matched by imported name. Error.
- **Non-recommended specifier:** an import that resolves (relative path or configured alias) to the
  component's source module through a specifier other than `importSpecifier` or `alternateSpecifiers`.
  Warning.
- **Internal file:** an import that resolves to an `implementationFiles` entry other than the source file.
  Error.

Package imports that cannot be resolved to a project file are only checked against restrictions, and a
local identifier that shares a component's name is never flagged by name alone.

## DR000: invalid suppression (warning)

A `designrail-ignore-next-line` comment without rule IDs, with unknown IDs, or without a reason is reported
as DR000, and the finding it targeted is still reported.

## Suppressions

Suppress specific findings on the next line, with a reason:

```tsx
{
  /* designrail-ignore-next-line DR004 -- third-party widget needs a native button */
}
<button onClick={open}>Open</button>;
```

```ts
// designrail-ignore-next-line DR001, DR002 -- print stylesheet uses physical values
```

```css
/* designrail-ignore-next-line DR001 -- brand partner color supplied by contract */
.partner {
  color: #ff6600;
}
```

- The comment applies to findings on the line after the comment ends.
- Rule IDs are required. There is no file-wide or all-rules form.
- A reason after `--` is required (at least three characters).
- Comments between JSX attributes (`/* ... */`) work for findings on a specific attribute line.
- Unused suppressions are listed in the report.

For broader, reviewed exceptions use `exceptions` in the configuration (see
[configuration.md](configuration.md#exceptions)).

## What is analyzed

- `className`, `class`, and `*ClassName` attributes: string literals, static parts of template literals and
  `+` concatenations (fragments touching an expression, such as `mt-${size}`, are coverage notes), both
  branches of `?:`, the right side of `&&`, both sides of `||` and `??`, arrays.
- Calls to `source.classFunctions` (`cn`, `clsx`, ...) anywhere in a file: string and array arguments,
  object keys (`{ "bg-brand": active }`), and for `cva`/`tv` the base, `variants` values (including slot
  objects), `slots`, and `compoundVariants` `class`/`className`. `defaultVariants` is ignored.
- JSX `style={{ ... }}` object literals with literal values.
- CSS declarations and `@apply` in `.css` files.

Not analyzed: identifiers and member expressions (`className={styles.root}`), other function calls,
runtime-generated classes, CSS-in-JS, the CSS cascade, Tailwind plugins, and behavior of rendered
components. Focus visibility, keyboard behavior, and responsive layout are not checked; they belong to
manual QA (see [roadmap.md](roadmap.md)).
