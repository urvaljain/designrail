import type { Command } from "commander";
import { loadProject } from "../../project/context.js";
import { IMPORT_FORMATS, type ImportFormat } from "../../tokens/import/types.js";
import { importTokens } from "../../tokens/importer.js";
import { TOKEN_TYPES, type TokenType } from "../../tokens/schema.js";
import { ExitCode } from "../../utilities/errors.js";
import { formatImport } from "../format.js";
import { isInteractive, type CliIO } from "../io.js";
import { confirm } from "../prompt.js";
import { makeContext, runAction, usageError, type CliState } from "../shared.js";

interface ImportFlags {
  format?: string;
  replace?: boolean;
  dryRun?: boolean;
  assumeType?: string;
  deriveCssVariables?: boolean;
  json?: boolean;
}

export function registerImportTokens(program: Command, io: CliIO, state: CliState): void {
  program
    .command("import-tokens")
    .description(
      "Import tokens from DesignRail JSON, DTCG-style JSON, CSS custom properties, or a static Tailwind theme",
    )
    .argument("<file>", "token source inside the project")
    .option("--format <format>", `force a format: ${IMPORT_FORMATS.join(", ")}`)
    .option("--replace", "replace existing tokens whose values conflict with the import")
    .option("--dry-run", "show the merge result without writing")
    .option(
      "--assume-type <type>",
      `type for entries whose type cannot be inferred: ${TOKEN_TYPES.join(", ")}`,
    )
    .option("--no-derive-css-variables", "DTCG: do not derive CSS variable names from token paths")
    .option("--json", "print JSON")
    .action(async (file: string, flags: ImportFlags, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, async () => {
        if (flags.format && !(IMPORT_FORMATS as readonly string[]).includes(flags.format))
          throw usageError(`Unknown --format ${flags.format}`, `Use one of: ${IMPORT_FORMATS.join(", ")}`);
        if (flags.assumeType && !(TOKEN_TYPES as readonly string[]).includes(flags.assumeType))
          throw usageError(
            `Unknown --assume-type ${flags.assumeType}`,
            `Use one of: ${TOKEN_TYPES.join(", ")}`,
          );
        const project = loadProject(ctx.root);
        const options = {
          ...(flags.format ? { format: flags.format as ImportFormat } : {}),
          ...(flags.assumeType ? { assumeType: flags.assumeType as TokenType } : {}),
          deriveCssVariables: flags.deriveCssVariables !== false,
        };
        let replace = Boolean(flags.replace);
        if (!replace && !flags.dryRun && !flags.json && isInteractive(io)) {
          const preview = importTokens(project, file, { ...options, dryRun: true });
          if (preview.merge.conflicts.length > 0) {
            ctx.err(formatImport(preview, ctx.style, true));
            replace = await confirm(
              io,
              `Replace ${preview.merge.conflicts.length} conflicting token(s) with the imported values?`,
              false,
            );
          }
        }
        const result = importTokens(project, file, { ...options, replace, dryRun: Boolean(flags.dryRun) });
        if (ctx.json) {
          ctx.writeJson({
            source: result.source,
            format: result.format,
            dryRun: Boolean(flags.dryRun),
            written: result.written,
            added: result.merge.added,
            changed: result.merge.changed,
            unchanged: result.merge.unchanged,
            conflicts: result.merge.conflicts.map((c) => ({
              name: c.name,
              existing: c.existing,
              incoming: c.incoming,
              replaced: result.merge.replaced.includes(c.name),
            })),
            skipped: result.parsed.skipped,
            unmatchedReferences: result.merge.unmatchedAttachments,
            notes: result.parsed.notes,
            definitionFileAdded: result.definitionFileAdded,
          });
        } else {
          ctx.out(formatImport(result, ctx.style, Boolean(flags.dryRun)));
        }
        return ExitCode.Ok;
      });
    });
}
