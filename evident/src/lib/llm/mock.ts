import { LLMError, type LLMProvider, type StructuredRequest, type StructuredResponse } from "./types";

/**
 * Scripted provider for tests and evals. It is never selectable through configuration.
 * The handler returns the raw object a model would have produced, or throws an LLMError
 * to simulate an outage, a timeout or a refusal.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";
  readonly model = "mock-model";
  calls: { task: string; system: string; prompt: string }[] = [];

  constructor(private handler: (req: StructuredRequest<unknown>) => unknown | Promise<unknown>) {}

  async generate<T>(req: StructuredRequest<T>): Promise<StructuredResponse<T>> {
    this.calls.push({ task: req.task, system: req.system, prompt: req.prompt });
    const raw = await this.handler(req as StructuredRequest<unknown>);
    const parsed = req.schema.safeParse(raw);
    if (!parsed.success) throw new LLMError("invalid_output", "Mock output did not match the schema.");
    return { data: parsed.data, usage: { inputTokens: Math.ceil((req.system.length + req.prompt.length) / 4), outputTokens: Math.ceil(JSON.stringify(raw).length / 4) }, model: this.model, provider: this.name };
  }
}

export const outage = () =>
  new MockProvider(() => {
    throw new LLMError("unavailable", "simulated outage");
  });
