# Troubleshooting

Run `designrail doctor` first. It separates **configuration errors**, **missing optional capabilities**,
**unsupported syntax**, and **design violations**, and suggests the next command.

## Setup

**`DesignRail is not initialized here`**
Run `designrail init` in the project root, or pass `--cwd <project-root>`.

**`stdin is not an interactive terminal, so init cannot ask for confirmation`**
Init does not wait for input in scripts. Use `designrail init --yes` (existing files are still never
overwritten) or `--dry-run` to preview.

**`designrail/config.yaml is invalid`**
The message lists each problem with its path, for example `rules.DR001.severity: Invalid option`. Unknown
keys are rejected to catch typos. Compare with [configuration.md](configuration.md).

**`... uses unsupported YAML features`**
Custom YAML tags are rejected. Use plain values.

**`Refusing ... outside the project root` / `... through a symlink outside the project root`**
Every path DesignRail reads or writes must stay inside the project, including configured paths and
`--output`. Use a path inside the project.

**Node.js version errors**
DesignRail requires Node.js `^22.18.0` or `>=24.11.0`.

## Tokens

**An entry was skipped as "ambiguous"**
DesignRail does not guess token types. Rename the variable with a type prefix (`--space-gutter`), or pass
`--assume-type spacing` for that import.

**`looks like bare HSL channels`**
Values such as `0 0% 100%` are not colors on their own, so the CSS variable is skipped. Import the Tailwind
config (or `@theme inline` block) that wraps them, such as `background: "hsl(var(--background))"`: DesignRail
registers `color.background` with the Tailwind key `background` and an unresolved value, so `bg-background`
is accepted and raw colors are still reported.

**Dark-mode values are missing**
Only base values from `:root`/`html`/`:host` are imported; `.dark` and media-scoped values are reported as
skipped. This release does not model theme variants.

**`Import ... would make tokens.json inconsistent`**
The import would add alias cycles, missing alias targets, or two tokens claiming the same CSS variable or
Tailwind key. Nothing was written. The details list the conflicting tokens.

**`check` exits 2 with `unresolvable token references`**
Fix the alias cycle or missing target in `tokens.json` (`doctor` lists them).

## Components

**`Cannot infer how X is exported`**
The file uses `export *` or an anonymous default export. Pass `--export named` or `--export default`.

**`Cannot infer an import specifier`**
No entry in `source.importAliases` covers the file. Pass `--import "<specifier>"`.

## Sync

**`malformed DesignRail markers`**
The file has duplicate, missing, reversed, or non-standard markers. Edit it so there is exactly one
`<!-- DESIGNRAIL:START -->` line and one `<!-- DESIGNRAIL:END -->` line, or delete both lines (and the text
between them) to let sync append a fresh section.

**`was edited by hand; refusing to replace those edits`**
Someone changed text inside the managed section. Move lasting guidance to `designrail/design-rules.md` or
outside the markers, then run `designrail sync`, or `designrail sync --force` to discard the edits.
Reformatting with Prettier does not trigger this.

**`exists and was not created by DesignRail`**
`.cursor/rules/designrail.mdc` or `DESIGNRAIL_CONTEXT.md` already exists. Rename it or set another path for
the adapter.

**`sync --check` fails in CI**
Tokens, components, or configuration changed after the last sync. Run `designrail sync` and commit.

## Check

**A file is "partially analyzed"**
It contains dynamic classes or styles, or Tailwind utilities whose values DesignRail cannot know. These are
listed under "Not analyzed" and in the report's `unsupported` array. They are not violations.

**Many `p-4`-style utilities are listed as unverified**
DesignRail does not assume what Tailwind's numeric scale means for your design system. Set
`policies.tailwind.numericSpacing: allow` if the scale is approved, or `flag` to require named spacing tokens.

**`bg-white` / `text-gray-900` are reported**
Default palette utilities are reported when `policies.tailwind.defaultPalette: flag` (default). Register
semantic tokens, or set it to `allow`.

**A finding is wrong**
Add a suppression on the line above with a reason
(`// designrail-ignore-next-line DR001 -- reason`), or a narrow entry under `exceptions`. Please also report
it with a minimal snippet so the rule can improve.

**`check` exits 2 with parse failures**
A file could not be parsed. The report lists the file, line, and parser message. Other files were still
checked, but the run is marked `incomplete`. Fix the syntax or exclude the file.

**SCSS, Less, Vue, Svelte, or MDX files are ignored**
They are not supported in this release (`doctor` lists them as missing capabilities).

## Fix prompt

**`No report found`**
Run `designrail check` first, or `designrail fix-prompt --refresh`.

**`... is stale`**
Files, tokens, components, or configuration changed since the report, or new files entered its scope. Rerun
`designrail check`, or use `--refresh` to recheck with the same scope.
