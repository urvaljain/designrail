/**
 * Packaged end-to-end test: builds the package, packs it, installs the tarball into a
 * temporary consumer project, and runs the full DesignRail loop through the installed bin.
 * Requires network access to the npm registry for the package's runtime dependencies.
 */
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const repo = resolve(import.meta.dirname, "..", "..");
const demo = join(repo, "examples", "react-tailwind-demo");
let work: string;
let consumer: string;
let tarball: string;
let packedFiles: string[];

function run(command: string, args: string[], cwd: string): SpawnSyncReturns<string> {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, NO_COLOR: "1", CI: "1" },
  });
  if (result.error) throw result.error;
  return result;
}

function designrail(...args: string[]): SpawnSyncReturns<string> {
  return run(join(consumer, "node_modules", ".bin", "designrail"), args, consumer);
}

function read(path: string): string {
  return readFileSync(join(consumer, path), "utf8");
}

const USER_AGENTS = "# Team agent instructions\n\nWritten by humans. Keep this section.\n";

beforeAll(() => {
  work = realpathSync(mkdtempSync(join(tmpdir(), "designrail-e2e-")));
  const build = run("pnpm", ["run", "build"], repo);
  expect(build.status, build.stderr).toBe(0);

  const pack = run("npm", ["pack", "--json", "--pack-destination", work], repo);
  expect(pack.status, pack.stderr).toBe(0);
  const info = JSON.parse(pack.stdout) as { filename: string; files: { path: string }[] }[];
  tarball = join(work, info[0]!.filename);
  packedFiles = info[0]!.files.map((f) => f.path).sort();

  consumer = join(work, "consumer");
  mkdirSync(consumer);
  cpSync(join(demo, "src"), join(consumer, "src"), { recursive: true });
  cpSync(join(demo, "fixtures"), join(consumer, "fixtures"), { recursive: true });
  cpSync(join(demo, "tsconfig.json"), join(consumer, "tsconfig.json"));
  writeFileSync(
    join(consumer, "package.json"),
    JSON.stringify(
      {
        name: "e2e-consumer",
        private: true,
        type: "module",
        dependencies: { react: "^19.0.0" },
        devDependencies: { tailwindcss: "^4.3.0" },
      },
      null,
      2,
    ),
  );
  writeFileSync(join(consumer, "AGENTS.md"), USER_AGENTS);
  const install = run(
    "npm",
    ["install", "--no-audit", "--no-fund", "--ignore-scripts", "--save-dev", tarball],
    consumer,
  );
  expect(install.status, install.stderr).toBe(0);
}, 300_000);

afterAll(() => {
  if (work) rmSync(work, { recursive: true, force: true });
});

