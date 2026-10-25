import type { Command } from "commander";
import { applySync, hasDrift, planSync } from "../../adapters/sync.js";
import { loadProject } from "../../project/context.js";
import { ExitCode } from "../../utilities/errors.js";
import { formatSync } from "../format.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, usageError, type CliState } from "../shared.js";

export function registerSync(program: Command, io: CliIO, state: CliState): void {
  program
    .command("sync")
    .description("Generate or update AI instruction files (managed sections only)")
    .option("--dry-run", "show what would change without writing")
    .option("--check", "exit 1 if any generated file is missing or out of date; never writes")
    .option("--force", "replace managed sections that were edited by hand")
    .option("--json", "print JSON")
    .action(
      async (
        flags: { dryRun?: boolean; check?: boolean; force?: boolean; json?: boolean },
        command: Command,
      ) => {
        const ctx = makeContext(io, command, Boolean(flags.json));
        await runAction(state, ctx, () => {
          if (flags.check && flags.force) throw usageError("--check and --force cannot be combined");
          const project = loadProject(ctx.root);
          const items = planSync(project, { force: Boolean(flags.force) });
          const blocked = items.some((i) => i.status === "blocked");
          const mode = flags.check ? "check" : flags.dryRun ? "dry-run" : "write";
          if (mode === "write") applySync(project, items);
          if (ctx.json) {
            ctx.writeJson({
              mode,
              items: items.map((i) => ({
                id: i.id,
                path: i.path,
                status: i.status,
                ...(i.problem ? { problem: i.problem } : {}),
              })),
              drift: hasDrift(items),
            });
          } else {
            ctx.out(formatSync(items, ctx.style, mode));
            if (mode === "check" && hasDrift(items) && !blocked)
              ctx.err("Generated AI instructions are out of date. Run `designrail sync`.\n");
          }
          if (blocked) return ExitCode.Error;
          if (mode === "check" && hasDrift(items)) return ExitCode.Findings;
          return ExitCode.Ok;
        });
      },
    );
}
