import type { Command } from "commander";
import { runCheck } from "../../checker/engine.js";
import { loadProject } from "../../project/context.js";
import { renderFixPrompt } from "../../reports/fix-prompt.js";
import { reportFreshness } from "../../reports/freshness.js";
import { fixPromptPath, latestReportPath, readReport, writeReport } from "../../reports/store.js";
import { atomicWrite } from "../../filesystem/safe-write.js";
import { resolveInsideRoot } from "../../filesystem/paths.js";
import { DesignRailError, ExitCode } from "../../utilities/errors.js";
import { plural } from "../../utilities/text.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, type CliState } from "../shared.js";

interface FixFlags {
  report?: string;
  refresh?: boolean;
  stdout?: boolean;
  json?: boolean;
}

export function registerFixPrompt(program: Command, io: CliIO, state: CliState): void {
  program
    .command("fix-prompt")
    .description(
      "Create an evidence-based repair prompt from the latest check report (rejects stale reports)",
    )
    .option("--report <path>", "report to use (default: designrail/reports/latest.json)")
    .option("--refresh", "rerun the check with the report's scope before generating the prompt")
    .option("--stdout", "print the prompt instead of writing designrail/reports/latest-fix-prompt.md")
    .option("--json", "print JSON with the prompt and its source report")
    .action(async (flags: FixFlags, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, () => {
        const project = loadProject(ctx.root);
        const reportPath = flags.report
          ? resolveInsideRoot(project.root, flags.report, "report path").relative
          : latestReportPath(project);
        let report;
        if (flags.refresh) {
          let scope = { paths: ["."], strict: false };
          try {
            scope = readReport(project, reportPath).scope;
          } catch {
            // No previous report: refresh the whole project.
          }
          report = runCheck(project, { paths: scope.paths, strict: scope.strict });
          if (project.config.reports.enabled) writeReport(project, reportPath, report);
          if (!ctx.json) ctx.err(`Reran check: ${report.result.reason}\n`);
        } else {
          report = readReport(project, reportPath);
          const freshness = reportFreshness(project, report);
          if (!freshness.fresh) {
            throw new DesignRailError(
              "stale-report",
              `${reportPath} is stale; it no longer describes the current files`,
              {
                details: freshness.reasons,
                hint: "Rerun `designrail check` (or use `designrail fix-prompt --refresh`) so the prompt cites current evidence.",
              },
            );
          }
        }
        const prompt = renderFixPrompt(project, report, reportPath);
        let written: string | null = null;
        if (!flags.stdout) {
          written = fixPromptPath(project);
          atomicWrite(project.root, written, prompt);
        }
        if (ctx.json)
          ctx.writeJson({ report: reportPath, findings: report.violations.length, path: written, prompt });
        else if (flags.stdout) ctx.out(prompt);
        else
          ctx.out(
            `Wrote ${written} (${plural(report.violations.length, "finding")}). Give it to your AI coding tool, then rerun \`designrail check\`.\n`,
          );
        return ExitCode.Ok;
      });
    });
}
