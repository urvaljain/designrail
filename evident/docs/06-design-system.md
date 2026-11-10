# 6. Design system

Evident's interface is original: it shares no palette, type or layout with the reference product, which is dark, blue-accented and set in Geist.

## Idea

The product's promise is that claims come with evidence, so the visual language is a marked-up document: paper-toned surfaces, ink text, a serif for headings, and one device used nowhere else, **highlighter yellow behind quoted evidence**. If something is highlighted, it is a verbatim quote from a listing, a resume or an answer.

## Tokens

Defined once in `src/app/globals.css` under `@theme` and remapped under `prefers-color-scheme: dark`. Components use token names only (`bg-surface`, `text-muted`), never raw colours.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `paper` | `#faf8f3` | `#111412` | Page background |
| `surface` | `#ffffff` | `#191d1a` | Cards, inputs |
| `sunken` | `#f1eee6` | `#0c0e0d` | Wells, hover, meters |
| `ink` | `#1a1d1a` | `#eceee9` | Body text |
| `muted` | `#555d56` | `#a8b0a8` | Secondary text |
| `line` / `line-strong` | `#ddd8cb` / `#8a8f86` | `#2d332e` / `#737b73` | Dividers / control borders |
| `accent` / `accent-fg` | `#0f5c4a` / `#ffffff` | `#7ad6ba` / `#06261d` | Primary actions |
| `accent-soft` / `accent-ink` | `#e0efe9` / `#0b4a3b` | `#15302a` / `#9fe5cf` | Active navigation, links |
| `mark` / `mark-ink` | `#fff0b3` / `#2b2500` | `#4b4210` / `#fdf3c4` | Quoted evidence only |
| `good`, `warn`, `bad`, `info` (+ `-soft`) | see CSS | see CSS | Status badges and notices |

### Contrast

Computed with the WCAG relative-luminance formula from the hex values above.

| Pair | Light | Dark | Requirement |
| --- | --- | --- | --- |
| ink on paper / surface / sunken | 16.03 / 17.01 / 14.67 | 15.87 / 14.59 / 16.58 | 4.5 |
| muted on paper / surface / sunken | 6.41 / 6.80 / 5.87 | 8.34 / 7.66 / 8.71 | 4.5 |
| accent-fg on accent | 7.92 | 9.33 | 4.5 |
| accent-ink on accent-soft / paper / surface | 8.60 / 9.62 / 10.21 | 9.80 / 12.88 / 11.84 | 4.5 |
| mark-ink on mark | 13.43 | 9.01 | 4.5 |
| good, warn, bad, info on their soft backgrounds | 7.07 / 6.85 / 6.66 / 7.42 | 8.60 / 8.36 / 7.73 / 8.08 | 4.5 |
| line-strong on surface / paper (control borders) | 3.31 / 3.11 | 3.90 / 4.25 | 3.0 |

`line` is decorative (card edges, dividers) and is not relied on to identify a control.

## Type

| Role | Stack | Use |
| --- | --- | --- |
| Display | Iowan Old Style, Palatino, Georgia, serif | `h1`, `h2`, large numerals |
| Text | system UI sans-serif | Everything else |
| Mono | system monospace | Line references, URLs, the agent log |

System fonts only: no font requests, no layout shift, and a strict content security policy. Headings use `text-wrap: balance`. Body size is 16 px; inputs are 16 px so iOS does not zoom on focus.

## Layout

- App shell: a 15 rem sidebar from 1024 px; below that, the navigation is a horizontally scrolling row under the wordmark.
- Content measure: page leads are capped at 42 rem; cards stack to one column on phones.
- Radii: 10 px cards, 8 px controls, full for badges.
- No shadows. Depth comes from the paper, surface and sunken tones and a 1 px line.

## Components

All in `src/components/ui.tsx`, in the shadcn/ui manner: plain components, variants as class maps, composition over configuration.

| Component | Variants | Notes |
| --- | --- | --- |
| `Button`, `ButtonLink` | primary, secondary, ghost, danger | 44 px minimum height. External links say "(opens in a new tab)" to screen readers |
| `SubmitButton` | as `Button` | Shows a pending label in a live region while its form submits |
| `Card`, `CardTitle` | | `CardTitle` takes `as` to keep heading order correct |
| `Badge` | neutral, accent, good, warn, bad, info | Always carries text; colour is never the only signal |
| `Notice` | same tones | `role="alert"` for errors, `role="status"` for confirmations |
| `Field`, `Input`, `Textarea`, `Select` | | Every control has a visible label; hints are linked with `aria-describedby` |
| `EvidenceQuote` | | `figure` with `blockquote` and `mark`, and a mono caption naming the source |
| `Meter` | accent, good, warn, bad | `role="meter"` with a label; the number is always printed beside it |
| `Stat`, `PageHeader`, `EmptyState`, `FlashMessages`, `DemoBadge` | | |

Feature components: `MatchView` (the requirement-by-requirement evidence view, shared by the job and application pages), `AppShell`, `NavLinks`, `AuthForm`.

## Content rules

- Say what was checked and when: "Listed by source 3h ago", not "Verified".
- State absence plainly: "Pay not disclosed", "No mention found on your resume".
- Name uncertainty: "Medium confidence: …", "Not enough data".
- Buttons are verbs describing the outcome: "Approve this message", "I have applied".
- Never use a number without its denominator: "6 of 6 must-have requirements".
- Synthetic data is always labelled "Demo data".

## Accessibility

- Skip link; one `h1` per page; landmarks (`header`, `nav` with labels, `main`).
- Visible 3 px focus ring on every interactive element.
- Forms work without client JavaScript: actions redirect with a message rendered server-side.
- Tap targets are at least 44 px high.
- Scrollable regions (job description, tables, logs) are keyboard-focusable and labelled.
- `prefers-reduced-motion` is honoured; the interface has no decorative motion.
- Light and dark themes follow the system setting.

**Verified:** the end-to-end suite runs axe-core (WCAG 2.0 and 2.1, levels A and AA) on 16 page states and asserts zero violations, and checks for horizontal overflow at 390 px on six pages.

**Not verified:** screen-reader testing with real assistive technology, keyboard-only walkthroughs by a person, zoom to 400%, high-contrast modes. Automated scans find only a portion of accessibility problems.

## DesignRail

This repository's other project, DesignRail, checks generated UI against a registered design system. Registering these tokens and components with it, so that later AI-assisted changes to Evident are checked against the system above, is a natural next step and has not been done.
