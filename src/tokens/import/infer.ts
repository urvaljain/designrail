import { isColorLiteral, parseDimension, soleVarReference } from "../../checker/parsers/css-values.js";
import type { TokenType } from "../schema.js";

/** Name prefixes (after "--") that state a token type explicitly. Longest prefixes first. */
const PREFIXES: [string, TokenType][] = [
  ["font-family-", "fontFamily"],
  ["font-weight-", "fontWeight"],
  ["font-size-", "fontSize"],
  ["line-height-", "lineHeight"],
  ["border-radius-", "radius"],
  ["box-shadow-", "shadow"],
  ["breakpoint-", "breakpoint"],
  ["text-size-", "fontSize"],
  ["elevation-", "shadow"],
  ["spacing-", "spacing"],
  ["leading-", "lineHeight"],
  ["rounded-", "radius"],
  ["colors-", "color"],
  ["shadow-", "shadow"],
  ["radius-", "radius"],
  ["screen-", "breakpoint"],
  ["color-", "color"],
  ["space-", "spacing"],
  ["font-", "fontFamily"],
];
const EXACT: Record<string, TokenType> = {
  radius: "radius",
  spacing: "spacing",
  space: "spacing",
  shadow: "shadow",
  "font-family": "fontFamily",
  "font-sans": "fontFamily",
  "font-serif": "fontFamily",
  "font-mono": "fontFamily",
};

export interface Inference {
  type: TokenType | null;
  /** Name without the type prefix ("--color-brand" -> "brand"). */
  rest: string;
  reason?: string;
}

const FONT_WEIGHT_KEYWORDS = new Set(["normal", "bold", "lighter", "bolder"]);

/** Checks a value is plausible for a type. Aliases (var()) and calc() are always plausible. */
export function plausibleForType(type: TokenType, value: string): boolean {
  const v = value.trim();
  if (soleVarReference(v) || /^calc\(/i.test(v) || /^clamp\(|^min\(|^max\(/i.test(v))
    return type !== "fontFamily";
  const dim = parseDimension(v);
  switch (type) {
    case "color":
      return isColorLiteral(v) || /^(transparent|currentcolor|white|black)$/i.test(v);
    case "spacing":
    case "fontSize":
    case "radius":
    case "breakpoint":
      return dim !== null && (dim.unit !== "" || dim.number === 0);
    case "fontWeight":
      return (
        (dim !== null && dim.unit === "" && dim.number >= 1 && dim.number <= 1000) ||
        FONT_WEIGHT_KEYWORDS.has(v)
      );
    case "lineHeight":
      return dim !== null || v === "normal";
    case "fontFamily":
      return dim === null && !isColorLiteral(v);
    case "shadow":
      return /\d/.test(v) || v === "none";
  }
}

/** Infers a token type from a CSS custom property name and value. Never guesses on ambiguity. */
export function inferCssVariable(variable: string, value: string): Inference {
  const bare = variable.replace(/^--/, "");
  if (EXACT[bare]) {
    const type = EXACT[bare]!;
    return plausibleForType(type, value)
      ? { type, rest: "default" }
      : { type: null, rest: bare, reason: `name suggests ${type} but value "${value}" does not fit` };
  }
  for (const [prefix, type] of PREFIXES) {
    if (bare.startsWith(prefix) && bare.length > prefix.length) {
      const rest = bare.slice(prefix.length);
      if (plausibleForType(type, value)) return { type, rest };
      if (
        type === "fontFamily" &&
        plausibleForType("fontWeight", value) &&
        /^(thin|light|normal|medium|semibold|bold|black|extra)/.test(rest)
      ) {
        return { type: "fontWeight", rest };
      }
      return { type: null, rest: bare, reason: `name suggests ${type} but value "${value}" does not fit` };
    }
  }
  if (isColorLiteral(value)) return { type: "color", rest: bare };
  if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/.test(value.trim())) {
    return {
      type: null,
      rest: bare,
      reason: "looks like bare HSL channels; type is ambiguous without hsl()",
    };
  }
  return {
    type: null,
    rest: bare,
    reason: "type is ambiguous (no recognized name prefix and value is not a color)",
  };
}
