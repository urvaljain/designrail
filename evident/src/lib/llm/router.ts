import { AnthropicProvider } from "./anthropic";
import { OpenAICompatibleProvider } from "./openai-compatible";
import { estimateCostUsd, LLMError, type LLMProvider, type LLMUsage, type StructuredRequest } from "./types";

let override: LLMProvider | null | undefined;
let cached: LLMProvider | null | undefined;

/** Tests and evals inject a scripted provider here. `null` forces the deterministic engine. */
export function setProviderForTesting(p: LLMProvider | null | undefined): void {
  override = p;
  breaker.failures = 0;
  breaker.openUntil = 0;
}

export function getProvider(): LLMProvider | null {
  if (override !== undefined) return override;
  if (cached !== undefined) return cached;
  const kind = (process.env.LLM_PROVIDER ?? "none").toLowerCase();
  if (kind === "anthropic") {
    cached = new AnthropicProvider({ apiKey: process.env.ANTHROPIC_API_KEY || undefined, model: process.env.ANTHROPIC_MODEL || undefined });
  } else if (kind === "openai-compatible" && process.env.OPENAI_COMPATIBLE_BASE_URL && process.env.OPENAI_COMPATIBLE_MODEL) {
    cached = new OpenAICompatibleProvider({ baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL, apiKey: process.env.OPENAI_COMPATIBLE_API_KEY || undefined, model: process.env.OPENAI_COMPATIBLE_MODEL });
  } else {
    cached = null;
  }
  return cached;
}

// Circuit breaker: after repeated transient failures, stop calling the provider for a while so
// every request does not pay a timeout before falling back.
const breaker = { failures: 0, openUntil: 0 };
export const BREAKER_THRESHOLD = 3;
export const BREAKER_COOLDOWN_MS = 60_000;

export function breakerState(now = Date.now()): "closed" | "open" {
  return now < breaker.openUntil ? "open" : "closed";
}

export interface Verified<T> {
  ok: boolean;
  /** The data to keep (verification may drop individual ungrounded items). */
  data?: T;
  problems: string[];
}

export interface AssistResult<T> {
  data: T;
  source: "llm" | "deterministic";
  /** Why the deterministic path was used, when it was. */
  degradedReason?: string;
  rejected: string[];
  provider: string;
  model: string | null;
  usage: LLMUsage;
  costUsd: number;
  latencyMs: number;
}

/**
 * The only way agents talk to a model. The contract:
 *  - `fallback` is always able to answer on its own, so an outage degrades quality, never availability.
 *  - `verify` checks model output against ground truth; anything it rejects is dropped and logged.
 *  - The caller learns which path produced the result and why.
 */
export async function assist<T>(req: StructuredRequest<T>, fallback: () => T, verify?: (data: T) => Verified<T>): Promise<AssistResult<T>> {
  const started = Date.now();
  const provider = getProvider();
  const base = { rejected: [] as string[], usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0 };
  const deterministic = (reason: string): AssistResult<T> => ({ ...base, data: fallback(), source: "deterministic", degradedReason: reason, provider: "deterministic", model: null, latencyMs: Date.now() - started });

  if (!provider) return { ...deterministic("no_llm_configured"), degradedReason: undefined };
  if (breakerState() === "open") return deterministic("circuit_open");

  try {
    const res = await provider.generate(req);
    breaker.failures = 0;
    const costUsd = estimateCostUsd(res.model, res.usage);
    if (verify) {
      const v = verify(res.data);
      if (!v.ok || v.data === undefined) {
        return { ...deterministic("verification_failed"), rejected: v.problems, usage: res.usage, costUsd, provider: provider.name, model: res.model };
      }
      return { data: v.data, source: "llm", rejected: v.problems, provider: provider.name, model: res.model, usage: res.usage, costUsd, latencyMs: Date.now() - started };
    }
    return { data: res.data, source: "llm", rejected: [], provider: provider.name, model: res.model, usage: res.usage, costUsd, latencyMs: Date.now() - started };
  } catch (err) {
    const e = err instanceof LLMError ? err : new LLMError("invalid_output", err instanceof Error ? err.message : "unknown error");
    if (e.transient) {
      breaker.failures += 1;
      if (breaker.failures >= BREAKER_THRESHOLD) breaker.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
    }
    return deterministic(`llm_${e.kind}`);
  }
}
