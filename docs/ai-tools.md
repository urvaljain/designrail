# AI tools

`designrail sync` writes instruction files for the adapters listed in `designrail/config.yaml`:

```yaml
adapters:
  - id: codex
  - id: claude-code
  - id: cursor
  - id: generic
    path: docs/DESIGNRAIL_CONTEXT.md # optional path override
```

| Adapter       | Default file                                                     | How DesignRail writes it                                        |
| ------------- | ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `codex`       | `AGENTS.md`                                                      | Managed section in a shared file                                |
| `claude-code` | `CLAUDE.md` (or `.claude/CLAUDE.md` if only that exists at init) | Managed section in a shared file                                |
| `cursor`      | `.cursor/rules/designrail.mdc`                                   | File owned by DesignRail                                        |
| `generic`     | `DESIGNRAIL_CONTEXT.md`                                          | File owned by DesignRail; attach or paste into other assistants |

Instruction files guide AI behavior. They cannot guarantee compliance, they may be outweighed by other
instructions, and a tool may not load them in every session or mode. DesignRail's `check` is the
independent verification step.

## What the generated instructions contain

- A short project context (name, framework, styling) and the paths of the source-of-truth files, marked
  as project-defined, starter template (still containing the `designrail:starter` marker), or missing.
- Token policy and, for up to 40 tokens, a table of names, values, and how to reference them. Larger
  registries point to `designrail/tokens.json` instead of inlining everything.
- Registered components (up to 25 inline) with import lines, replaced elements, and listed variants.
- Before, during, and after implementation expectations: read existing instructions and DesignRail files,
  confirm behavior from the repository, avoid inventing requirements, tokens, components, props, or
  variants, keep changes scoped, consider loading/empty/error/disabled/success states, run the project's
  checks and the configured DesignRail command, and report what DesignRail cannot verify.
- Responsive and accessibility guidance, with what is checked statically and what needs manual review.
- How exceptions and suppressions work.

Paths are written in backticks. This also keeps Claude Code from treating `@path` text as an import.

## Shared files: managed sections

In `AGENTS.md` and `CLAUDE.md`, DesignRail owns only the text between these lines:

```markdown
<!-- DESIGNRAIL:START -->
<!-- designrail:content-hash 1c8a5dc1fe2fea53 -->
<!-- Managed by DesignRail. ... -->

...generated content...
<!-- DESIGNRAIL:END -->
```

- **No markers:** the section is appended after a blank line. Everything already in the file is kept.
- **Valid markers:** only the section is replaced. Content before and after it is kept byte for byte, and
  CRLF line endings are preserved.
- **Malformed markers** (duplicates, a missing start or end, reversed order, or a marker that is not alone
  on its line): sync stops with exit code 2 and changes nothing. It never guesses which text to remove.
- **Hand edits inside the section** (detected through the content hash): sync stops and explains how to
  move the guidance. `--force` replaces the section.
- **Formatting only:** blank lines and Markdown table padding are ignored when comparing, so running
  Prettier on these files does not count as drift or as a manual edit.
- Repeated runs produce identical files and report `up to date`.

## Owned files

`.cursor/rules/designrail.mdc` and `DESIGNRAIL_CONTEXT.md` are written in full. If such a file exists
without DesignRail markers, sync reports a collision (exit 2) and does not overwrite it. Rename the file or
set another `path`.

## Commands

```sh
designrail sync            # write or update files
designrail sync --dry-run  # show what would change
designrail sync --check    # exit 1 if anything is missing or out of date; never writes
designrail sync --force    # replace hand-edited managed sections
```

Use `sync --check` in CI to make sure instructions match the current tokens and components.

## Verified conventions

Conventions were checked on 2026-10-25. Some sources could not be reached from the build environment; those
are marked.

**Claude Code** — verified against the official documentation (code.claude.com/docs/en/memory):

- Project instructions live in `./CLAUDE.md` or `./.claude/CLAUDE.md`; files up the directory tree are
  concatenated; `CLAUDE.local.md` is personal.
- Claude Code reads `AGENTS.md` only when there is no `CLAUDE.md` (default setting). That is why the
  `claude-code` adapter writes its own section instead of relying on `AGENTS.md`.
- Block-level HTML comments are stripped before the content reaches the model, so the markers and hash do
  not consume context.
- `@path` text outside code spans imports files; generated paths are always in backticks.
- The documentation recommends keeping each file under about 200 lines; the generated section stays well
  below that for typical registries.

**Codex (`AGENTS.md`)** — the official guide (developers.openai.com/codex/guides/agents-md) could not be
fetched from the build environment. Based on search-result summaries of that page: Codex reads
`AGENTS.override.md` or `AGENTS.md` in each directory from the project root down, concatenates them, and
stops at a combined size limit (`project_doc_max_bytes`, 32 KiB by default). The generated section is kept
short for that reason. If a directory has `AGENTS.override.md`, Codex reads that file instead of
`AGENTS.md`; DesignRail does not write override files.

**Cursor** — the official documentation (cursor.com/docs) could not be reached from the build environment.
The format used here comes from secondary sources that agree with each other: project rules are `.mdc`
files in `.cursor/rules/` with YAML frontmatter fields `description`, `globs`, and `alwaysApply`; rules
with `alwaysApply: true` are included in every request. DesignRail writes `description` and
`alwaysApply: true`. Treat Cursor compatibility as unverified until checked against current Cursor
documentation, and adjust the file if your Cursor version expects something else.

**Other assistants** — `DESIGNRAIL_CONTEXT.md` is plain Markdown with no tool-specific conventions.
DesignRail does not claim compatibility with any particular tool beyond the files above.

## Data handling

DesignRail only writes local files. The AI tool that reads them, and anything you paste into it, follows
that tool's own data handling and privacy terms.
