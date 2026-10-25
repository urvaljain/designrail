// Ensures the CLI entry is executable and starts with a Node shebang.
import { chmodSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const bin = resolve(import.meta.dirname, "..", "dist", "cli", "bin.js");
const text = readFileSync(bin, "utf8");
if (!text.startsWith("#!/usr/bin/env node\n")) {
  throw new Error("dist/cli/bin.js is missing the #!/usr/bin/env node shebang");
}
chmodSync(bin, 0o755);
