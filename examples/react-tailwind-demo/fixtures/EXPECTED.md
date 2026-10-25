# Expected findings

These files are intentionally outside `src/`, so `designrail check` on the demo stays clean. To try one,
copy it into `src/` (for example `src/fixtures/`) and run `designrail check <path>`. The machine-readable
version is [`expected-findings.json`](expected-findings.json), verified by
`tests/integration/demo-fixtures.test.ts` in the repository.

Positions are `line:column` in the fixture file.

| Fixture | Covers | Expected |
| --- | --- | --- |
| `rules/colors.tsx` | Raw color versus token reference | DR001 at 7:21 (`bg-[#1d4ed8]`, suggests `bg-brand-hover`), 8:21 (`text-slate-700`), 9:19 (`rgb(...)` inline). Token utilities, token variables, and the `href="#ffffff"` fragment pass |
| `rules/spacing.tsx` | Valid versus invalid spacing | DR002 at 6:23 (`p-[13px]`), 7:23 (`mt-4`, flagged by the demo's `numericSpacing: flag`), 8:21 (`padding: 16`, equals `spacing.md`). Named tokens, `auto`, `0`, and `-mb-sm` pass |
| `rules/raw-button.tsx` | Raw button versus registered Button | DR004 at 8:7 |
| `src/components/ui/button.tsx` (in the app) | Button implementation exemption | No finding for its internal `<button>` |
| `rules/images.tsx` | Missing alt versus decorative alt | DR006 at 5:7 only; `alt=""` and `alt={caption}` pass |
| `rules/labels.tsx` | Proper labels versus missing accessible names | DR007 at 12:7 (`aria-describedby` only) and 13:7 (`placeholder` only); `Input`, the wrapped checkbox, and `aria-label` pass |
| `rules/dynamic-classes.tsx` | Dynamic classes | Pass, with 3 "not analyzed" notes (`text-` fragment, `tone`, `styles.panel`); static `p-md` and `bg-brand` are checked |
| `rules/malformed.tsx` | Malformed source | Parse failure at 4:1; result `incomplete`, exit code 2 |
| `rules/import-aliases.tsx` | Component import aliases | `Button as PrimaryButton` from the registered specifier passes; DR008 warning at 3:1 for `../components/ui/card` |
| `rules/token-cycle.json` | Token aliases and cycles | `designrail import-tokens fixtures/rules/token-cycle.json` exits 2 with `Alias cycle: color.loop-a -> color.loop-b -> color.loop-a` and leaves `tokens.json` unchanged. `color.action` (`{color.brand}`) is a valid alias |
| `ai-output/BillingPanel.tsx` | Simulated AI output (copy to `src/features/billing/`) | 18 errors and 1 warning across DR001-DR004, DR006-DR008 |
| `corrected/BillingPanel.tsx` | The repaired version | Pass |
