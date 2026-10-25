/**
 * Static parser for individual Tailwind class names. It understands variants (md:hover:),
 * important (!), negative values (-m-2), arbitrary values ([13px]), v4 variable shorthand
 * ((--x)), arbitrary properties ([color:red]), and opacity/line-height modifiers (/50).
 * It does not read the project's Tailwind config and makes no claim that a class exists.
 */
export interface ParsedClass {
  raw: string;
  variants: string[];
  important: boolean;
  negative: boolean;
  utility: string;
  arbitraryProperty?: { property: string; value: string };
  prefix?: string;
  value?: ClassValue;
}

export type ClassValue =
  | { kind: "arbitrary"; raw: string; hint?: string; modifier?: string }
  | { kind: "var"; name: string; hint?: string; modifier?: string }
  | { kind: "key"; key: string; modifier?: string };

export const COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-x",
  "border-y",
  "border-t",
  "border-r",
  "border-b",
  "border-l",
  "border-s",
  "border-e",
  "ring",
  "ring-offset",
  "inset-ring",
  "outline",
  "fill",
  "stroke",
  "divide",
  "placeholder",
  "from",
  "via",
  "to",
  "decoration",
  "accent",
  "caret",
  "shadow",
  "inset-shadow",
  "drop-shadow",
] as const;

/** Prefixes where a value is unambiguously a color (text/shadow/ring/... can also be sizes). */
export const COLOR_ONLY_PREFIXES = new Set([
  "bg",
  "fill",
  "stroke",
  "placeholder",
  "from",
  "via",
  "to",
  "accent",
  "caret",
]);

export const SPACING_PREFIXES = [
  "p",
  "px",
  "py",
  "pt",
  "pr",
  "pb",
  "pl",
  "ps",
  "pe",
  "m",
  "mx",
  "my",
  "mt",
  "mr",
  "mb",
  "ml",
  "ms",
  "me",
  "gap",
  "gap-x",
  "gap-y",
  "space-x",
  "space-y",
] as const;

const OTHER_PREFIXES = [
  "font",
  "leading",
  "rounded",
  "tracking",
  "w",
  "h",
  "size",
  "inset",
  "top",
  "left",
  "right",
  "bottom",
];

const ALL_PREFIXES = [...new Set<string>([...COLOR_PREFIXES, ...SPACING_PREFIXES, ...OTHER_PREFIXES])].sort(
  (a, b) => b.length - a.length,
);

export const SPACING_PREFIX_SET: ReadonlySet<string> = new Set(SPACING_PREFIXES);
export const COLOR_PREFIX_SET: ReadonlySet<string> = new Set(COLOR_PREFIXES);

/** Tailwind default palette color names (v3 and v4, including the v4.3 additions). */
export const DEFAULT_PALETTE =
  /^(slate|gray|zinc|neutral|stone|taupe|mauve|mist|olive|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(50|[1-9]00|950)$|^(black|white)$/;

export const COLOR_KEYWORD_KEYS = new Set(["transparent", "current", "inherit", "currentColor"]);

export const FONT_WEIGHT_KEYS = new Set([
  "thin",
  "extralight",
  "light",
  "normal",
  "medium",
  "semibold",
  "bold",
  "extrabold",
  "black",
]);

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of input) {
    if (ch === "[" || ch === "(") depth++;
    if (ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current);
  return parts;
}

/** Decodes Tailwind arbitrary-value syntax: underscores are spaces unless escaped. */
export function decodeArbitrary(value: string): string {
  return value
    .split("\\_")
    .map((part) => part.replace(/_/g, " "))
    .join("_");
}

function splitModifier(rest: string): { body: string; modifier?: string } {
  let depth = 0;
  for (let i = rest.length - 1; i >= 0; i--) {
    const ch = rest[i];
    if (ch === "]" || ch === ")") depth++;
    if (ch === "[" || ch === "(") depth--;
    if (ch === "/" && depth === 0) return { body: rest.slice(0, i), modifier: rest.slice(i + 1) };
  }
  return { body: rest };
}

const HINT = /^([a-z-]+):(.*)$/s;

function parseValue(rest: string): ClassValue {
  const { body, modifier } = splitModifier(rest);
  const mod = modifier ? { modifier } : {};
  if (body.startsWith("[") && body.endsWith("]")) {
    const inner = decodeArbitrary(body.slice(1, -1));
    const hinted = HINT.exec(inner);
    if (hinted && !hinted[1]!.startsWith("--") && !/^(url|var)$/.test(hinted[1]!)) {
      return { kind: "arbitrary", raw: hinted[2]!, hint: hinted[1]!, ...mod };
    }
    return { kind: "arbitrary", raw: inner, ...mod };
  }
  if (body.startsWith("(") && body.endsWith(")")) {
    const inner = body.slice(1, -1);
    const hinted = /^([a-z-]+):(--.*)$/.exec(inner);
    if (hinted) return { kind: "var", name: hinted[2]!, hint: hinted[1]!, ...mod };
    return { kind: "var", name: inner, ...mod };
  }
  return { kind: "key", key: body, ...mod };
}

export function parseClass(raw: string): ParsedClass {
  const segments = splitTopLevel(raw, ":");
  let utility = segments.pop() ?? "";
  const variants = segments;
  let important = false;
  if (utility.startsWith("!")) {
    important = true;
    utility = utility.slice(1);
  } else if (utility.endsWith("!")) {
    important = true;
    utility = utility.slice(0, -1);
  }
  let negative = false;
  if (utility.startsWith("-") && utility.length > 1) {
    negative = true;
    utility = utility.slice(1);
  }
  const parsed: ParsedClass = { raw, variants, important, negative, utility };
  if (utility.startsWith("[") && utility.endsWith("]")) {
    const inner = utility.slice(1, -1);
    const colon = inner.indexOf(":");
    if (colon > 0) {
      parsed.arbitraryProperty = {
        property: inner.slice(0, colon).trim().toLowerCase(),
        value: decodeArbitrary(inner.slice(colon + 1)),
      };
    }
    return parsed;
  }
  for (const prefix of ALL_PREFIXES) {
    if (utility.startsWith(`${prefix}-`)) {
      parsed.prefix = prefix;
      parsed.value = parseValue(utility.slice(prefix.length + 1));
      return parsed;
    }
  }
  return parsed;
}
