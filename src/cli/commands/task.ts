import type { Command } from "commander";
import { loadProject } from "../../project/context.js";
import { renderTaskBrief, writeTask } from "../../tasks/brief.js";
import { ExitCode } from "../../utilities/errors.js";
import type { CliIO } from "../io.js";
import { makeContext, runAction, usageError, type CliState } from "../shared.js";

function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function registerTask(program: Command, io: CliIO, state: CliState): void {
  program
    .command("task")
    .description(
      "Create a structured task brief and implementation prompt from a description (template-based, no AI calls)",
    )
    .argument("<description>", "the feature request, in quotes")
    .option("--stdout", "print the brief instead of writing a file")
    .option("--name <slug>", "filename slug (default: derived from the description)")
    .option("--json", "print JSON with the path and content")
    .action(
      async (
        description: string,
        flags: { stdout?: boolean; name?: string; json?: boolean },
        command: Command,
      ) => {
        const ctx = makeContext(io, command, Boolean(flags.json));
        await runAction(state, ctx, () => {
          if (description.trim() === "") throw usageError("Task description is empty");
          const project = loadProject(ctx.root);
          const date = localDate(io.now ? io.now() : new Date());
          if (flags.stdout) {
            const content = renderTaskBrief(project, description, date);
            if (ctx.json) ctx.writeJson({ path: null, content });
            else ctx.out(content);
            return ExitCode.Ok;
          }
          const result = writeTask(project, description, {
            date,
            ...(flags.name ? { slug: flags.name } : {}),
          });
          if (ctx.json) ctx.writeJson(result);
          else
            ctx.out(
              `Created ${result.path}\nIt is a template-generated scaffold: review the open questions, then give the "Implementation prompt" section to your AI coding tool.\n`,
            );
          return ExitCode.Ok;
        });
      },
    );
}
