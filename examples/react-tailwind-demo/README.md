# DesignRail demo: React + TypeScript + Tailwind v4

A small account-settings screen built with Vite, React 19, and Tailwind CSS v4. Its purpose is to show
the DesignRail workflow end to end, not to be a design reference.

- Tokens: semantic colors, a named spacing scale (`xs` to `xl`), a font family, a radius, and a breakpoint,
  defined in [`src/index.css`](src/index.css) with `@theme`.
- Registered components: `Button`, `Card`, and `Input` in [`src/components/ui/`](src/components/ui).
- Demo policy choices (in [`designrail/config.yaml`](designrail/config.yaml)): numeric Tailwind spacing is
  flagged (`numericSpacing: flag`), and `remBasePx: 16` lets suggestions compare px with rem.
- [`fixtures/`](fixtures) holds intentionally invalid code. It is outside `src/`, so the normal check of the
  app stays clean. Expected results: [`fixtures/EXPECTED.md`](fixtures/EXPECTED.md).

Everything in `designrail/`, `AGENTS.md`, `CLAUDE.md`, `.cursor/rules/designrail.mdc`, and
`DESIGNRAIL_CONTEXT.md` was produced by the commands below.

## Setup

From the repository root, build DesignRail, then install the demo. The demo links the local build
(`"designrail": "link:../.."`):

```sh
pnpm install && pnpm build
cd examples/react-tailwind-demo
pnpm install --ignore-workspace
pnpm dev            # optional: run the app
```

## How the DesignRail files were created

```sh
designrail init --yes --adapters codex,claude-code,cursor,generic
designrail import-tokens src/index.css
designrail add-component Button src/components/ui/button.tsx --replaces button \
  --description "Action button." --usage 'Use variant="secondary" for non-primary actions.' --variants primary,secondary
designrail add-component Card src/components/ui/card.tsx \
  --description "Titled content section." --usage "Wrap related settings; pass title and optional description."
designrail add-component Input src/components/ui/input.tsx \
  --replaces "input[type=text],input[type=email],input[type=password],input[type=search]" \
  --description "Labeled text input." --usage "Always pass id and label; use hint for help text."
# edited designrail/config.yaml (policies, responsive guidance, commands) and the three Markdown files
designrail sync
```

Inside the demo, `pnpm exec designrail` runs the linked build (or use `node ../../dist/cli/bin.js`).

## Walkthrough: the repair loop

**1. The app is clean.**

```sh
pnpm exec designrail check
# PASS: No findings at or above the failure threshold (error). 1 file contained patterns DesignRail could not analyze
```

The "not analyzed" note is real: `Button` composes `variants[variant]` and a `className` prop at runtime,
and DesignRail says so instead of claiming it validated them. The raw `<button>` inside `button.tsx` is not
reported, because it is the registered component's implementation.

**2. Ask for a feature.**

```sh
pnpm exec designrail task "Add a billing panel to the settings page with the current plan, a coupon field, and an upgrade button"
```

This writes a brief to `designrail/tasks/` with open questions, keyword-matched component suggestions
(`Button`, `Input`), policies, acceptance criteria, and a copyable implementation prompt. It is a template,
not an analysis of your code.

**3. Simulate the AI's output.** [`fixtures/ai-output/BillingPanel.tsx`](fixtures/ai-output/BillingPanel.tsx)
is the kind of code an AI tool might write without context: it works, but ignores the design system.

```sh
mkdir -p src/features/billing
cp fixtures/ai-output/BillingPanel.tsx src/features/billing/
pnpm exec designrail check
# FAIL: 18 findings at or above the failure threshold (error).   (plus 1 warning)
```

Findings include `bg-white`/`text-gray-900`/`bg-blue-600` instead of tokens (DR001), `p-[18px]` and
`mt-4` (DR002), Helvetica (DR003), a raw `<button>` and `<input>` (DR004), a missing `alt` (DR006), an
unlabeled coupon field (DR007), and a relative import of `Button` instead of `@/components/ui/button`
(DR008).

**4. Create the repair prompt.**

```sh
pnpm exec designrail fix-prompt
```

`designrail/reports/latest-fix-prompt.md` lists every finding with its location, evidence, and a suggested
correction (for example "Use the closest suitable token: p-md (spacing.md = 1rem) or p-lg"), the approved
tokens and components involved, scope limits, and the verification commands. Give it to your AI tool.

If you edit the file before running `fix-prompt`, DesignRail refuses the stale report and asks you to
rerun `check` (or use `--refresh`).

**5. Apply the correction and check again.** [`fixtures/corrected/BillingPanel.tsx`](fixtures/corrected/BillingPanel.tsx)
is one correct repair:

```sh
cp fixtures/corrected/BillingPanel.tsx src/features/billing/BillingPanel.tsx
pnpm exec designrail check          # PASS
pnpm exec designrail fix-prompt --stdout   # "There is nothing to repair."
rm -r src/features                  # restore the demo
```

**6. Keep instructions in sync.** Change a token in `src/index.css`, run
`pnpm exec designrail import-tokens src/index.css --replace`, and `designrail sync --check` exits 1
until you run `designrail sync`.

## Next.js

The same setup works in a Next.js project: init adds `app/` and `pages/` to the scanned sources, `.next/`
is never scanned, and `next/image` is checked by DR006. Import tokens from `app/globals.css` (Tailwind v4)
or `tailwind.config.ts` (Tailwind v3). See [docs/getting-started.md](../../docs/getting-started.md#nextjs).
