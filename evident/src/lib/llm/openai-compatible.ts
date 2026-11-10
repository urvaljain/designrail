import { z } from "zod";
import { LLMError, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./types";

/**
 * Any endpoint that speaks the widely-implemented `/chat/completions` protocol with JSON-schema
 * response formats (hosted or self-hosted). Kept dependency-free on purpose: this file is the
 * proof that nothing above the provider interface depends on one vendor.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = "openai-compatible";
  readonly model: string;

  constructor(private opts: { baseUrl: string; apiKey?: string; model: string; fetchImpl?: typeof fetch }) {
    this.model = opts.model;
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    const doFetch = this.opts.fetchImpl ?? fetch;
    let res: Response;
    try {
      res = await doFetch(`${this.opts.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", ...(this.opts.apiKey ? { authorization: `Bearer ${this.opts.apiKey}` } : {}) },
        signal: AbortSignal.timeout(req.timeoutMs ?? 45_000),
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens ?? 4000,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.prompt },
          ],
          response_format: { type: "json_schema", json_schema: { name: req.task.replace(/[^a-zA-Z0-9_-]/g, "_"), strict: true, schema: z.toJSONSchema(req.schema) } },
        }),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new LLMError(timedOut ? "timeout" : "unavailable", timedOut ? "The model request timed out." : "Could not reach the model provider.");
    }
    if (res.status === 429) throw new LLMError("rate_limited", "The model provider is rate limiting requests.");
    if (res.status === 401 || res.status === 403) throw new LLMError("config", "The model provider rejected the configured credentials.");
    if (res.status >= 500) throw new LLMError("unavailable", `Model provider error (${res.status}).`);
    if (!res.ok) throw new LLMError("config", `The model provider rejected the request (${res.status}).`);

    let body: { choices?: { message?: { content?: string; refusal?: string | null } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number }; model?: string };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new LLMError("invalid_output", "The provider returned a non-JSON response.");
    }
    const msg = body.choices?.[0]?.message;
    if (msg?.refusal) throw new LLMError("refused", "The model declined this request.");
    let parsed: unknown;
    try {
      parsed = JSON.parse(msg?.content ?? "");
    } catch {
      throw new LLMError("invalid_output", "The model did not return valid JSON.");
    }
    const check = req.schema.safeParse(parsed);
    if (!check.success) throw new LLMError("invalid_output", "The response did not match the expected schema.");
    return {
      data: check.data,
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
      model: body.model ?? this.model,
      provider: this.name,
    };
  }
}
