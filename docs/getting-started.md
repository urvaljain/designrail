# Getting started

This guide adds DesignRail to an existing React + TypeScript project. Every step only creates files under
`designrail/` or managed sections in instruction files; your source code is never modified.

## 1. Install

DesignRail is not published to npm yet. Build a package archive from this repository and install it
(Node.js `^22.18.0` or `>=24.11.0`):

```sh
# in the DesignRail repository
pnpm install && pnpm build && npm pack

# in your project
npm install --save-dev /path/to/designrail-0.1.0.tgz
```

Add a script so people, CI, and AI tools use the same command:

```json
{ "scripts": { "design:check": "designrail check" } }
```

## 2. Initialize

```sh
npx designrail init
```

On a terminal, init shows what it detected (framework, Tailwind version, source folders, import aliases,
package manager), asks only for missing information, lists the files it will create, and asks for
confirmation. In scripts or CI use `--yes`; init then uses detected values and documented defaults and
still never overwrites existing files. Useful flags: `--framework`, `--tailwind`, `--adapters`,
`--check-command`, `--dry-run`.

It creates:

```text
designrail/config.yaml            settings, policies, exceptions
designrail/tokens.json            empty and marked "unconfigured" until you import tokens
designrail/components.json        empty registry
designrail/design-rules.md        starter guidance (edit it)
designrail/accessibility-rules.md starter guidance (edit it)
designrail/product-context.md     template (fill it in)
designrail/tasks/                 task briefs
designrail/reports/               check reports (git-ignored)
```

Running init again keeps everything that exists and only recreates missing files.

## 3. Import tokens

Point DesignRail at the file that defines your tokens:

```sh
npx designrail import-tokens src/app/globals.css     # CSS variables and/or Tailwind v4 @theme
npx designrail import-tokens tailwind.config.ts      # Tailwind v3 theme literals
npx designrail import-tokens tokens.json             # DTCG-style or DesignRail JSON
```

Read the "Skipped" list: DesignRail only imports what it can type and resolve reliably. Use
`--dry-run` first if you like, `--assume-type` for ambiguous variables, and `--replace` to accept
conflicting values. Details: [tokens.md](tokens.md).

## 4. Register components

```sh
npx designrail add-component Button src/components/ui/button.tsx --replaces button
npx designrail add-component Input src/components/ui/input.tsx --replaces "input[type=text],input[type=email]"
npx designrail list-components
```

Details: [components.md](components.md).

## 5. Write your rules and generate AI instructions

Edit `designrail/design-rules.md`, `accessibility-rules.md`, and `product-context.md`. Remove the
`designrail:starter` line once a file reflects your project, so generated instructions describe it as
project-defined. Then:

```sh
npx designrail sync
```

Commit `designrail/` (except `reports/`) and the generated instruction files.

## 6. Use the loop

```sh
npx designrail task "Add a billing panel with a coupon field and an upgrade button"
```

Open the new file in `designrail/tasks/`, answer the open questions you can, and give the
"Implementation prompt" section to your AI coding tool. After it finishes:

```sh
npm run design:check
npx designrail fix-prompt      # writes designrail/reports/latest-fix-prompt.md
```

Give the repair prompt to the AI tool and check again. `fix-prompt` refuses to run on a report that no
longer matches your files; rerun `check` or use `fix-prompt --refresh`.

## 7. Keep it healthy

```sh
npx designrail status      # setup gaps, stale files, last check
npx designrail doctor      # configuration, tokens, components, adapters, patterns
npx designrail sync --check   # in CI: fails when instructions are out of date
```

See [ci.md](ci.md) for a CI workflow.

## Next.js

Nothing in DesignRail depends on Next.js. For Next.js layouts:

- init adds `app/**` and `pages/**` (when those folders exist) to `source.include` next to `src/**`;
- `.next/` is never scanned;
- `next/image` default imports are checked by DR006 like `<img>`;
- `"use client"` directives and server components need no special handling;
- import tokens from your global stylesheet (often `app/globals.css`) or Tailwind config.
