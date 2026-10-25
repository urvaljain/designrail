import type { RegistryToken } from "./registry.js";
import type { TokenType } from "./schema.js";

/** Representative Tailwind utilities per token type (the checker accepts any utility of the matching family). */
const TAILWIND_EXAMPLE_PREFIXES: Record<TokenType, string[]> = {
  color: ["bg", "text", "border"],
  spacing: ["p", "m", "gap"],
  fontFamily: ["font"],
  fontSize: ["text"],
  fontWeight: ["font"],
  lineHeight: ["leading"],
  radius: ["rounded"],
  shadow: ["shadow"],
  breakpoint: [],
};

export function tailwindExamples(type: TokenType, key: string): string[] {
  if (type === "breakpoint") return [`${key}:`];
  return TAILWIND_EXAMPLE_PREFIXES[type].map((prefix) => (key === "DEFAULT" ? prefix : `${prefix}-${key}`));
}

/** Code references for a token: var(--x) and example utilities. */
export function tokenUsage(token: RegistryToken, tailwind: boolean): string[] {
  const out: string[] = [];
  for (const variable of token.references?.cssVariables ?? []) out.push(`var(${variable})`);
  if (tailwind)
    for (const key of token.references?.tailwindKeys ?? []) out.push(...tailwindExamples(token.type, key));
  return out;
}

export const TOKEN_TYPE_LABEL: Record<TokenType, string> = {
  color: "Colors",
  spacing: "Spacing",
  fontFamily: "Font families",
  fontSize: "Font sizes",
  fontWeight: "Font weights",
  lineHeight: "Line heights",
  radius: "Radii",
  shadow: "Shadows",
  breakpoint: "Breakpoints",
};
