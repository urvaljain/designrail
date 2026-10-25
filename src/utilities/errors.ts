/**
 * Exit-code policy shared by every command:
 *   0 — success, and checks met the configured failure threshold
 *   1 — design findings exceeded the threshold, or a validation command found drift
 *   2 — invalid configuration, invalid usage, unreliable run, or operational failure
 */
export const ExitCode = {
  Ok: 0,
  Findings: 1,
  Error: 2,
} as const;
export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];

export type ErrorCategory =
  "configuration" | "usage" | "unsafe-path" | "collision" | "parse" | "stale-report" | "operational";

export class DesignRailError extends Error {
  readonly category: ErrorCategory;
  readonly hint: string | undefined;
  readonly details: string[];

  constructor(category: ErrorCategory, message: string, options: { hint?: string; details?: string[] } = {}) {
    super(message);
    this.name = "DesignRailError";
    this.category = category;
    this.hint = options.hint;
    this.details = options.details ?? [];
  }

  get exitCode(): ExitCode {
    return ExitCode.Error;
  }
}

export function isDesignRailError(error: unknown): error is DesignRailError {
  return error instanceof DesignRailError;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}
