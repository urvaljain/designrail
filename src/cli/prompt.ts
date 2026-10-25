import { createInterface, type Interface } from "node:readline";
import { DesignRailError } from "../utilities/errors.js";
import type { CliIO } from "./io.js";

/**
 * One line reader per CLI run. Lines that arrive before a question is asked (typed ahead or pasted)
 * are queued instead of being dropped by a fresh readline interface. Callers must check isInteractive().
 */
class Prompter {
  private readonly rl: Interface;
  private readonly lines: string[] = [];
  private waiting: ((line: string | null) => void) | null = null;
  private closed = false;

  constructor(private readonly io: CliIO) {
    this.rl = createInterface({ input: io.stdin, terminal: false });
    this.rl.on("line", (line) => {
      if (this.waiting) {
        const resolve = this.waiting;
        this.waiting = null;
        resolve(line);
      } else {
        this.lines.push(line);
      }
    });
    this.rl.on("close", () => {
      this.closed = true;
      this.waiting?.(null);
      this.waiting = null;
    });
  }

  async ask(question: string): Promise<string> {
    this.io.stderr.write(question);
    const queued = this.lines.shift();
    if (queued !== undefined) {
      this.io.stderr.write("\n");
      return queued;
    }
    if (this.closed) throw inputClosed();
    const line = await new Promise<string | null>((resolve) => (this.waiting = resolve));
    if (line === null) throw inputClosed();
    return line;
  }

  close(): void {
    this.rl.close();
  }
}

function inputClosed(): DesignRailError {
  return new DesignRailError("usage", "Input ended before all questions were answered; nothing was written", {
    hint: "Rerun interactively, or pass --yes with the needed flags.",
  });
}

const prompters = new WeakMap<CliIO, Prompter>();

function prompter(io: CliIO): Prompter {
  let p = prompters.get(io);
  if (!p) {
    p = new Prompter(io);
    prompters.set(io, p);
  }
  return p;
}

/** Releases stdin so the process can exit. Safe to call when no prompt was shown. */
export function closePrompts(io: CliIO): void {
  prompters.get(io)?.close();
  prompters.delete(io);
}

export async function ask(io: CliIO, question: string, fallback: string): Promise<string> {
  const answer = (await prompter(io).ask(`${question}${fallback ? ` (${fallback})` : ""}: `)).trim();
  return answer === "" ? fallback : answer;
}

export async function confirm(io: CliIO, question: string, defaultYes: boolean): Promise<boolean> {
  const answer = (await ask(io, `${question} ${defaultYes ? "[Y/n]" : "[y/N]"}`, "")).toLowerCase();
  if (answer === "") return defaultYes;
  return answer === "y" || answer === "yes";
}
