import type { Command } from "commander";
import { runDoctor } from "../../diagnostics/doctor.js";
import { formatDoctor } from "../format.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, type CliState } from "../shared.js";

export function registerDoctor(program: Command, io: CliIO, state: CliState): void {
  program
    .command("doctor")
    .description(
      "Diagnose runtime, configuration, tokens, components, adapters, patterns, and report freshness",
    )
    .option("--json", "print JSON")
    .action(async (flags: { json?: boolean }, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, () => {
        const result = runDoctor(ctx.root);
        if (ctx.json) ctx.writeJson(result);
        else ctx.out(formatDoctor(result, ctx.style));
        return result.exitCode;
      });
    });
}
