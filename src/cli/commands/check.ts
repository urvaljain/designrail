import type { Command } from "commander";
import { runCheck } from "../../checker/engine.js";
import { loadProject } from "../../project/context.js";
import { latestReportPath, writeReport } from "../../reports/store.js";
import type { ExitCode } from "../../utilities/errors.js";
import { formatCheckReport } from "../format.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, type CliState } from "../shared.js";

interface CheckFlags {
  json?: boolean;
  strict?: boolean;
  quiet?: boolean;
  output?: string;
  report?: boolean;
}

export function registerCheck(program: Command, io: CliIO, state: CliState): void {
  program
    .command("check")
    .description("Check source files against the design rules (never modifies source code)")
    .argument(
      "[paths...]",
      "files or directories to check (default: the whole project, filtered by source.include/exclude)",
    )
    .option("--json", "print the report as JSON on stdout (nothing else is printed there)")
    .option("--strict", "fail on warnings as well as errors")
    .option("--quiet", "print only failing findings and the result line")
    .option("--output <path>", "also write the JSON report to this project-relative path")
    .option("--no-report", "do not write designrail/reports/latest.json")
    .action(async (paths: string[], flags: CheckFlags, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, () => {
        const project = loadProject(ctx.root);
        const report = runCheck(project, { paths, strict: Boolean(flags.strict) });
        let reportPath: string | null = null;
        if (project.config.reports.enabled && flags.report !== false)
          reportPath = writeReport(project, latestReportPath(project), report);
        if (flags.output) writeReport(project, flags.output, report);
        if (ctx.json) ctx.writeJson(report);
        else ctx.out(formatCheckReport(report, ctx.style, { quiet: Boolean(flags.quiet), reportPath }));
        return report.result.exitCode as ExitCode;
      });
    });
}
