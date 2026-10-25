import { posix } from "node:path";
import type { RegisteredComponent } from "../../components/schema.js";
import type { Rule, RuleContext } from "../types.js";

const EXT = /\.(tsx|ts|jsx|js|mts|mjs|cts|cjs)$/;

function moduleId(path: string): string {
  const stripped = path.replace(EXT, "");
  return stripped.endsWith("/index") ? stripped.slice(0, -"/index".length) : stripped;
}

/** Resolves a specifier to a project-relative module id (no extension), or null for packages. */
export function resolveSpecifier(
  specifier: string,
  fromFile: string,
  aliases: Record<string, string[]>,
): string[] {
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return [moduleId(posix.normalize(posix.join(posix.dirname(fromFile), specifier)))];
  }
  const out: string[] = [];
  for (const [alias, targets] of Object.entries(aliases)) {
    if (alias.endsWith("/*")) {
      const prefix = alias.slice(0, -1);
      if (!specifier.startsWith(prefix)) continue;
      const rest = specifier.slice(prefix.length);
      for (const target of targets)
        out.push(moduleId(posix.normalize(target.replace(/^\.\//, "").replace(/\*$/, rest))));
    } else if (alias === specifier) {
      for (const target of targets) out.push(moduleId(posix.normalize(target.replace(/^\.\//, ""))));
    }
  }
  return out;
}

function isImplementationFile(component: RegisteredComponent, file: string): boolean {
  return component.sourceFile === file || component.implementationFiles.includes(file);
}

export const dr008: Rule = {
  id: "DR008",
  name: "component-import-policy",
  description:
    "Imports that bypass a registered component: restricted alternatives, non-recommended specifiers for the component module, and imports of internal implementation files.",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "ts", "js"],
  check(ctx: RuleContext) {
    const components = ctx.project.componentFile.components;
    if (components.length === 0) return;
    const aliases = ctx.project.config.source.importAliases;
    for (const imp of ctx.file.imports) {
      const resolved = resolveSpecifier(imp.source, ctx.file.path, aliases);
      for (const component of components) {
        if (isImplementationFile(component, ctx.file.path)) continue;
        for (const restriction of component.importPolicy.restricted) {
          if (restriction.from !== imp.source) continue;
          const hit = imp.specifiers.find(
            (s) => restriction.importName === "*" || s.imported === restriction.importName,
          );
          if (!hit) continue;
          ctx.report({
            loc: imp.loc,
            message: `${hit.imported === "default" ? "Default import" : hit.imported} from "${imp.source}" is restricted; use the registered ${component.exportName}`,
            evidence: `import ... from "${imp.source}"`,
            suggestion: `Import ${component.exportName} from "${component.importSpecifier}" instead.`,
            confidence: "high",
            subject: imp.source,
            component: component.id,
          });
        }
        if (resolved.length === 0) continue;
        const sourceModule = moduleId(component.sourceFile);
        const internal = component.implementationFiles
          .filter((f) => f !== component.sourceFile)
          .map(moduleId);
        const accepted = new Set([component.importSpecifier, ...component.importPolicy.alternateSpecifiers]);
        if (resolved.includes(sourceModule) && !accepted.has(imp.source)) {
          ctx.report({
            loc: imp.loc,
            message: `${component.exportName} is imported via "${imp.source}" instead of the registered specifier "${component.importSpecifier}"`,
            evidence: `import ... from "${imp.source}"`,
            suggestion: `Import from "${component.importSpecifier}"${component.importPolicy.alternateSpecifiers.length ? ` (or ${component.importPolicy.alternateSpecifiers.map((s) => `"${s}"`).join(", ")})` : ""}.`,
            confidence: "high",
            maxSeverity: "warning",
            subject: imp.source,
            component: component.id,
          });
        } else if (resolved.some((r) => internal.includes(r))) {
          ctx.report({
            loc: imp.loc,
            message: `"${imp.source}" is an internal implementation file of ${component.exportName}`,
            evidence: `import ... from "${imp.source}"`,
            suggestion: `Import ${component.exportName} from "${component.importSpecifier}".`,
            confidence: "high",
            subject: imp.source,
            component: component.id,
          });
        }
      }
    }
  },
};
