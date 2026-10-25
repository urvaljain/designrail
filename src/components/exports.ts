import { parse } from "@babel/parser";
import type * as t from "@babel/types";

export interface ExportInfo {
  named: string[];
  defaultName: string | null;
  hasDefault: boolean;
  hasStarExport: boolean;
}

function exportedName(node: t.Identifier | t.StringLiteral): string {
  return node.type === "Identifier" ? node.name : node.value;
}

function unwrapDefault(node: t.Node): t.Node {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "ParenthesizedExpression"
  ) {
    current = (current as t.TSAsExpression).expression;
  }
  return current;
}

/** Lists a module's exports statically. Throws a SyntaxError for unparseable source. */
export function inferExports(text: string, file: string): ExportInfo {
  const isTs = /\.(tsx?|mts|cts)$/.test(file);
  const ast = parse(text, {
    sourceType: "module",
    plugins: isTs ? ["typescript", "jsx"] : ["jsx"],
  });
  const info: ExportInfo = { named: [], defaultName: null, hasDefault: false, hasStarExport: false };
  for (const statement of ast.program.body) {
    if (statement.type === "ExportNamedDeclaration") {
      const decl = statement.declaration;
      if (decl) {
        if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id)
          info.named.push(decl.id.name);
        if (decl.type === "VariableDeclaration") {
          for (const d of decl.declarations) if (d.id.type === "Identifier") info.named.push(d.id.name);
        }
      }
      for (const spec of statement.specifiers) {
        if (spec.type !== "ExportSpecifier") continue;
        const name = exportedName(spec.exported);
        if (name === "default") {
          info.hasDefault = true;
          info.defaultName = spec.local.type === "Identifier" ? spec.local.name : null;
        } else {
          info.named.push(name);
        }
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      info.hasDefault = true;
      const decl = unwrapDefault(statement.declaration);
      if ((decl.type === "FunctionDeclaration" || decl.type === "ClassDeclaration") && decl.id)
        info.defaultName = decl.id.name;
      else if (decl.type === "Identifier") info.defaultName = decl.name;
    } else if (statement.type === "ExportAllDeclaration") {
      info.hasStarExport = true;
    }
  }
  info.named = [...new Set(info.named)].sort();
  return info;
}

export type ExportDecision =
  | { kind: "named" | "default"; reliable: true; note?: string }
  | { kind: null; reliable: false; reason: string };

export function decideExportKind(info: ExportInfo, name: string): ExportDecision {
  const named = info.named.includes(name);
  const asDefault = info.defaultName === name;
  if (named && asDefault)
    return {
      kind: "named",
      reliable: true,
      note: `${name} is exported both as named and default; recorded as named`,
    };
  if (named) return { kind: "named", reliable: true };
  if (asDefault) return { kind: "default", reliable: true };
  if (info.hasStarExport)
    return {
      kind: null,
      reliable: false,
      reason: `the file re-exports with "export *", so ${name}'s export cannot be confirmed`,
    };
  if (info.hasDefault)
    return {
      kind: null,
      reliable: false,
      reason: `the file has an anonymous default export; cannot confirm it is ${name}`,
    };
  return { kind: null, reliable: false, reason: `${name} is not exported from the file` };
}

/**
 * Infers an import specifier from tsconfig-style aliases ("@/*" -> ["src/*"]).
 * Returns null when no alias covers the file: relative specifiers depend on the importer.
 */
export function inferImportSpecifier(sourceFile: string, aliases: Record<string, string[]>): string | null {
  let modulePath = sourceFile.replace(/\.(tsx|ts|jsx|js|mts|cts|mjs|cjs)$/, "");
  if (modulePath.endsWith("/index")) modulePath = modulePath.slice(0, -"/index".length);
  let best: { specifier: string; length: number } | null = null;
  for (const [alias, targets] of Object.entries(aliases)) {
    for (const target of targets) {
      const clean = target.replace(/^\.\//, "");
      if (alias.endsWith("/*") && clean.endsWith("/*")) {
        const prefix = clean.slice(0, -1);
        if (modulePath.startsWith(prefix) && (!best || prefix.length > best.length)) {
          best = { specifier: alias.slice(0, -1) + modulePath.slice(prefix.length), length: prefix.length };
        }
      } else if (
        !alias.includes("*") &&
        clean.replace(/\.(tsx|ts|jsx|js)$/, "").replace(/\/index$/, "") === modulePath
      ) {
        best = { specifier: alias, length: Number.MAX_SAFE_INTEGER };
      }
    }
  }
  return best?.specifier ?? null;
}
