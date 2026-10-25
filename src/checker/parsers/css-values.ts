import valueParser from "postcss-value-parser";

export const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
export const COLOR_FUNCTIONS = new Set([
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
]);
export const CSS_WIDE_KEYWORDS = new Set(["inherit", "initial", "unset", "revert", "revert-layer"]);

export interface ColorLiteral {
  text: string;
  kind: "hex" | "function";
}

export interface VarReference {
  name: string;
  fallback: string | null;
}

/**
 * Literal colors in a CSS value: hex words and color functions whose arguments contain no var().
 * Ignores url(...) contents and comments. var() fallbacks are reported separately via varReferences.
 */
export function findColorLiterals(value: string): ColorLiteral[] {
  const out: ColorLiteral[] = [];
  const walk = (nodes: valueParser.Node[]): void => {
    for (const node of nodes) {
      if (node.type === "word" && HEX_COLOR.test(node.value)) {
        out.push({ text: node.value, kind: "hex" });
      } else if (node.type === "function") {
        const name = node.value.toLowerCase();
        if (name === "url" || name === "var" || name === "env") continue;
        if (COLOR_FUNCTIONS.has(name)) {
          if (!containsFunction(node.nodes, "var"))
            out.push({ text: valueParser.stringify(node), kind: "function" });
          continue;
        }
        walk(node.nodes);
      }
    }
  };
  walk(valueParser(value).nodes);
  return out;
}

function containsFunction(nodes: valueParser.Node[], fn: string): boolean {
  for (const node of nodes) {
    if (node.type === "function") {
      if (node.value.toLowerCase() === fn) return true;
      if (containsFunction(node.nodes, fn)) return true;
    }
  }
  return false;
}

/** All var(--name[, fallback]) references in a value, including nested ones. */
export function varReferences(value: string): VarReference[] {
  const out: VarReference[] = [];
  const walk = (nodes: valueParser.Node[]): void => {
    for (const node of nodes) {
      if (node.type !== "function") continue;
      if (node.value.toLowerCase() === "var") {
        const first = node.nodes.find((n) => n.type === "word");
        const commaIndex = node.nodes.findIndex((n) => n.type === "div" && n.value === ",");
        const fallback =
          commaIndex >= 0 ? valueParser.stringify(node.nodes.slice(commaIndex + 1)).trim() || null : null;
        if (first && first.value.startsWith("--")) out.push({ name: first.value, fallback });
        if (commaIndex >= 0) walk(node.nodes.slice(commaIndex + 1));
      } else {
        walk(node.nodes);
      }
    }
  };
  walk(valueParser(value).nodes);
  return out;
}

/** Returns the variable name when the whole value is exactly var(--name) (no fallback). */
export function soleVarReference(value: string): string | null {
  const parsed = valueParser(value.trim()).nodes.filter((n) => n.type !== "space");
  if (parsed.length !== 1) return null;
  const node = parsed[0]!;
  if (node.type !== "function" || node.value.toLowerCase() !== "var") return null;
  const words = node.nodes.filter((n) => n.type !== "space");
  if (words.length !== 1 || words[0]!.type !== "word" || !words[0]!.value.startsWith("--")) return null;
  return words[0]!.value;
}

/**
 * When the value is a single var() reference, optionally wrapped in one color function
 * (shadcn-style "hsl(var(--primary))" or "rgb(var(--x) / <alpha-value>)"), returns the variable.
 */
export function wrappedVarReference(value: string): string | null {
  const direct = soleVarReference(value);
  if (direct) return direct;
  const nodes = valueParser(value.trim()).nodes.filter((n) => n.type !== "space");
  if (nodes.length !== 1 || nodes[0]!.type !== "function") return null;
  const fn = nodes[0] as valueParser.FunctionNode;
  if (!COLOR_FUNCTIONS.has(fn.value.toLowerCase())) return null;
  const refs = varReferences(value);
  if (refs.length !== 1) return null;
  const leftovers = fn.nodes.filter(
    (n) =>
      !(n.type === "function" && n.value === "var") &&
      n.type !== "space" &&
      !(n.type === "div" && (n.value === "/" || n.value === ",")) &&
      !(n.type === "word" && (n.value === "<alpha-value>" || /^\d*\.?\d+%?$/.test(n.value))),
  );
  return leftovers.length === 0 ? refs[0]!.name : null;
}

export interface Dimension {
  number: number;
  unit: string;
}

export function parseDimension(value: string): Dimension | null {
  const match = /^(-?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)$/.exec(value.trim());
  if (!match) return null;
  return { number: Number(match[1]), unit: match[2]!.toLowerCase() };
}

export function isColorLiteral(value: string): boolean {
  const trimmed = value.trim();
  if (HEX_COLOR.test(trimmed)) return true;
  const nodes = valueParser(trimmed).nodes.filter((n) => n.type !== "space");
  return (
    nodes.length === 1 &&
    nodes[0]!.type === "function" &&
    COLOR_FUNCTIONS.has(nodes[0]!.value.toLowerCase()) &&
    !containsFunction((nodes[0] as valueParser.FunctionNode).nodes, "var")
  );
}

/** Splits a value into space-separated top-level components ("8px 16px" -> ["8px","16px"]). */
export function splitSpaceComponents(value: string): string[] {
  return valueParser(value)
    .nodes.filter((n) => n.type !== "space" && n.type !== "comment")
    .map((n) => valueParser.stringify(n));
}

/** Splits on top-level commas, respecting quotes and parentheses. */
export function splitTopLevelCommas(value: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (const ch of value) {
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Normalizes a font family name for exact comparison (quotes removed, whitespace collapsed, case-folded). */
export function normalizeFamily(family: string): string {
  return family
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

export function normalizeValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}
