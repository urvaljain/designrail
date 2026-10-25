import type { Token, TokenType } from "../schema.js";

export const IMPORT_FORMATS = ["native", "dtcg", "css", "tailwind-v3", "tailwind-v4"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export interface ImportedToken {
  name: string;
  token: Token;
}

/** Adds references to an already-registered token that owns `cssVariable` (e.g. @theme inline -> :root var). */
export interface ReferenceAttachment {
  cssVariable: string;
  type: TokenType;
  tailwindKey?: string;
  extraCssVariable?: string;
  origin: string;
  /** Registered instead when no token owns cssVariable (keeps the Tailwind key checkable). */
  fallback?: ImportedToken;
}

export interface SkippedEntry {
  name: string;
  reason: string;
  line?: number;
}

export interface ImportResult {
  format: ImportFormat;
  sourceFile: string;
  tokens: ImportedToken[];
  attachments: ReferenceAttachment[];
  skipped: SkippedEntry[];
  notes: string[];
}

export interface ImportOptions {
  /** Type applied to entries whose type cannot be determined. */
  assumeType?: TokenType;
  /** DTCG: derive CSS variables from token paths (color.brand -> --color-brand). */
  deriveCssVariables?: boolean;
}

export const TYPE_GROUP: Record<TokenType, string> = {
  color: "color",
  spacing: "spacing",
  fontFamily: "font-family",
  fontSize: "font-size",
  fontWeight: "font-weight",
  lineHeight: "line-height",
  radius: "radius",
  shadow: "shadow",
  breakpoint: "breakpoint",
};
