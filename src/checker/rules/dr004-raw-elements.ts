import { parseReplaces, type RegisteredComponent } from "../../components/schema.js";
import type { JsxElementInfo, Rule, RuleContext } from "../types.js";

function attributeMatches(element: JsxElementInfo, name: string, expected: string): "yes" | "no" | "unknown" {
  const attr = element.attributes.get(name);
  if (!attr) {
    if (element.hasSpread) return "unknown";
    // An <input> without type is a text input.
    return element.name === "input" && name === "type" && expected === "text" ? "yes" : "no";
  }
  if (attr.kind === "string") return attr.value.toLowerCase() === expected.toLowerCase() ? "yes" : "no";
  return "unknown";
}

function isImplementationFile(component: RegisteredComponent, file: string): boolean {
  return component.sourceFile === file || component.implementationFiles.includes(file);
}

function importLine(component: RegisteredComponent): string {
  return component.exportKind === "named"
    ? `import { ${component.exportName} } from "${component.importSpecifier}"`
    : `import ${component.exportName} from "${component.importSpecifier}"`;
}

export const dr004: Rule = {
  id: "DR004",
  name: "raw-element-instead-of-component",
  description:
    "Raw HTML elements used where a registered component explicitly replaces them. The component's own implementation files are exempt.",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "js", "ts"],
  check(ctx: RuleContext) {
    const components = ctx.project.componentFile.components.filter((c) => c.replaces.length > 0);
    if (components.length === 0) return;
    for (const element of ctx.file.elements) {
      if (!element.intrinsic) continue;
      for (const component of components) {
        if (isImplementationFile(component, ctx.file.path)) continue;
        for (const selector of component.replaces) {
          const parsed = parseReplaces(selector);
          if (parsed.tag !== element.name) continue;
          if (parsed.attribute) {
            const match = attributeMatches(element, parsed.attribute.name, parsed.attribute.value);
            if (match === "no") continue;
            if (match === "unknown") {
              ctx.coverage({
                loc: element.loc,
                kind: "dynamic-attribute",
                detail: `<${element.name}> ${parsed.attribute.name} is dynamic, so it is unknown whether ${component.exportName} (replaces ${selector}) applies`,
              });
              continue;
            }
          }
          ctx.report({
            loc: element.loc,
            message: `Raw <${element.name}> used where the registered component ${component.exportName} is expected`,
            evidence: `<${element.name}${parsed.attribute ? ` ${parsed.attribute.name}="${parsed.attribute.value}"` : ""}>`,
            suggestion: `Use <${component.exportName}> (${importLine(component)}).${component.usage ? ` Usage: ${component.usage.trim().replace(/\.?$/, ".")}` : ""} If it cannot provide the required behavior, explain why or add an approved exception.`,
            confidence: "high",
            subject: selector,
            component: component.id,
          });
        }
      }
    }
  },
};
