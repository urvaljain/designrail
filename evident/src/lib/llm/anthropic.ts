import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { LLMError, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./types";

/**
 * Claude via the official SDK. Structured output is schema-constrained by the API and parsed by
 * the SDK, so a response either validates or surfaces as an LLMError.
 *
 * Server-side refusal fallbacks are enabled ("default" routing): if a safety classifier declines
 * a request, the API retries it on a fallback model inside the same call.
 */
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly model: string;
  private client: Anthropic;

  constructor(opts: { apiKey?: string; model?: string } = {}) {
    this.model = opts.model || "claude-opus-5-5";
    // With no explicit key the SDK resolves credentials from the environment.
    this.client = new Anthropic({ ...(opts.apiKey ? { apiKey: opts.apiKey } : {}), maxRetries: 1 });
  }

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    try {
      const message = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
          output_config: { format: betaZodOutputFormat(req.schema) },
        },
        { timeout: req.timeoutMs ?? 45_000 },
      );
      if (message.stop_reason === "refusal") throw new LLMError("refused", "The model declined this request.");
      if (message.stop_reason === "max_tokens") throw new LLMError("invalid_output", "The response was cut off before it completed.");
      if (message.parsed_output === null || message.parsed_output === undefined) throw new LLMError("invalid_output", "The response did not match the expected schema.");
      return {
        data: message.parsed_output as T,
        usage: { inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens },
        model: message.model,
        provider: this.name,
      };
    } catch (err) {
      if (err instanceof LLMError) throw err;
      if (err instanceof Anthropic.APIConnectionTimeoutError) throw new LLMError("timeout", "The model request timed out.");
      if (err instanceof Anthropic.APIConnectionError) throw new LLMError("unavailable", "Could not reach the model provider.");
      if (err instanceof Anthropic.RateLimitError) throw new LLMError("rate_limited", "The model provider is rate limiting requests.");
      if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new LLMError("config", "The model provider rejected the configured credentials.");
      if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) throw new LLMError("config", `The model provider rejected the request (${err.status}).`);
      if (err instanceof Anthropic.APIError) throw new LLMError((err.status ?? 500) >= 500 ? "unavailable" : "config", `Model provider error (${err.status ?? "unknown"}).`);
      throw new LLMError("invalid_output", err instanceof Error ? err.message : "Unknown model error.");
    }
  }
}
