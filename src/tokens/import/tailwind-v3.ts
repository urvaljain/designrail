import { parse } from "@babel/parser";
import type * as t from "@babel/types";
import { normalizeValue, wrappedVarReference } from "../../checker/parsers/css-values.js";
import type { TokenType } from "../schema.js";
import { parseFamilyList } from "./css.js";
import { plausibleForType } from "./infer.js";
import { TYPE_GROUP, type ImportResult, type ImportedToken } from "./types.js";

/** theme keys DesignRail imports from a Tailwind v3 config, and their token types. */
const THEME_KEYS: Record<string, TokenType> = {
  colors: "color",
  spacing: "spacing",
  fontFamily: "fontFamily",
  fontSize: "fontSize",
  fontWeight: "fontWeight",
  lineHeight: "lineHeight",
  borderRadius: "radius",
  boxShadow: "shadow",
  screens: "breakpoint",
};

function unwrap(node: t.Node): t.Node {
  let current = node;
  while (
    current.type === "TSAsExpression" ||
    current.type === "TSSatisfiesExpression" ||
    current.type === "TSNonNullExpression" ||
    current.type === "ParenthesizedExpression" ||
    current.type === "TSTypeAssertion"
  ) {
    current = (current as t.TSAsExpression).expression;
  }
  return current;
}

function keyName(prop: t.ObjectProperty): string | null {
  if (prop.computed) return null;
  const key = prop.key;
  if (key.type === "Identifier") return key.name;
  if (key.type === "StringLiteral") return key.value;
  if (key.type === "NumericLiteral") return String(key.value);
  return null;
}

function staticString(node: t.Node): string | null {
  const n = unwrap(node);
  if (n.type === "StringLiteral") return n.value;
  if (n.type === "NumericLiteral") return String(n.value);
  if (n.type === "TemplateLiteral" && n.expressions.length === 0)
    return n.quasis.map((q) => q.value.cooked ?? "").join("");
  return null;
}

function line(node: t.Node): number {
  return node.loc?.start.line ?? 1;
}

/**
 * Reads a Tailwind v3 config statically: `module.exports = {...}`, `export default {...}`,
 * or an exported identifier bound to an object literal. Only literal values are imported;
 * computed values, functions, spreads, plugins, and presets are reported, never evaluated.
 */
export function importTailwindV3(text: string, sourceFile: string): ImportResult {
  const result: ImportResult = {
    format: "tailwind-v3",
    sourceFile,
    tokens: [],
    attachments: [],
    skipped: [],
    notes: [],
  };
  const ast = parse(text, { sourceType: "unambiguous", plugins: ["typescript"] });
  const bindings = new Map<string, t.Node>();
  let exported: t.Node | null = null;

  for (const statement of ast.program.body) {
    if (statement.type === "VariableDeclaration") {
      for (const d of statement.declarations) {
        if (d.id.type === "Identifier" && d.init) bindings.set(d.id.name, d.init);
      }
    } else if (statement.type === "ExportDefaultDeclaration") {
      exported = statement.declaration;
    } else if (
      statement.type === "ExpressionStatement" &&
      statement.expression.type === "AssignmentExpression" &&
      statement.expression.left.type === "MemberExpression" &&
      statement.expression.left.object.type === "Identifier" &&
      statement.expression.left.object.name === "module" &&
      statement.expression.left.property.type === "Identifier" &&
      statement.expression.left.property.name === "exports"
    ) {
      exported = statement.expression.right;
    }
  }
  if (!exported) {
    result.notes.push("No `export default` or `module.exports` found; nothing imported.");
    return result;
  }
  let configNode = unwrap(exported);
  if (configNode.type === "Identifier") {
    const bound = bindings.get(configNode.name);
    if (!bound) {
      result.notes.push(
        `Exported identifier ${configNode.name} is not a local object literal; nothing imported.`,
      );
      return result;
    }
    configNode = unwrap(bound);
  }
  if (configNode.type === "CallExpression") {
    const first = configNode.arguments[0];
    const callee = configNode.callee.type === "Identifier" ? configNode.callee.name : "a function";
    result.notes.push(
      `Config is wrapped in ${callee}(...); only its literal object argument is inspected and the wrapper is not applied.`,
    );
    if (!first || unwrap(first).type !== "ObjectExpression") {
      result.notes.push("Wrapper argument is not an object literal; nothing imported.");
      return result;
    }
    configNode = unwrap(first);
  }
  if (configNode.type !== "ObjectExpression") {
    result.notes.push(`Config export is a ${configNode.type}, not an object literal; nothing imported.`);
    return result;
  }

  const top = objectEntries(configNode, result, "config");
  for (const [name, value] of top) {
    if (
      name === "plugins" &&
      unwrap(value).type === "ArrayExpression" &&
      (unwrap(value) as t.ArrayExpression).elements.length > 0
    ) {
      result.notes.push(
        "plugins are configured; utilities and theme values added by plugins are not imported.",
      );
    }
    if (name === "presets")
      result.notes.push("presets are configured; preset theme values are not imported.");
    if (name === "prefix")
      result.notes.push("A class prefix is configured; DesignRail's class checks do not apply prefixes.");
  }
  const theme = top.get("theme");
  if (!theme) {
    result.notes.push("No theme object found.");
    return result;
  }
  const themeNode = unwrap(theme);
  if (themeNode.type !== "ObjectExpression") {
    result.skipped.push({
      name: "theme",
      reason: "theme is not an object literal (computed)",
      line: line(themeNode),
    });
    return result;
  }
  const themeEntries = objectEntries(themeNode, result, "theme");
  const sections: { node: t.Node; path: string }[] = [];
  for (const [key, node] of themeEntries) {
    if (key === "extend") {
      const ext = unwrap(node);
      if (ext.type !== "ObjectExpression") {
        result.skipped.push({ name: "theme.extend", reason: "not an object literal", line: line(ext) });
        continue;
      }
      for (const [k, n] of objectEntries(ext, result, "theme.extend"))
        sections.push({ node: n, path: `theme.extend.${k}` });
    } else {
      sections.push({ node, path: `theme.${key}` });
      if (THEME_KEYS[key])
        result.notes.push(`theme.${key} replaces Tailwind's defaults for that key (not under extend).`);
    }
  }

  const names = new Set<string>();
  for (const { node, path } of sections) {
    const key = path.split(".").at(-1)!;
    const type = THEME_KEYS[key];
    if (!type) {
      result.skipped.push({ name: path, reason: "theme key not modeled by DesignRail", line: line(node) });
      continue;
    }
    const obj = unwrap(node);
    if (obj.type !== "ObjectExpression") {
      result.skipped.push({
        name: path,
        reason: "computed value (function, call, or reference) was not evaluated",
        line: line(obj),
      });
      continue;
    }
    collect(obj, [], type, path, result, sourceFile, names);
  }
  return result;
}

