import { z } from "zod";

export const TOKENS_SCHEMA_VERSION = 1;

export const TOKEN_TYPES = [
  "color",
  "spacing",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "radius",
  "shadow",
  "breakpoint",
] as const;
export type TokenType = (typeof TOKEN_TYPES)[number];

export const TOKEN_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/;
export const CSS_VARIABLE_PATTERN = /^--[A-Za-z0-9_-]+$/;
/** Alias syntax shared with the Design Tokens Community Group format: "{group.name}". */
export const ALIAS_PATTERN = /^\{([^{}]+)\}$/;

export const tokenSchema = z.strictObject({
  type: z.enum(TOKEN_TYPES),
  /** A literal value with its unit ("16px", "#2563eb"), a family list, a number, or an alias "{other.token}". */
  value: z.union([z.string().min(1), z.number(), z.array(z.string().min(1)).min(1)]),
  description: z.string().optional(),
  /** How code refers to this token. Values describe the design; references describe usage. */
  references: z
    .strictObject({
      cssVariables: z
        .array(z.string().regex(CSS_VARIABLE_PATTERN, "CSS variables must start with --"))
        .optional(),
      tailwindKeys: z.array(z.string().min(1)).optional(),
    })
    .optional(),
  /** Set when the value could not be resolved statically (for example calc() or an unknown var()). */
  unresolved: z.string().optional(),
  source: z
    .strictObject({
      file: z.string(),
      format: z.string(),
    })
    .optional(),
});
export type Token = z.infer<typeof tokenSchema>;

export const tokenFileSchema = z.strictObject({
  $comment: z.string().optional(),
  schemaVersion: z.literal(TOKENS_SCHEMA_VERSION),
  tokens: z.record(z.string().regex(TOKEN_NAME_PATTERN, "Invalid token name"), tokenSchema),
});
export type TokenFile = z.infer<typeof tokenFileSchema>;

export const UNCONFIGURED_TOKENS_COMMENT =
  "Unconfigured: no design tokens have been imported yet. Run `designrail import-tokens <file>` or edit this file. DesignRail never invents a design system.";

export function emptyTokenFile(): TokenFile {
  return { $comment: UNCONFIGURED_TOKENS_COMMENT, schemaVersion: TOKENS_SCHEMA_VERSION, tokens: {} };
}
