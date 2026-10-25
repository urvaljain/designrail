import { RULE_IDS } from "../config/schema.js";
import type { Loc, SuppressionDirective } from "./types.js";

const DIRECTIVE = "designrail-ignore-next-line";

/**
 * Parses "designrail-ignore-next-line DR001[,DR002] -- reason" from comment text.
 * Rule IDs and a reason (3+ characters) are required; there is no file-wide or all-rules form.
 */
export function parseSuppression(
  commentText: string,
  loc: Loc,
  endLine: number,
): SuppressionDirective | null {
  const text = commentText.replace(/^\s*\*+/gm, " ").trim();
  const index = text.indexOf(DIRECTIVE);
  if (index < 0) return null;
  const rest = text.slice(index + DIRECTIVE.length);
  const separator = rest.indexOf("--");
  const rulePart = separator >= 0 ? rest.slice(0, separator) : rest;
  const reason = separator >= 0 ? rest.slice(separator + 2).trim() : "";
  const rules = rulePart
    .split(/[\s,]+/)
    .map((r) => r.trim())
    .filter(Boolean);
  const base = { targetLine: endLine + 1, loc, rules, reason };
  if (rules.length === 0) return { ...base, valid: false, problem: "lists no rule IDs" };
  const unknown = rules.filter((r) => !(RULE_IDS as readonly string[]).includes(r));
  if (unknown.length > 0)
    return { ...base, valid: false, problem: `unknown rule ID(s): ${unknown.join(", ")}` };
  if (reason.length < 3) return { ...base, valid: false, problem: 'is missing a reason (use "-- <reason>")' };
  return { ...base, valid: true };
}
