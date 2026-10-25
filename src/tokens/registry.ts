import { ALIAS_PATTERN, type Token, type TokenFile, type TokenType } from "./schema.js";

export interface RegistryToken extends Token {
  name: string;
  /** Final literal value after following aliases; undefined when unresolved. */
  resolved: string | number | string[] | undefined;
}

export interface TokenProblem {
  kind: "missing-alias" | "alias-cycle" | "type-mismatch" | "duplicate-reference";
  token: string;
  message: string;
}

export interface TokenRegistry {
  tokens: RegistryToken[];
  byName: Map<string, RegistryToken>;
  byCssVariable: Map<string, RegistryToken>;
  /** tailwind theme key -> tokens with that key, per type ("brand" -> color.brand). */
  byTailwindKey: Map<TokenType, Map<string, RegistryToken>>;
  problems: TokenProblem[];
}

export function aliasTarget(value: Token["value"]): string | null {
  if (typeof value !== "string") return null;
  const match = ALIAS_PATTERN.exec(value.trim());
  return match ? match[1]!.trim() : null;
}

export function buildRegistry(file: TokenFile): TokenRegistry {
  const problems: TokenProblem[] = [];
  const names = Object.keys(file.tokens).sort();
  const byName = new Map<string, RegistryToken>();
  for (const name of names) {
    byName.set(name, { ...file.tokens[name]!, name, resolved: undefined });
  }

  const resolving = new Set<string>();
  const done = new Set<string>();
  const resolve = (token: RegistryToken, chain: string[]): RegistryToken["resolved"] => {
    if (done.has(token.name)) return token.resolved;
    if (resolving.has(token.name)) {
      const cycle = [...chain.slice(chain.indexOf(token.name)), token.name].join(" -> ");
      problems.push({ kind: "alias-cycle", token: token.name, message: `Alias cycle: ${cycle}` });
      return undefined;
    }
    resolving.add(token.name);
    const target = aliasTarget(token.value);
    let resolved: RegistryToken["resolved"];
    if (target === null) {
      resolved = token.unresolved ? undefined : token.value;
    } else {
      const next = byName.get(target);
      if (!next) {
        problems.push({
          kind: "missing-alias",
          token: token.name,
          message: `Token ${token.name} refers to missing token {${target}}`,
        });
      } else {
        if (next.type !== token.type) {
          problems.push({
            kind: "type-mismatch",
            token: token.name,
            message: `Token ${token.name} (${token.type}) aliases ${next.name} (${next.type})`,
          });
        }
        resolved = resolve(next, [...chain, token.name]);
      }
    }
    resolving.delete(token.name);
    done.add(token.name);
    token.resolved = resolved;
    return resolved;
  };
  for (const token of byName.values()) resolve(token, []);

  const byCssVariable = new Map<string, RegistryToken>();
  const byTailwindKey = new Map<TokenType, Map<string, RegistryToken>>();
  for (const token of byName.values()) {
    for (const variable of token.references?.cssVariables ?? []) {
      const existing = byCssVariable.get(variable);
      if (existing && existing.name !== token.name) {
        problems.push({
          kind: "duplicate-reference",
          token: token.name,
          message: `CSS variable ${variable} is claimed by both ${existing.name} and ${token.name}`,
        });
        continue;
      }
      byCssVariable.set(variable, token);
    }
    for (const key of token.references?.tailwindKeys ?? []) {
      let perType = byTailwindKey.get(token.type);
      if (!perType) byTailwindKey.set(token.type, (perType = new Map()));
      const existing = perType.get(key);
      if (existing && existing.name !== token.name) {
        problems.push({
          kind: "duplicate-reference",
          token: token.name,
          message: `Tailwind key "${key}" (${token.type}) is claimed by both ${existing.name} and ${token.name}`,
        });
        continue;
      }
      perType.set(key, token);
    }
  }

  return {
    tokens: [...byName.values()],
    byName,
    byCssVariable,
    byTailwindKey,
    problems: dedupeProblems(problems),
  };
}

function dedupeProblems(problems: TokenProblem[]): TokenProblem[] {
  const seen = new Set<string>();
  return problems.filter((p) => {
    const key = `${p.kind}:${p.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function tokensOfType(registry: TokenRegistry, type: TokenType): RegistryToken[] {
  return registry.tokens.filter((t) => t.type === type);
}

export function formatTokenValue(value: RegistryToken["resolved"] | Token["value"]): string {
  if (value === undefined) return "(unresolved)";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}
