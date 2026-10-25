import { Command, CommanderError } from "commander";
import { ExitCode } from "../utilities/errors.js";
import { toolVersion } from "../version.js";
import { registerCheck } from "./commands/check.js";
import { registerComponentCommands } from "./commands/components.js";
import { registerDoctor } from "./commands/doctor.js";
import { registerFixPrompt } from "./commands/fix-prompt.js";
import { registerImportTokens } from "./commands/import-tokens.js";
import { registerInit } from "./commands/init.js";
import { registerStatus } from "./commands/status.js";
import { registerSync } from "./commands/sync.js";
import { registerTask } from "./commands/task.js";
import type { CliIO } from "./io.js";
import { closePrompts } from "./prompt.js";
import type { CliState } from "./shared.js";

export type { CliIO } from "./io.js";

export function buildProgram(io: CliIO, state: CliState): Command {
  const program = new Command();
  program
    .name("designrail")
    .description(
      "Keep AI-generated UI consistent with your design system.\nLocal only: no accounts, no network calls, no telemetry.",
    )
    .version(toolVersion(), "-v, --version", "print the DesignRail version")
    .option("--cwd <dir>", "project root (default: current directory)", ".")
    .option("--no-color", "disable colored output")
    .showHelpAfterError("(run with --help for usage)")
    .exitOverride()
    .configureOutput({
      writeOut: (s) => io.stdout.write(s),
      writeErr: (s) => io.stderr.write(s),
    });
  registerInit(program, io, state);
  registerStatus(program, io, state);
  registerImportTokens(program, io, state);
  registerComponentCommands(program, io, state);
  registerSync(program, io, state);
  registerTask(program, io, state);
  registerCheck(program, io, state);
  registerFixPrompt(program, io, state);
  registerDoctor(program, io, state);
  for (const command of program.commands) command.exitOverride();
  return program;
}

/** Runs the CLI with injected I/O and returns the process exit code. */
export async function runCli(argv: string[], io: CliIO): Promise<number> {
  const state: CliState = { exitCode: ExitCode.Ok };
  const program = buildProgram(io, state);
  if (argv.length === 0) {
    program.outputHelp();
    return ExitCode.Ok;
  }
  try {
    await program.parseAsync(argv, { from: "user" });
  } catch (error) {
    closePrompts(io);
    if (error instanceof CommanderError) {
      if (
        error.code === "commander.helpDisplayed" ||
        error.code === "commander.version" ||
        error.code === "commander.help"
      )
        return ExitCode.Ok;
      return ExitCode.Error;
    }
    throw error;
  }
  closePrompts(io);
  return state.exitCode;
}
