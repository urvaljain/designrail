import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach } from "vitest";
import { runCli } from "../src/cli/index.js";
import { runCheck } from "../src/checker/engine.js";
import { loadProject, type ProjectContext } from "../src/project/context.js";
import { applyInit, planInit } from "../src/project/init.js";
import { serializeTokenFile } from "../src/tokens/load.js";
import type { Token } from "../src/tokens/schema.js";
import { serializeComponentFile } from "../src/components/load.js";
import type { ComponentInput } from "../src/components/schema.js";
import { componentFileSchema } from "../src/components/schema.js";
import type { Violation } from "../src/reports/schema.js";

const created: string[] = [];

afterEach(() => {
  while (created.length > 0) rmSync(created.pop()!, { recursive: true, force: true });
});

/** Creates a temporary project directory containing the given files. Removed after each test. */
export function makeProject(files: Record<string, string> = {}): string {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "designrail-test-")));
  created.push(root);
  writeFiles(root, files);
  return root;
}

export function writeFiles(root: string, files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
}

export function read(root: string, path: string): string {
  return readFileSync(join(root, path), "utf8");
}

export interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
}

/** Runs the CLI in-process with captured output. stdin is not a TTY unless requested. */
export async function cli(
  root: string,
  argv: string[],
  options: { env?: Record<string, string> } = {},
): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  const stdin = new PassThrough() as PassThrough & { isTTY?: boolean };
  stdin.isTTY = false;
  const code = await runCli(argv, {
    stdout: { write: (s: string) => (stdout += s) },
    stderr: { write: (s: string) => (stderr += s) },
    stdin,
    stdoutIsTTY: false,
    env: { ...options.env },
    cwd: root,
    now: () => new Date(2026, 0, 15),
  });
  return { code, stdout, stderr };
}

export const STANDARD_TOKENS: Record<string, Token> = {
  "color.brand": {
    type: "color",
    value: "#2563eb",
    references: { cssVariables: ["--color-brand"], tailwindKeys: ["brand"] },
  },
  "color.surface": {
    type: "color",
    value: "#ffffff",
    references: { cssVariables: ["--color-surface"], tailwindKeys: ["surface"] },
  },
  "color.text": {
    type: "color",
    value: "#0f172a",
    references: { cssVariables: ["--color-text"], tailwindKeys: ["text"] },
  },
  "spacing.sm": {
    type: "spacing",
    value: "8px",
    references: { cssVariables: ["--spacing-sm"], tailwindKeys: ["sm"] },
  },
  "spacing.md": {
    type: "spacing",
    value: "16px",
    references: { cssVariables: ["--spacing-md"], tailwindKeys: ["md"] },
  },
  "spacing.lg": {
    type: "spacing",
    value: "1.5rem",
    references: { cssVariables: ["--spacing-lg"], tailwindKeys: ["lg"] },
  },
  "font-family.sans": {
    type: "fontFamily",
    value: ["Inter", "sans-serif"],
    references: { cssVariables: ["--font-sans"], tailwindKeys: ["sans"] },
  },
  "font-family.mono": {
    type: "fontFamily",
    value: ["JetBrains Mono", "monospace"],
    references: { cssVariables: ["--font-mono"], tailwindKeys: ["mono"] },
  },
};

export const STANDARD_COMPONENTS: ComponentInput[] = [
  {
    id: "button",
    exportName: "Button",
    sourceFile: "src/components/ui/button.tsx",
    importSpecifier: "@/components/ui/button",
    exportKind: "named",
    replaces: ["button"],
  },
  {
    id: "input",
    exportName: "Input",
    sourceFile: "src/components/ui/input.tsx",
    importSpecifier: "@/components/ui/input",
    exportKind: "named",
    replaces: ["input[type=text]", "input[type=email]"],
  },
];

const COMPONENT_SOURCES: Record<string, string> = {
  "src/components/ui/button.tsx":
    'export function Button(props: { children?: unknown }) {\n  return <button className="bg-brand p-md" {...props} />;\n}\n',
  "src/components/ui/input.tsx":
    'export function Input({ id, label }: { id: string; label: string }) {\n  return (\n    <label htmlFor={id}>\n      {label}\n      <input id={id} type="text" />\n    </label>\n  );\n}\n',
};

export interface SetupOptions {
  tokens?: Record<string, Token>;
  components?: ComponentInput[];
  /** Replacement lines applied to the generated config.yaml: [search, replace]. */
  configEdits?: [string, string][];
  files?: Record<string, string>;
  tailwind?: "v3" | "v4" | "none";
}

/** Initializes a project with tokens/components written directly (fast path for rule tests). */
export function setupProject(options: SetupOptions = {}): string {
  const root = makeProject({
    "package.json": JSON.stringify({ name: "fixture", dependencies: { react: "^19.0.0" } }),
    "tsconfig.json": JSON.stringify({ compilerOptions: { paths: { "@/*": ["./src/*"] } } }),
    ...COMPONENT_SOURCES,
    ...options.files,
  });
  const plan = planInit(root, { tailwind: options.tailwind ?? "v4", adapters: ["codex"] });
  applyInit(plan);
  writeFileSync(
    join(root, "designrail/tokens.json"),
    serializeTokenFile({ schemaVersion: 1, tokens: options.tokens ?? STANDARD_TOKENS }),
  );
  writeFileSync(
    join(root, "designrail/components.json"),
    serializeComponentFile(
      componentFileSchema.parse({ schemaVersion: 1, components: options.components ?? STANDARD_COMPONENTS }),
    ),
  );
  if (options.configEdits) {
    let text = read(root, "designrail/config.yaml");
    for (const [search, replace] of options.configEdits) {
      if (!text.includes(search)) throw new Error(`config edit target not found: ${search}`);
      text = text.replace(search, replace);
    }
    writeFileSync(join(root, "designrail/config.yaml"), text);
  }
  return root;
}

export function project(root: string): ProjectContext {
  return loadProject(root);
}

/** Writes source files into a configured project and returns violations for them. */
export function check(root: string, files: Record<string, string> = {}, paths?: string[]): Violation[] {
  writeFiles(root, files);
  return runCheck(loadProject(root), { paths: paths ?? Object.keys(files) }).violations;
}

export function rules(violations: Violation[]): string[] {
  return violations.map((v) => `${v.ruleId}@${v.line}:${v.column}`);
}

export function ofRule(violations: Violation[], ruleId: string): Violation[] {
  return violations.filter((v) => v.ruleId === ruleId);
}
