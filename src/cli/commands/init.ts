import type { Command } from "commander";
import { ADAPTER_IDS, type AdapterId } from "../../config/schema.js";
import { applyInit, parseAdapterList, planInit, type InitSettings } from "../../project/init.js";
import { ExitCode } from "../../utilities/errors.js";
import { isInteractive, type CliIO } from "../io.js";
import { ask, confirm } from "../prompt.js";
import { makeContext, runAction, usageError, type CliState } from "../shared.js";

interface InitFlags {
  yes?: boolean;
  dryRun?: boolean;
  name?: string;
  framework?: string;
  tailwind?: string;
  adapters?: string;
  checkCommand?: string;
  json?: boolean;
}

export function registerInit(program: Command, io: CliIO, state: CliState): void {
  program
    .command("init")
    .description("Create designrail/ configuration in an existing project (never overwrites existing files)")
    .option("-y, --yes", "accept detected values and documented safe defaults without prompting")
    .option("--dry-run", "show what would be created without writing")
    .option("--name <name>", "project name")
    .option("--framework <framework>", "react | next | unknown")
    .option("--tailwind <version>", "v3 | v4 | none")
    .option("--adapters <list>", `comma-separated AI targets: ${ADAPTER_IDS.join(", ")}`)
    .option("--check-command <command>", "how this project runs DesignRail (shown to AI tools)")
    .option("--json", "print the plan/result as JSON")
    .action(async (flags: InitFlags, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, async () => {
        const settings: InitSettings = {};
        if (flags.name) settings.name = flags.name;
        if (flags.framework) {
          if (!["react", "next", "unknown"].includes(flags.framework))
            throw usageError(`--framework must be react, next, or unknown`);
          settings.framework = flags.framework as InitSettings["framework"];
        }
        if (flags.tailwind) {
          if (!["v3", "v4", "none"].includes(flags.tailwind))
            throw usageError(`--tailwind must be v3, v4, or none`);
          settings.tailwind = flags.tailwind as InitSettings["tailwind"];
        }
        if (flags.adapters) {
          try {
            settings.adapters = parseAdapterList(flags.adapters);
          } catch (error) {
            throw usageError((error as Error).message);
          }
        }
        if (flags.checkCommand) settings.checkCommand = flags.checkCommand;

        let plan = planInit(ctx.root, settings);
        const interactive = isInteractive(io) && !flags.yes && !flags.json;
        const willCreate = plan.actions.some((a) => a.action === "create");
        if (!flags.yes && !flags.dryRun && !interactive && willCreate) {
          throw usageError(
            "stdin is not an interactive terminal, so init cannot ask for confirmation",
            "Rerun with --yes to accept detected values (existing files are never overwritten), or --dry-run to preview.",
          );
        }

        if (interactive && !plan.existingConfig) {
          const d = plan.detection;
          ctx.err(
            [
              ctx.style.bold("Detected"),
              `  framework: ${d.framework}${d.frameworkEvidence.length ? ` (${d.frameworkEvidence.join("; ")})` : ""}`,
              `  tailwind:  ${d.tailwind}${d.tailwindEvidence.length ? ` (${d.tailwindEvidence.join("; ")})` : ""}`,
              `  sources:   ${d.sourceDirectories.join(", ") || "(none found; defaulting to src/)"}`,
              `  aliases:   ${Object.keys(d.importAliases).join(", ") || "(none)"}${d.aliasEvidence ? ` from ${d.aliasEvidence}` : ""}`,
              `  package manager: ${d.packageManager}`,
              "",
            ].join("\n"),
          );
          const next: InitSettings = { ...settings };
          if (!settings.framework && d.framework === "unknown") {
            const answer = await ask(io, "Framework (react, next, unknown)", "react");
            if (!["react", "next", "unknown"].includes(answer))
              throw usageError(`Unknown framework "${answer}"`);
            next.framework = answer as InitSettings["framework"];
          }
          if (!settings.adapters) {
            const answer = await ask(io, `AI targets (${ADAPTER_IDS.join(", ")})`, "codex,claude-code");
            next.adapters = parseAdapterList(answer) as AdapterId[];
          }
          plan = planInit(ctx.root, next);
        }

        if (flags.json) {
          const created = flags.dryRun ? [] : applyInit(plan);
          ctx.writeJson({
            dryRun: Boolean(flags.dryRun),
            root: plan.root,
            existingConfig: plan.existingConfig,
            actions: plan.actions,
            created,
            ignoredSettings: plan.ignoredSettings,
            detection: plan.detection,
          });
          return ExitCode.Ok;
        }

        const lines = [
          ctx.style.bold(flags.dryRun ? "DesignRail init (dry run)" : "DesignRail init"),
          `Project root: ${plan.root}`,
        ];
        if (plan.existingConfig)
          lines.push("Existing designrail/config.yaml is valid and will be kept unchanged.");
        if (plan.ignoredSettings.length > 0)
          lines.push(
            ctx.style.yellow(
              `Ignored flags because a configuration exists: ${plan.ignoredSettings.join(", ")}. Edit designrail/config.yaml instead.`,
            ),
          );
        for (const action of plan.actions) {
          const label =
            action.action === "create"
              ? ctx.style.green(flags.dryRun ? "would create" : "create")
              : ctx.style.dim("keep");
          lines.push(
            `  ${label.padEnd(14)} ${action.path}${action.note ? ctx.style.dim(`  (${action.note})`) : ""}`,
          );
        }
        ctx.out(`${lines.join("\n")}\n`);

        if (!flags.dryRun) {
          if (interactive && willCreate && !(await confirm(io, "Create these files?", true))) {
            ctx.err("Nothing was written.\n");
            return ExitCode.Ok;
          }
          applyInit(plan);
          const next = [
            "",
            "Next steps:",
            plan.detection.tokenCandidates.length > 0
              ? `  1. Import tokens: designrail import-tokens ${plan.detection.tokenCandidates[0]}${plan.detection.tokenCandidates.length > 1 ? `  (other candidates: ${plan.detection.tokenCandidates.slice(1, 4).join(", ")})` : ""}`
              : "  1. Import tokens: designrail import-tokens <tokens.json | styles.css | tailwind.config.js>",
            "  2. Register components: designrail add-component Button src/components/ui/button.tsx --replaces button",
            "  3. Edit designrail/design-rules.md and product-context.md, then run: designrail sync",
            "  4. Check code: designrail check",
          ];
          ctx.out(`${next.join("\n")}\n`);
        }
        return ExitCode.Ok;
      });
    });
}
