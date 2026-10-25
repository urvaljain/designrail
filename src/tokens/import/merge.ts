import { soleVarReference } from "../../checker/parsers/css-values.js";
import { buildRegistry, type TokenProblem } from "../registry.js";
import { tokenFileSchema, type Token, type TokenFile } from "../schema.js";
import { stableStringify } from "../../utilities/hash.js";
import type { ImportResult } from "./types.js";

export interface MergeConflict {
  name: string;
  existing: Token;
  incoming: Token;
}

export interface MergeOutcome {
  file: TokenFile;
  added: string[];
  changed: string[];
  unchanged: string[];
  conflicts: MergeConflict[];
  replaced: string[];
  /** Attachments whose target CSS variable is not registered. */
  unmatchedAttachments: ImportResult["attachments"];
  problems: TokenProblem[];
}

function unionSorted(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  const set = new Set([...(a ?? []), ...(b ?? [])]);
  return set.size > 0 ? [...set].sort() : undefined;
}

function mergeReferences(a: Token["references"], b: Token["references"]): Token["references"] {
  const cssVariables = unionSorted(a?.cssVariables, b?.cssVariables);
  const tailwindKeys = unionSorted(a?.tailwindKeys, b?.tailwindKeys);
  if (!cssVariables && !tailwindKeys) return undefined;
  return { ...(cssVariables ? { cssVariables } : {}), ...(tailwindKeys ? { tailwindKeys } : {}) };
}

function clean(token: Token): Token {
  const out: Token = { ...token };
  if (out.references && !out.references.cssVariables?.length && !out.references.tailwindKeys?.length)
    delete out.references;
  return out;
}

/**
 * Merges imported tokens into an existing file without mutating it.
 * - New names are added.
 * - Same type and value: references are unioned (reported as changed when something was added).
 * - Different type or value: a conflict. The existing token is kept unless `replace` is true.
 * Tokens whose value is exactly var(--x) become aliases when a token owns --x.
 */
export function mergeTokens(
  existing: TokenFile,
  imported: ImportResult,
  options: { replace: boolean },
): MergeOutcome {
  const tokens: Record<string, Token> = structuredClone(existing.tokens);
  const outcome: Omit<MergeOutcome, "file" | "problems"> = {
    added: [],
    changed: [],
    unchanged: [],
    conflicts: [],
    replaced: [],
    unmatchedAttachments: [],
  };

  for (const { name, token: incomingRaw } of imported.tokens) {
    const incoming = clean(incomingRaw);
    const current = tokens[name];
    if (!current) {
      tokens[name] = incoming;
      outcome.added.push(name);
      continue;
    }
    const sameDesign =
      current.type === incoming.type && stableStringify(current.value) === stableStringify(incoming.value);
    if (sameDesign) {
      const merged = clean({
        ...current,
        ...(current.description || !incoming.description ? {} : { description: incoming.description }),
        references: mergeReferences(current.references, incoming.references),
      });
      if (stableStringify(merged) !== stableStringify(current)) {
        tokens[name] = merged;
        outcome.changed.push(name);
      } else {
        outcome.unchanged.push(name);
      }
      continue;
    }
    outcome.conflicts.push({ name, existing: current, incoming });
    if (options.replace) {
      tokens[name] = clean({
        ...incoming,
        references: mergeReferences(current.references, incoming.references),
      });
      outcome.replaced.push(name);
    }
  }

  // Index CSS variable ownership after additions so attachments and aliases can find owners.
  const owners = new Map<string, string>();
  for (const [name, token] of Object.entries(tokens)) {
    for (const v of token.references?.cssVariables ?? []) if (!owners.has(v)) owners.set(v, name);
  }

  for (const attachment of imported.attachments) {
    const ownerName = owners.get(attachment.cssVariable);
    const owner = ownerName ? tokens[ownerName] : undefined;
    if (!ownerName || !owner || owner.type !== attachment.type) {
      const fallback = attachment.fallback;
      if (!ownerName && fallback && !tokens[fallback.name]) {
        // No token owns the variable (for example shadcn-style HSL channels): register the
        // Tailwind key itself so utilities such as bg-background stay checkable.
        tokens[fallback.name] = clean(fallback.token);
        outcome.added.push(fallback.name);
        continue;
      }
      outcome.unmatchedAttachments.push(attachment);
      continue;
    }
    const updated = clean({
      ...owner,
      references: mergeReferences(owner.references, {
        ...(attachment.tailwindKey ? { tailwindKeys: [attachment.tailwindKey] } : {}),
        ...(attachment.extraCssVariable ? { cssVariables: [attachment.extraCssVariable] } : {}),
      }),
    });
    if (stableStringify(updated) !== stableStringify(owner)) {
      tokens[ownerName] = updated;
      if (!outcome.added.includes(ownerName) && !outcome.changed.includes(ownerName))
        outcome.changed.push(ownerName);
    }
  }

  // Convert var(--x) values into aliases when a registered token owns --x.
  for (const name of [...outcome.added, ...outcome.replaced]) {
    const token = tokens[name]!;
    if (typeof token.value !== "string") continue;
    const variable = soleVarReference(token.value);
    const target = variable ? owners.get(variable) : undefined;
    if (target && target !== name && tokens[target]!.type === token.type) {
      const { unresolved: _drop, ...rest } = token;
      tokens[name] = { ...rest, value: `{${target}}` };
    }
  }

  const file: TokenFile = { schemaVersion: existing.schemaVersion, tokens };
  if (Object.keys(tokens).length === 0 && existing.$comment) file.$comment = existing.$comment;
  tokenFileSchema.parse(file);
  const problems = buildRegistry(file).problems;
  for (const list of [outcome.added, outcome.changed, outcome.unchanged]) list.sort();
  return { file, ...outcome, problems };
}
