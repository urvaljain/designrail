import type { z } from "zod";

export interface StructuredRequest<T> {
  /** Short stable name for logs and cost attribution, e.g. "resume.implied_skills". */
  task: string;
  system: string;
  prompt: string;
  schema: z.ZodType<T>;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface LLMUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface StructuredResponse<T> {
  data: T;
  usage: LLMUsage;
  model: string;
  provider: string;
}

export type LLMErrorKind = "unavailable" | "rate_limited" | "timeout" | "refused" | "invalid_output" | "config";

export class LLMError extends Error {
  constructor(
    public kind: LLMErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "LLMError";
  }
  /** Transient failures count toward the circuit breaker; config errors and refusals do not. */
  get transient(): boolean {
    return this.kind === "unavailable" || this.kind === "rate_limited" || this.kind === "timeout";
  }
}

/** The whole provider contract. Anything that can return schema-valid JSON can sit behind it. */
export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  generate<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>>;
}

// USD per million tokens, used only for cost estimates in the audit log. Unknown models cost 0
// and are reported as "unpriced" rather than guessed.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
  "claude-fable-5-2": [8, 40],
};

export function estimateCostUsd(model: string, usage: LLMUsage): number {
  const p = PRICES[model];
  if (!p) return 0;
  return (usage.inputTokens * p[0] + usage.outputTokens * p[1]) / 1_000_000;
}
