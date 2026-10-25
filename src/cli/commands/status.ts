import type { Command } from "commander";
import { projectStatus } from "../../diagnostics/status.js";
import { ExitCode } from "../../utilities/errors.js";
import { formatStatus } from "../format.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, type CliState } from "../shared.js";

export function registerStatus(program: Command, io: CliIO, state: CliState): void {
  program
    .command("status")
    .description("Show setup state, registered tokens and components, adapter freshness, and the last check")
    .option("--json", "print JSON")
    .action(async (flags: { json?: boolean }, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, () => {
        const status = projectStatus(ctx.root);
        if (ctx.json) ctx.writeJson(status);
        else ctx.out(formatStatus(status, ctx.style));
        return status.error ? ExitCode.Error : ExitCode.Ok;
      });
    });
}
