import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import type { CliIO } from "../../src/cli/io.js";
import { ask, closePrompts, confirm } from "../../src/cli/prompt.js";

function io(): { io: CliIO; stdin: PassThrough } {
  const stdin = new PassThrough();
  return {
    stdin,
    io: {
      stdin,
      stdout: { write: () => true },
      stderr: { write: () => true },
      stdoutIsTTY: true,
      env: {},
      cwd: ".",
    },
  };
}

describe("interactive prompts", () => {
  it("keeps answers that were typed ahead or pasted at once", async () => {
    const { io: cliIo, stdin } = io();
    stdin.write("next\n\nyes\n");
    expect(await ask(cliIo, "Framework", "react")).toBe("next");
    expect(await ask(cliIo, "Adapters", "codex")).toBe("codex");
    expect(await confirm(cliIo, "Create?", false)).toBe(true);
    closePrompts(cliIo);
  });

  it("fails clearly when input ends early", async () => {
    const { io: cliIo, stdin } = io();
    stdin.end("only-one\n");
    expect(await ask(cliIo, "First", "")).toBe("only-one");
    await expect(ask(cliIo, "Second", "")).rejects.toThrow(/Input ended/);
    closePrompts(cliIo);
  });
});
