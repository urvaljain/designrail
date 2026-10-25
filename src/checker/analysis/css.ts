import postcss, { CssSyntaxError, type AtRule, type Container } from "postcss";
import { parseClass } from "../parsers/tailwind.js";
import { parseSuppression } from "../suppressions.js";
import type { FileAnalysis } from "../types.js";
import type { ParseFailureInfo } from "../parsers/source.js";

function inTheme(node: { parent?: Container | undefined }): boolean {
  let parent = node.parent as Container | undefined;
  while (parent && parent.type !== "root") {
    if (parent.type === "atrule" && (parent as AtRule).name === "theme") return true;
    parent = parent.parent as Container | undefined;
  }
  return false;
}

/** Collects declarations, @apply classes, and suppression comments from a CSS file. */
export function analyzeCss(file: FileAnalysis): ParseFailureInfo | null {
  let root;
  try {
    root = postcss.parse(file.content, { from: file.path });
  } catch (error) {
    if (error instanceof CssSyntaxError) {
      return { line: error.line ?? 1, column: error.column ?? 1, message: error.reason };
    }
    return { line: 1, column: 1, message: (error as Error).message };
  }
  root.walkComments((comment) => {
    const loc = { line: comment.source?.start?.line ?? 1, column: comment.source?.start?.column ?? 1 };
    const directive = parseSuppression(comment.text, loc, comment.source?.end?.line ?? loc.line);
    if (directive) file.suppressions.push(directive);
  });
  root.walkDecls((decl) => {
    const property = decl.prop.startsWith("--") ? decl.prop : decl.prop.toLowerCase();
    if (property.startsWith("--")) file.localCustomProperties.add(property);
    file.declarations.push({
      property,
      value: decl.value,
      loc: { line: decl.source?.start?.line ?? 1, column: decl.source?.start?.column ?? 1 },
      origin: "css",
      isCustomPropertyDefinition: property.startsWith("--"),
      inThemeBlock: inTheme(decl),
      fromNumber: false,
    });
  });
  root.walkAtRules("apply", (rule) => {
    const line = rule.source?.start?.line ?? 1;
    const column = (rule.source?.start?.column ?? 1) + "@apply ".length;
    for (const match of rule.params.matchAll(/\S+/g)) {
      file.classTokens.push({
        raw: match[0],
        loc: { line, column: column + match.index },
        parsed: parseClass(match[0]),
        origin: "css-apply",
      });
    }
  });
  return null;
}
