import { normalizeValue } from "../../checker/parsers/css-values.js";
import { ALIAS_PATTERN, TOKEN_NAME_PATTERN, type TokenType } from "../schema.js";
import { plausibleForType } from "./infer.js";
import type { ImportOptions, ImportResult } from "./types.js";

/** Path segment hints used to classify DTCG "dimension" tokens. Ambiguous dimensions are skipped. */
const DIMENSION_HINTS: [RegExp, TokenType][] = [
  [/^(spacing|space|spaces|gap|gaps|inset)$/i, "spacing"],
  [/^(radius|radii|rounded|border-radius|borderradius)$/i, "radius"],
  [/^(font-size|fontsize|font-sizes|fontsizes|text-size)$/i, "fontSize"],
  [/^(breakpoint|breakpoints|screen|screens)$/i, "breakpoint"],
  [/^(line-height|lineheight|line-heights|lineheights|leading)$/i, "lineHeight"],
];

interface Group {
  type?: string;
}

/**
 * Imports a documented subset of the Design Tokens Community Group format:
 * nested groups, $value, $type (inherited from groups), $description, and "{alias}" values.
 * Supported $type values: color, dimension (classified by group name), fontFamily, fontWeight,
 * number (only under line-height groups), shadow (string or simple object). Others are skipped.
 */
export function importDtcg(data: unknown, sourceFile: string, options: ImportOptions): ImportResult {
  const result: ImportResult = {
    format: "dtcg",
    sourceFile,
    tokens: [],
    attachments: [],
    skipped: [],
    notes: [],
  };
  const derive = options.deriveCssVariables ?? true;
  if (derive)
    result.notes.push("CSS variables were derived from token paths (color.brand -> --color-brand).");

  const walk = (node: unknown, path: string[], inherited: Group): void => {
    if (!node || typeof node !== "object" || Array.isArray(node)) return;
    const obj = node as Record<string, unknown>;
    const group: Group = { type: typeof obj.$type === "string" ? obj.$type : inherited.type };
    if ("$value" in obj) {
      handleToken(obj, path, group);
      return;
    }
    for (const [key, child] of Object.entries(obj)) {
      if (key.startsWith("$")) continue;
      walk(child, [...path, key], group);
    }
  };

  const handleToken = (obj: Record<string, unknown>, path: string[], group: Group): void => {
    const name = path.join(".");
    if (!TOKEN_NAME_PATTERN.test(name)) {
      result.skipped.push({ name, reason: "token path contains unsupported characters" });
      return;
    }
    const dtcgType = group.type;
    const raw = obj.$value;
    const alias = typeof raw === "string" && ALIAS_PATTERN.test(raw.trim()) ? raw.trim() : null;
    let type: TokenType | null;
    switch (dtcgType) {
      case "color":
        type = "color";
        break;
      case "fontFamily":
        type = "fontFamily";
        break;
      case "fontWeight":
        type = "fontWeight";
        break;
      case "shadow":
        type = "shadow";
        break;
      case "dimension":
      case "number": {
        const hint = path
          .slice(0, -1)
          .reverse()
          .map((seg) => DIMENSION_HINTS.find(([re]) => re.test(seg))?.[1])
          .find(Boolean);
        type = hint ?? null;
        if (dtcgType === "number" && type !== "lineHeight") type = null;
        if (!type && options.assumeType) type = options.assumeType;
        if (!type) {
          result.skipped.push({
            name,
            reason: `${dtcgType} token without a recognized group name (spacing, radius, font-size, breakpoint, line-height)`,
          });
          return;
        }
        break;
      }
      case undefined:
        if (options.assumeType) {
          type = options.assumeType;
          break;
        }
        result.skipped.push({ name, reason: "no $type on the token or its groups" });
        return;
      default:
        result.skipped.push({ name, reason: `$type "${dtcgType}" is not supported` });
        return;
    }
    let value: string | number | string[] | null = alias;
    if (value === null) value = convertValue(type, raw);
    if (value === null) {
      result.skipped.push({ name, reason: `unsupported $value for ${type}` });
      return;
    }
    if (typeof value === "string" && !alias && !plausibleForType(type, value)) {
      result.skipped.push({ name, reason: `value "${value}" does not fit ${type}` });
      return;
    }
    result.tokens.push({
      name,
      token: {
        type,
        value,
        ...(typeof obj.$description === "string" ? { description: obj.$description } : {}),
        references: derive ? { cssVariables: [`--${path.join("-")}`] } : {},
        source: { file: sourceFile, format: "dtcg" },
      },
    });
  };

  walk(data, [], {});
  return result;
}

function convertValue(type: TokenType, raw: unknown): string | number | string[] | null {
  if (typeof raw === "string")
    return type === "fontFamily"
      ? raw.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""))
      : normalizeValue(raw);
  if (typeof raw === "number") return type === "fontWeight" || type === "lineHeight" ? raw : null;
  if (Array.isArray(raw) && type === "fontFamily" && raw.every((x) => typeof x === "string"))
    return raw as string[];
  if (raw && typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    if (type === "color" && typeof o.hex === "string") return o.hex;
    if (typeof o.value === "number" && typeof o.unit === "string") return `${o.value}${o.unit}`;
    if (type === "shadow") {
      const part = (v: unknown): string | null =>
        typeof v === "string"
          ? v
          : v && typeof v === "object" && typeof (v as { value?: unknown }).value === "number"
            ? `${(v as { value: number }).value}${(v as { unit?: string }).unit ?? "px"}`
            : null;
      const pieces = [part(o.offsetX), part(o.offsetY), part(o.blur), part(o.spread)];
      const color = typeof o.color === "string" ? o.color : null;
      if (pieces.every((p) => p !== null) && color) return `${pieces.join(" ")} ${color}`;
    }
  }
  return null;
}
