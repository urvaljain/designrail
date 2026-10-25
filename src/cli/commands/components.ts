import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Command } from "commander";
import { inferImportSpecifier } from "../../components/exports.js";
import {
  inspectComponent,
  registerComponent,
  validateComponentPath,
  type RegisterOptions,
} from "../../components/register.js";
import { loadProject } from "../../project/context.js";
import { ExitCode } from "../../utilities/errors.js";
import { isInteractive, type CliIO } from "../io.js";
import { ask } from "../prompt.js";
import { makeContext, parseList, runAction, usageError, type CliState } from "../shared.js";

interface AddFlags {
  import?: string;
  export?: string;
  id?: string;
  replaces?: string;
  description?: string;
  usage?: string;
  variants?: string;
  implementationFiles?: string;
  alternateImports?: string;
  restrict: string[];
  update?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

const collect = (value: string, previous: string[]): string[] => [...previous, value];

export function registerComponentCommands(program: Command, io: CliIO, state: CliState): void {
  program
    .command("add-component")
    .description("Register an approved component so AI instructions and checks can use it")
    .argument("<name>", "exported component name, e.g. Button")
    .argument("<path>", "project-relative source file, e.g. src/components/ui/button.tsx")
    .option(
      "--import <specifier>",
      'recommended import specifier, e.g. "@/components/ui/button" (inferred from import aliases when possible)',
    )
    .option("--export <kind>", "named | default (inferred from the file when reliable)")
    .option("--id <id>", "registry id (default: kebab-case of the name)")
    .option(
      "--replaces <elements>",
      'raw elements it replaces, comma-separated, e.g. "button" or "input[type=text]"',
    )
    .option("--description <text>", "what the component is for")
    .option("--usage <text>", "usage guidance shown to AI tools")
    .option("--variants <list>", "documented variants, comma-separated (only what you list is recorded)")
    .option("--implementation-files <list>", "extra implementation files exempt from DR004, comma-separated")
    .option("--alternate-imports <list>", "other acceptable import specifiers, comma-separated")
    .option(
      "--restrict <from:importName>",
      'an import that should be replaced by this component, e.g. "@mui/material:Button" (repeatable)',
      collect,
      [],
    )
    .option("--update", "replace an existing registration with the same id")
    .option("--dry-run", "validate and show the entry without writing")
    .option("--json", "print JSON")
    .action(async (name: string, path: string, flags: AddFlags, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, async () => {
        const project = loadProject(ctx.root);
        if (flags.export && flags.export !== "named" && flags.export !== "default")
          throw usageError("--export must be named or default");
        const options: RegisterOptions = {
          name,
          path,
          replaces: parseList(flags.replaces),
          variants: parseList(flags.variants),
          implementationFiles: parseList(flags.implementationFiles),
          alternateSpecifiers: parseList(flags.alternateImports),
          restricted: flags.restrict.map((r) => {
            const at = r.lastIndexOf(":");
            if (at <= 0 || at === r.length - 1)
              throw usageError(`--restrict expects "<module>:<importName>", got "${r}"`);
            return { from: r.slice(0, at), importName: r.slice(at + 1) };
          }),
          update: Boolean(flags.update),
          dryRun: Boolean(flags.dryRun),
          ...(flags.import ? { importSpecifier: flags.import } : {}),
          ...(flags.export ? { exportKind: flags.export as "named" | "default" } : {}),
          ...(flags.id ? { id: flags.id } : {}),
          ...(flags.description ? { description: flags.description } : {}),
          ...(flags.usage ? { usage: flags.usage } : {}),
        };
        if (isInteractive(io) && !flags.json) {
          const source = validateComponentPath(project, path);
          if (!options.exportKind) {
            const decision = inspectComponent(project, source, name);
            if (!decision.reliable) {
              ctx.err(`Could not confirm the export: ${decision.reason}.\n`);
              const answer = await ask(io, `How is ${name} exported? (named, default)`, "named");
              if (answer !== "named" && answer !== "default")
                throw usageError(`Unknown export kind "${answer}"`);
              options.exportKind = answer;
            }
          }
          if (
            !options.importSpecifier &&
            !inferImportSpecifier(source, project.config.source.importAliases)
          ) {
            const answer = await ask(
              io,
              `Import specifier for ${name} (as other files should import it)`,
              "",
            );
            if (!answer) throw usageError("An import specifier is required", 'Pass --import "<specifier>".');
            options.importSpecifier = answer;
          }
        }
        const result = registerComponent(project, options);
        if (ctx.json) {
          ctx.writeJson({
            action: result.action,
            written: result.written,
            component: result.component,
            inferred: result.inferred,
            notes: result.notes,
          });
          return ExitCode.Ok;
        }
        const c = result.component;
        ctx.out(
          [
            `${flags.dryRun ? "Would register" : result.action === "added" ? "Registered" : "Updated"} ${c.exportName} (${c.id})`,
            `  source:   ${c.sourceFile}`,
            `  import:   ${c.exportKind === "named" ? `import { ${c.exportName} }` : `import ${c.exportName}`} from "${c.importSpecifier}"${result.inferred.importSpecifier ? " (inferred from import aliases)" : ""}`,
            `  export:   ${c.exportKind}${result.inferred.exportKind ? " (inferred from the file)" : ""}`,
            `  replaces: ${c.replaces.length ? c.replaces.join(", ") : "(none; DR004 will not flag raw elements for it)"}`,
            ...(c.variants?.length ? [`  variants: ${c.variants.join(", ")}`] : []),
            ...result.notes.map((n) => `  note: ${n}`),
            ...(flags.dryRun ? [] : ["Run `designrail sync` to refresh AI instructions."]),
          ].join("\n") + "\n",
        );
        return ExitCode.Ok;
      });
    });

  program
    .command("list-components")
    .description("List registered components")
    .option("--json", "print JSON")
    .action(async (flags: { json?: boolean }, command: Command) => {
      const ctx = makeContext(io, command, Boolean(flags.json));
      await runAction(state, ctx, () => {
        const project = loadProject(ctx.root);
        const rows = [...project.componentFile.components]
          .sort((a, b) => a.exportName.localeCompare(b.exportName))
          .map((c) => ({ ...c, fileExists: existsSync(join(project.root, c.sourceFile)) }));
        if (ctx.json) {
          ctx.writeJson({ components: rows });
          return ExitCode.Ok;
        }
        if (rows.length === 0) {
          ctx.out("No components registered. Use `designrail add-component <Name> <path>`.\n");
          return ExitCode.Ok;
        }
        const lines = rows.map(
          (c) =>
            `${c.exportName.padEnd(16)} ${c.sourceFile.padEnd(40)} ${c.importSpecifier.padEnd(32)} ${(c.replaces.join(",") || "-").padEnd(16)} ${c.fileExists ? ctx.style.green("file ok") : ctx.style.red("file missing")}`,
        );
        ctx.out(
          `${ctx.style.bold(`${"Component".padEnd(16)} ${"Source".padEnd(40)} ${"Import".padEnd(32)} ${"Replaces".padEnd(16)} File`)}\n${lines.join("\n")}\n`,
        );
        return ExitCode.Ok;
      });
    });
}
