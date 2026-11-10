import type { z } from "zod";
import { db, json } from "../db";
import { assist, getProvider, type AssistResult, type Verified } from "../llm/router";
import type { StructuredRequest } from "../llm/types";

/**
 * Agent runtime. An agent is ordinary code that may only act through declared tools.
 * Every run writes one AgentRun row and one AgentStep row per tool call, so "what did the
 * agent do, with what input, and what came back" is always answerable after the fact.
 */
export interface Tool<I, O> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  run: (input: I) => Promise<O> | O;
}

export function tool<I, O>(def: Tool<I, O>): Tool<I, O> {
  return def;
}

export class ToolInputError extends Error {}

interface StepRecord {
  tool: string;
  input: unknown;
  output: unknown;
  status: "ok" | "error" | "rejected";
  latencyMs: number;
  error?: string;
}

const MAX_STR = 400;
/** Keep audit rows small and free of whole documents: long strings are cut, big arrays summarised. */
export function summarize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length > MAX_STR ? `${value.slice(0, MAX_STR)}… [${value.length} chars]` : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (depth > 4) return "[nested]";
  if (Array.isArray(value)) {
    const head = value.slice(0, 12).map((v) => summarize(v, depth + 1));
    return value.length > 12 ? [...head, `… ${value.length - 12} more`] : head;
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (/password|token|secret|rawText/i.test(k)) continue;
      out[k] = summarize(v, depth + 1);
    }
    return out;
  }
  return String(value);
}

export class AgentRun {
  readonly steps: StepRecord[] = [];
  readonly notes: string[] = [];
  degraded = false;
  provider = "deterministic";
  model: string | null = null;
  inputTokens = 0;
  outputTokens = 0;
  costUsd = 0;
  /** False when the user's monthly allowance of model-backed runs is used up. */
  llmAllowed = true;

  /** Call a tool. Input is validated against the tool's schema before the tool runs. */
  async call<I, O>(t: Tool<I, O>, input: I): Promise<O> {
    const started = Date.now();
    const parsed = t.input.safeParse(input);
    if (!parsed.success) {
      const error = `invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`;
      this.steps.push({ tool: t.name, input: summarize(input), output: null, status: "error", latencyMs: 0, error });
      throw new ToolInputError(`${t.name}: ${error}`);
    }
    try {
      const output = await t.run(parsed.data);
      this.steps.push({ tool: t.name, input: summarize(parsed.data), output: summarize(output), status: "ok", latencyMs: Date.now() - started });
      return output;
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      this.steps.push({ tool: t.name, input: summarize(parsed.data), output: null, status: "error", latencyMs: Date.now() - started, error });
      throw err;
    }
  }

  /** Ask a model for help, with a deterministic fallback and a grounding check. Logged as a step. */
  async assist<T>(req: StructuredRequest<T>, fallback: () => T, verify?: (data: T) => Verified<T>): Promise<AssistResult<T>> {
    const res: AssistResult<T> = this.llmAllowed
      ? await assist(req, fallback, verify)
      : { data: fallback(), source: "deterministic", degradedReason: "ai_allowance_reached", rejected: [], provider: "deterministic", model: null, usage: { inputTokens: 0, outputTokens: 0 }, costUsd: 0, latencyMs: 0 };
    this.inputTokens += res.usage.inputTokens;
    this.outputTokens += res.usage.outputTokens;
    this.costUsd += res.costUsd;
    if (res.source === "llm") {
      this.provider = res.provider;
      this.model = res.model;
    }
    if (res.degradedReason) {
      this.degraded = true;
      this.notes.push(`${req.task}: used deterministic fallback (${res.degradedReason})`);
    }
    for (const r of res.rejected) this.notes.push(`${req.task}: rejected model output — ${r}`);
    this.steps.push({
      tool: `llm:${req.task}`,
      input: { promptChars: req.prompt.length },
      output: { source: res.source, degradedReason: res.degradedReason ?? null, rejected: res.rejected.length },
      status: res.rejected.length > 0 && res.source === "deterministic" ? "rejected" : "ok",
      latencyMs: res.latencyMs,
    });
    return res;
  }

  note(message: string): void {
    this.notes.push(message);
  }
}

export interface AgentOutcome<T> {
  runId: string;
  status: "ok" | "degraded" | "failed";
  output: T;
  notes: string[];
}

export class AgentFailure extends Error {
  constructor(
    message: string,
    public runId: string,
  ) {
    super(message);
    this.name = "AgentFailure";
  }
}

export async function runAgent<T>(
  meta: { agent: string; userId: string | null; trigger: string; input: unknown },
  body: (run: AgentRun) => Promise<T>,
): Promise<AgentOutcome<T>> {
  const run = new AgentRun();
  const started = Date.now();
  if (meta.userId && getProvider()) run.llmAllowed = (await aiAllowance(meta.userId)).remaining > 0;
  let output: T | undefined;
  let error: string | undefined;
  try {
    output = await body(run);
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const status = error ? "failed" : run.degraded ? "degraded" : "ok";
  const row = await db.agentRun.create({
    data: {
      userId: meta.userId,
      agent: meta.agent,
      trigger: meta.trigger,
      status,
      inputSummary: json(summarize(meta.input)),
      output: output === undefined ? undefined : json(summarize(output)),
      provider: run.provider,
      model: run.model,
      inputTokens: run.inputTokens,
      outputTokens: run.outputTokens,
      costUsd: run.costUsd,
      latencyMs: Date.now() - started,
      notes: run.notes,
      error,
      steps: {
        create: run.steps.map((s, index) => ({ index, tool: s.tool, input: json(s.input), output: s.output === null ? undefined : json(s.output), status: s.status, latencyMs: s.latencyMs, error: s.error })),
      },
    },
    select: { id: true },
  });
  if (error) throw new AgentFailure(error, row.id);
  return { runId: row.id, status, output: output as T, notes: run.notes };
}

/** Monthly allowance of model-backed agent runs. Deterministic runs are never counted or limited. */
export async function aiAllowance(userId: string, now: Date = new Date()): Promise<{ used: number; limit: number; remaining: number }> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
  const limit = Number(user?.plan === "plus" ? (process.env.AI_RUNS_PLUS ?? 300) : (process.env.AI_RUNS_FREE ?? 30));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const used = await db.agentRun.count({ where: { userId, createdAt: { gte: monthStart }, provider: { not: "deterministic" } } });
  return { used, limit, remaining: Math.max(0, limit - used) };
}