describe("packed artifact", () => {
  it("contains the runtime files and nothing from tests, sources, or examples", () => {
    expect(packedFiles).toContain("dist/cli/bin.js");
    expect(packedFiles).toContain("dist/index.js");
    expect(packedFiles).toContain("dist/index.d.ts");
    expect(packedFiles).toEqual(
      expect.arrayContaining([
        "templates/design-rules.md",
        "templates/accessibility-rules.md",
        "templates/product-context.md",
        "README.md",
        "LICENSE",
        "CHANGELOG.md",
        "package.json",
      ]),
    );
    expect(packedFiles.filter((f) => /^(src|tests|examples|docs|scripts|\.github)\//.test(f))).toEqual([]);
    // No archives, logs, env files, generated DesignRail reports, or dependencies.
    expect(
      packedFiles.filter((f) => /\.(tgz|log)$|(^|\/)\.env|designrail\/reports\/|node_modules\//.test(f)),
    ).toEqual([]);
  });

  it("installs a working bin with --help and --version", () => {
    expect(
      readFileSync(join(consumer, "node_modules", "designrail", "dist", "cli", "bin.js"), "utf8").startsWith(
        "#!/usr/bin/env node\n",
      ),
    ).toBe(true);
    const version = designrail("--version");
    expect(version.status).toBe(0);
    expect(version.stdout.trim()).toBe(JSON.parse(readFileSync(join(repo, "package.json"), "utf8")).version);
    const help = designrail("--help");
    expect(help.status).toBe(0);
    expect(help.stdout).toMatch(/fix-prompt/);
  });
});

describe("full workflow through the installed CLI", () => {
  it("runs init, import, register, sync, task, check, fix-prompt, and re-check", () => {
    // 1. Non-interactive init.
    const init = designrail("init", "--yes", "--adapters", "codex,claude-code,cursor,generic");
    expect(init.status, init.stderr).toBe(0);
    expect(read("designrail/config.yaml")).toMatch(/tailwind: v4/);

    // 2. Tokens from the Tailwind v4 theme.
    const tokens = designrail("import-tokens", "src/index.css", "--json");
    expect(tokens.status, tokens.stderr).toBe(0);
    expect((JSON.parse(tokens.stdout) as { added: string[] }).added).toEqual(
      expect.arrayContaining(["color.brand", "spacing.md", "font-family.sans"]),
    );

    // 3. Components.
    for (const args of [
      ["Button", "src/components/ui/button.tsx", "--replaces", "button"],
      ["Card", "src/components/ui/card.tsx"],
      ["Input", "src/components/ui/input.tsx", "--replaces", "input[type=text],input[type=email]"],
    ]) {
      const added = designrail("add-component", ...args);
      expect(added.status, added.stderr).toBe(0);
    }
    const list = JSON.parse(designrail("list-components", "--json").stdout) as {
      components: { exportName: string; importSpecifier: string; fileExists: boolean }[];
    };
    expect(list.components.map((c) => [c.exportName, c.importSpecifier, c.fileExists])).toEqual([
      ["Button", "@/components/ui/button", true],
      ["Card", "@/components/ui/card", true],
      ["Input", "@/components/ui/input", true],
    ]);

    // 4. AI instructions, idempotent, preserving user content.
    expect(designrail("sync").status).toBe(0);
    const agents = read("AGENTS.md");
    expect(agents.startsWith(USER_AGENTS)).toBe(true);
    expect(agents).toContain("<!-- DESIGNRAIL:START -->");
    for (const file of ["CLAUDE.md", ".cursor/rules/designrail.mdc", "DESIGNRAIL_CONTEXT.md"])
      expect(existsSync(join(consumer, file))).toBe(true);
    const snapshot = read("AGENTS.md");
    expect(designrail("sync").status).toBe(0);
    expect(read("AGENTS.md")).toBe(snapshot);
    expect(designrail("sync", "--check").status).toBe(0);

    // 5. Task brief.
    const task = designrail(
      "task",
      "Add a billing panel with a coupon field and an upgrade button",
      "--json",
    );
    expect(task.status).toBe(0);
    const taskPath = (JSON.parse(task.stdout) as { path: string }).path;
    expect(read(taskPath)).toContain("Add a billing panel with a coupon field and an upgrade button");

    // 6. Clean code passes.
    const clean = designrail("check");
    expect(clean.status, clean.stdout).toBe(0);

    // 7. Simulated AI output fails with evidence.
    mkdirSync(join(consumer, "src", "features", "billing"), { recursive: true });
    cpSync(
      join(consumer, "fixtures/ai-output/BillingPanel.tsx"),
      join(consumer, "src/features/billing/BillingPanel.tsx"),
    );
    const failing = designrail("check", "--json");
    expect(failing.status).toBe(1);
    const report = JSON.parse(failing.stdout) as { violations: { ruleId: string; file: string }[] };
    const rules = new Set(report.violations.map((v) => v.ruleId));
    for (const id of ["DR001", "DR002", "DR003", "DR004", "DR006", "DR007", "DR008"])
      expect(rules.has(id), id).toBe(true);
    expect(new Set(report.violations.map((v) => v.file))).toEqual(
      new Set(["src/features/billing/BillingPanel.tsx"]),
    );

    // 8. Repair prompt from fresh evidence.
    const prompt = designrail("fix-prompt");
    expect(prompt.status, prompt.stderr).toBe(0);
    const promptText = read("designrail/reports/latest-fix-prompt.md");
    expect(promptText).toContain("src/features/billing/BillingPanel.tsx");
    expect(promptText).toMatch(/\*\*DR004\*\*/);

    // 9. Apply the known correction; the check passes and the prompt reports nothing to fix.
    cpSync(
      join(consumer, "fixtures/corrected/BillingPanel.tsx"),
      join(consumer, "src/features/billing/BillingPanel.tsx"),
    );
    const stale = designrail("fix-prompt");
    expect(stale.status).toBe(2);
    const fixed = designrail("check");
    expect(fixed.status, fixed.stdout).toBe(0);
    expect(designrail("fix-prompt", "--stdout").stdout).toMatch(/nothing to repair/);

    // 10. Diagnostics and preserved user instructions.
    const doctor = designrail("doctor");
    expect(doctor.status, doctor.stdout).toBe(0);
    const status = JSON.parse(designrail("status", "--json").stdout) as {
      lastCheck: { fresh: boolean; status: string };
    };
    expect(status.lastCheck).toMatchObject({ fresh: true, status: "pass" });
    expect(read("AGENTS.md").startsWith(USER_AGENTS)).toBe(true);
  });
});