function objectEntries(node: t.ObjectExpression, result: ImportResult, path: string): Map<string, t.Node> {
  const map = new Map<string, t.Node>();
  for (const prop of node.properties) {
    if (prop.type === "SpreadElement") {
      result.skipped.push({ name: `${path}.…`, reason: "object spread was not evaluated", line: line(prop) });
      continue;
    }
    if (prop.type === "ObjectMethod") {
      result.skipped.push({
        name: `${path}.${prop.key.type === "Identifier" ? prop.key.name : "?"}`,
        reason: "method was not evaluated",
        line: line(prop),
      });
      continue;
    }
    const name = keyName(prop);
    if (name === null) {
      result.skipped.push({
        name: `${path}.[computed]`,
        reason: "computed key was not evaluated",
        line: line(prop),
      });
      continue;
    }
    map.set(name, prop.value);
  }
  return map;
}

function collect(
  obj: t.ObjectExpression,
  keyPath: string[],
  type: TokenType,
  path: string,
  result: ImportResult,
  sourceFile: string,
  names: Set<string>,
): void {
  for (const [key, valueNode] of objectEntries(obj, result, path)) {
    const node = unwrap(valueNode);
    const nextPath = key === "DEFAULT" ? keyPath : [...keyPath, key];
    const tailwindKey = nextPath.length === 0 ? "DEFAULT" : nextPath.join("-");
    const label = `${path}.${[...keyPath, key].join(".")}`;
    if (type === "color" && node.type === "ObjectExpression") {
      collect(node, nextPath, type, path, result, sourceFile, names);
      continue;
    }
    let raw: string | string[] | null = staticString(node);
    let partial: string | undefined;
    if (raw === null && node.type === "ArrayExpression") {
      if (type === "fontFamily") {
        const families: string[] = [];
        let first = true;
        for (const el of node.elements) {
          if (!el) continue;
          if (el.type === "SpreadElement") {
            partial = "includes a spread (for example defaultTheme.fontFamily.sans) that was not expanded";
            continue;
          }
          const s = staticString(el);
          if (s !== null)
            families.push(
              ...s
                .split(",")
                .map((f) => f.trim().replace(/^["']|["']$/g, ""))
                .filter(Boolean),
            );
          else if (!(first && el.type === "ObjectExpression")) partial = "contains a non-literal entry";
          first = false;
        }
        raw = families.length > 0 ? families : null;
      } else if (type === "fontSize") {
        const first = node.elements[0];
        raw = first && first.type !== "SpreadElement" ? staticString(first) : null;
        if (raw !== null && node.elements.length > 1)
          partial = "line-height/letter-spacing from the fontSize tuple were not imported";
      }
    }
    if (raw === null) {
      result.skipped.push({
        name: label,
        reason:
          node.type === "ObjectExpression"
            ? "object form is not supported for this key"
            : "computed or non-literal value was not evaluated",
        line: line(node),
      });
      continue;
    }
    const name = `${TYPE_GROUP[type]}.${tailwindKey === "DEFAULT" ? "default" : tailwindKey}`;
    if (names.has(name)) {
      result.skipped.push({ name: label, reason: `duplicate token name ${name}`, line: line(node) });
      continue;
    }
    if (typeof raw === "string") {
      const value = normalizeValue(raw);
      const variable = wrappedVarReference(value);
      if (variable) {
        result.attachments.push({
          cssVariable: variable,
          type,
          tailwindKey,
          origin: `${label} (line ${line(node)})`,
          fallback: {
            name,
            token: {
              type,
              value,
              references: { tailwindKeys: [tailwindKey] },
              unresolved: `references ${variable}`,
              source: { file: sourceFile, format: "tailwind-v3" },
            },
          },
        });
        names.add(name);
        continue;
      }
      if (!plausibleForType(type, value)) {
        result.skipped.push({
          name: label,
          reason: `value "${value}" does not fit ${type}`,
          line: line(node),
        });
        continue;
      }
      raw = type === "fontFamily" ? parseFamilyList(value) : value;
    }
    names.add(name);
    const entry: ImportedToken = {
      name,
      token: {
        type,
        value: raw,
        references: { tailwindKeys: [tailwindKey] },
        ...(partial ? { description: `Partially imported: ${partial}.` } : {}),
        source: { file: sourceFile, format: "tailwind-v3" },
      },
    };
    if (partial) result.notes.push(`${label}: ${partial}.`);
    result.tokens.push(entry);
  }
}
