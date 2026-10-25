import { resolve } from "node:path";
import type { Command } from "commander";
import {
  DesignRailError,
  ExitCode,
  errorMessage,
  isDesignRailError,
  type ExitCode as ExitCodeType,
} from "../utilities/errors.js";
import { colorEnabled, createStyle, type CliIO, type Style } from "./io.js";

export interface GlobalOptions {
  cwd: string;
  color?: boolean;
}

export interface RunContext {
  io: CliIO;
  style: Style;
  root: string;
  json: boolean;
  out(text: string): void;
  err(text: string): void;
  writeJson(value: unknown): void;
}

export interface CliState {
  exitCode: ExitCodeType;
}

export function makeContext(io: CliIO, command: Command, json: boolean): RunContext {
  const globals = command.optsWithGlobals() as GlobalOptions;
  const style = createStyle(!json && colorEnabled(io, globals.color));
  return {
    io,
    style,
    root: resolve(io.cwd, globals.cwd ?? "."),
    json,
    out: (text) => io.stdout.write(text),
    err: (text) => io.stderr.write(text),
    writeJson: (value) => io.stdout.write(`${JSON.stringify(value, null, 2)}\n`),
  };
}

/** Runs a command body, mapping thrown errors to exit code 2 with an actionable message. */
export async function runAction(
  state: CliState,
  ctx: RunContext,
  body: () => Promise<ExitCodeType> | ExitCodeType,
): Promise<void> {
  try {
    state.exitCode = await body();
  } catch (error) {
    state.exitCode = ExitCode.Error;
    const known = isDesignRailError(error);
    const message = errorMessage(error);
    if (ctx.json) {
      ctx.writeJson({
        error: {
          category: known ? error.category : "operational",
          message,
          details: known ? error.details : [],
          ...(known && error.hint ? { hint: error.hint } : {}),
        },
      });
    }
    const lines = [`${ctx.style.red("error")}: ${message}`];
    if (known) {
      for (const d of error.details) lines.push(`  - ${d}`);
      if (error.hint) lines.push(`  ${error.hint}`);
    } else if (ctx.io.env.DESIGNRAIL_DEBUG && error instanceof Error && error.stack) {
      lines.push(error.stack);
    }
    ctx.err(`${lines.join("\n")}\n`);
  }
}

export function parseList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export function usageError(message: string, hint?: string): DesignRailError {
  return new DesignRailError("usage", message, hint ? { hint } : {});
}
