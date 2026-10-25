<!-- DESIGNRAIL:START -->
<!-- designrail:content-hash ea5d2e6830bc2181 -->
<!-- Managed by DesignRail. Edit the inputs in designrail/ and run `designrail sync`; changes inside this section are replaced. -->

## DesignRail: design-system context

These instructions come from the DesignRail files in `designrail/`. They guide AI coding tools but do not guarantee compliance, and other instructions you receive may take precedence. `pnpm run design:check` statically checks a subset of these rules; passing it does not prove visual fidelity or accessibility.

Project: designrail-react-tailwind-demo (React, styled with Tailwind CSS v4 + CSS).

### Sources of truth

- Tokens: `designrail/tokens.json` (18 registered)
- Components: `designrail/components.json` (3 registered)
- Design rules: `designrail/design-rules.md` (project-defined)
- Accessibility rules: `designrail/accessibility-rules.md` (project-defined)
- Product context: `designrail/product-context.md` (project-defined)
- Checker configuration and approved exceptions: `designrail/config.yaml`

### Before implementing

1. Read the repository's existing instructions and the files listed above that are relevant to the task.
2. Inspect the registered components and tokens you may need.
3. Confirm the requested behavior from code and documentation in the repository.
4. List requirements that are missing or ambiguous instead of inventing them; ask when they block the work.

### Token policy (project-defined tokens)

- Style with the registered tokens: CSS variables such as `var(--name)` or the Tailwind keys listed for each token.
- Raw colors, spacing values, and font families are not allowed, even when they equal a token's value. Reference the token instead.
- Do not use Tailwind's default palette (for example `bg-blue-500`); use the semantic color tokens.
- Avoid arbitrary values such as `p-[13px]` or `bg-[#123456]`.
- Use the token-backed spacing keys, not Tailwind's numeric spacing scale.
- If a needed token does not exist, do not invent one: use the closest registered token and explain the gap in your summary.

| Token | Type | Value | Use as |
| --- | --- | --- | --- |
| breakpoint.md | breakpoint | 48rem | `var(--breakpoint-md)`, `md:` |
| color.border | color | #e2e8f0 | `var(--color-border)`, `bg-border`, `text-border`, `border-border` |
| color.brand | color | #2563eb | `var(--color-brand)`, `bg-brand`, `text-brand`, `border-brand` |
| color.brand-hover | color | #1d4ed8 | `var(--color-brand-hover)`, `bg-brand-hover`, `text-brand-hover`, `border-brand-hover` |
| color.danger | color | #dc2626 | `var(--color-danger)`, `bg-danger`, `text-danger`, `border-danger` |
| color.on-brand | color | #ffffff | `var(--color-on-brand)`, `bg-on-brand`, `text-on-brand`, `border-on-brand` |
| color.success | color | #15803d | `var(--color-success)`, `bg-success`, `text-success`, `border-success` |
| color.surface | color | #ffffff | `var(--color-surface)`, `bg-surface`, `text-surface`, `border-surface` |
| color.surface-muted | color | #f8fafc | `var(--color-surface-muted)`, `bg-surface-muted`, `text-surface-muted`, `border-surface-muted` |
| color.text | color | #0f172a | `var(--color-text)`, `bg-text`, `text-text`, `border-text` |
| color.text-muted | color | #475569 | `var(--color-text-muted)`, `bg-text-muted`, `text-text-muted`, `border-text-muted` |
| font-family.sans | fontFamily | Inter, ui-sans-serif, system-ui, sans-serif | `var(--font-sans)`, `font-sans` |
| radius.md | radius | 0.5rem | `var(--radius-md)`, `rounded-md` |
| spacing.lg | spacing | 1.5rem | `var(--spacing-lg)`, `p-lg`, `m-lg`, `gap-lg` |
| spacing.md | spacing | 1rem | `var(--spacing-md)`, `p-md`, `m-md`, `gap-md` |
| spacing.sm | spacing | 0.5rem | `var(--spacing-sm)`, `p-sm`, `m-sm`, `gap-sm` |
| spacing.xl | spacing | 2rem | `var(--spacing-xl)`, `p-xl`, `m-xl`, `gap-xl` |
| spacing.xs | spacing | 0.25rem | `var(--spacing-xs)`, `p-xs`, `m-xs`, `gap-xs` |

### Components (project-registered)

- Use a registered component instead of the raw element it replaces when it fits the need.
- Import from the listed specifier. Do not invent props or variants; only the variants listed here are documented.
- If no registered component fits, explain why before writing a new one or using a raw element.

| Component | Import | Replaces | Variants | Notes |
| --- | --- | --- | --- | --- |
| Button | `import { Button } from "@/components/ui/button"` | `<button>` | primary, secondary | Action button. Use variant="secondary" for non-primary actions. |
| Card | `import { Card } from "@/components/ui/card"` | - | - | Titled content section. Wrap related settings; pass title and optional description. |
| Input | `import { Input } from "@/components/ui/input"` | `<input[type=text]>`, `<input[type=email]>`, `<input[type=password]>`, `<input[type=search]>` | - | Labeled text input. Always pass id and label; use hint for help text. |

### During implementation

1. Reuse registered components when suitable, and use token references for colors, spacing, and fonts.
2. Preserve existing behavior, keyboard interaction, and semantic HTML.
3. Keep changes within the task; avoid unrelated refactors.
4. If a needed token or component is missing, explain it instead of silently creating one.
5. Consider loading, empty, error, disabled, and success states where they apply.

### Responsive layout

- Approach: mobile-first.
- Single column below the md breakpoint (48rem); settings cards keep full width.
- Action rows stay right-aligned and wrap on narrow screens.
- Breakpoints: breakpoint.md = 48rem.
- Responsive behavior is not verified by DesignRail; check layouts manually at the relevant widths.

### Accessibility

- Checked statically: every `<img>` has an `alt` attribute (`alt=""` only for decorative images); form controls have a label (wrapping `<label>`, `htmlFor`/`id`, `aria-label`, or `aria-labelledby`).
- Verify manually: keyboard operation, visible focus, focus management in dialogs and menus, color contrast, and screen-reader announcements.

### After implementing

1. Run the project's checks: `pnpm run build`.
2. Run `pnpm run design:check` and fix the violations it reports in files you changed.
3. Report what DesignRail cannot verify (dynamic classes, responsive layout, focus, visual fidelity) as manual checks.
4. Summarize changed files, remaining assumptions, and any unresolved findings with the reason.

### Exceptions

- Approved exceptions live under `exceptions` in `designrail/config.yaml`, each with a reason. Propose new exceptions; do not add them unless asked.
- A single line can be suppressed with `// designrail-ignore-next-line DR001 -- <reason>` (or `{/* ... */}` in JSX, `/* ... */` in CSS). Use it only when the finding is wrong or explicitly accepted, and mention it in your summary.
<!-- DESIGNRAIL:END -->
