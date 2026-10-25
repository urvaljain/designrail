#!/usr/bin/env node
import { runCli } from "./index.js";

// A closed pipe (for example `designrail check | head`) is not an error worth a stack trace.
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EPIPE") process.exit(process.exitCode ?? 0);
    throw error;
  });
}

runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
  stdin: process.stdin,
  stdoutIsTTY: Boolean(process.stdout.isTTY),
  env: process.env,
  cwd: process.cwd(),
}).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stderr.write(
      `designrail: unexpected error: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 2;
  },
);
