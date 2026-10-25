import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cli, makeProject, read, setupProject, writeFiles } from "../helpers.js";

const VIOLATING = 'export const A = () => <img className="bg-[#abcdef]" />;\n';

function parseJsonOnly(stdout: string): unknown {
  // The whole of stdout must be one JSON document.
  return JSON.parse(stdout);
}

describe("global behavior", () => {
  it("prints help and version with exit 0", async () => {
    const root = makeProject();
    const help = await cli(root, ["--help"]);
    expect(help.code).toBe(0);
    expect(help.stdout).toMatch(/Usage: designrail/);
    for (const command of [
      "init",
      "status",
      "import-tokens",
      "add-component",
      "list-components",
      "sync",
      "task",
      "check",
      "fix-prompt",
      "doctor",
    ]) {
      expect(help.stdout).toContain(command);
    }
    const version = await cli(root, ["--version"]);
    expect(version).toMatchObject({ code: 0, stdout: "0.1.0\n" });
    expect((await cli(root, ["check", "--help"])).stdout).toMatch(/--strict/);
  });

  it("uses exit 2 for unknown commands and options", async () => {
    const root = makeProject();
    expect((await cli(root, ["frobnicate"])).code).toBe(2);
    expect((await cli(root, ["check", "--nope"])).code).toBe(2);
  });

  it("supports --cwd for selecting the project root", async () => {
    const parent = makeProject();
    const root = setupProject();
    const result = await cli(parent, ["--cwd", root, "status", "--json"]);
    expect(result.code).toBe(0);
    expect(parseJsonOnly(result.stdout)).toMatchObject({ initialized: true, root });
  });

  it("reports commands run before init with an actionable error", async () => {
    const root = makeProject();
    const result = await cli(root, ["check"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/not initialized[\s\S]*designrail init/);
  });
});

describe("init", () => {
  it("never waits for input when stdin is not a terminal", async () => {
    const root = makeProject({ "package.json": "{}" });
    const result = await cli(root, ["init"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/--yes/);
    expect(() => read(root, "designrail/config.yaml")).toThrow();
  });

  it("creates files with --yes, honors flags, and preserves everything on rerun", async () => {
    const root = makeProject({ "AGENTS.md": "# Ours\n", "src/App.tsx": "" });
    const first = await cli(root, [
      "init",
      "--yes",
      "--framework",
      "next",
      "--tailwind",
      "v4",
      "--adapters",
      "codex,cursor",
    ]);
    expect(first.code).toBe(0);
    expect(read(root, "designrail/config.yaml")).toMatch(/framework: next/);
    expect(read(root, "AGENTS.md")).toBe("# Ours\n");
    writeFiles(root, { "designrail/design-rules.md": "# Edited by us\n" });
    const config = read(root, "designrail/config.yaml");
    const second = await cli(root, ["init", "--yes", "--framework", "react"]);
    expect(second.code).toBe(0);
    expect(second.stdout).toMatch(/Ignored flags because a configuration exists: framework/);
    expect(read(root, "designrail/config.yaml")).toBe(config);
    expect(read(root, "designrail/design-rules.md")).toBe("# Edited by us\n");
  });

  it("supports --dry-run and JSON output", async () => {
    const root = makeProject();
    const dry = await cli(root, ["init", "--dry-run", "--json"]);
    expect(dry.code).toBe(0);
    expect(parseJsonOnly(dry.stdout)).toMatchObject({ dryRun: true, created: [] });
    expect(() => read(root, "designrail/config.yaml")).toThrow();
  });

  it("validates flag values", async () => {
    const root = makeProject();
    expect((await cli(root, ["init", "--yes", "--adapters", "copilot"])).code).toBe(2);
    expect((await cli(root, ["init", "--yes", "--tailwind", "v5"])).code).toBe(2);
  });

  it("does not modify an invalid existing configuration", async () => {
    const root = makeProject({ "designrail/config.yaml": "schemaVersion: 1\nwat: 1\n" });
    const result = await cli(root, ["init", "--yes"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/wat/);
    expect(read(root, "designrail/config.yaml")).toBe("schemaVersion: 1\nwat: 1\n");
  });
});

describe("status, components, and tokens", () => {
  it("prints status as JSON only, including uninitialized projects", async () => {
    const empty = await cli(makeProject(), ["status", "--json"]);
    expect(empty.code).toBe(0);
    expect(parseJsonOnly(empty.stdout)).toMatchObject({ initialized: false });

    const root = setupProject();
    const result = await cli(root, ["status", "--json"]);
    const status = parseJsonOnly(result.stdout) as {
      tokens: { count: number };
      adapters: { state: string }[];
      lastCheck: unknown;
      gaps: string[];
    };
    expect(status.tokens.count).toBe(8);
    expect(status.adapters).toEqual([{ id: "codex", path: "AGENTS.md", state: "missing" }]);
    expect(status.lastCheck).toBeNull();
    expect(status.gaps.join("\n")).toMatch(/starter guidance/);
  });

  it("registers and lists components", async () => {
    const root = setupProject({ components: [] });
    const add = await cli(root, [
      "add-component",
      "Button",
      "src/components/ui/button.tsx",
      "--replaces",
      "button",
      "--variants",
      "primary,ghost",
      "--restrict",
      "@mui/material:Button",
      "--json",
    ]);
    expect(add.code).toBe(0);
    expect(parseJsonOnly(add.stdout)).toMatchObject({
      action: "added",
      component: {
        importSpecifier: "@/components/ui/button",
        variants: ["primary", "ghost"],
        importPolicy: { restricted: [{ from: "@mui/material", importName: "Button" }] },
      },
    });
    const list = await cli(root, ["list-components", "--json"]);
    expect(parseJsonOnly(list.stdout)).toMatchObject({
      components: [{ exportName: "Button", fileExists: true }],
    });
    const traversal = await cli(root, ["add-component", "X", "../../x.tsx", "--json"]);
    expect(traversal.code).toBe(2);
    expect(parseJsonOnly(traversal.stdout)).toMatchObject({ error: { category: "unsafe-path" } });
  });

  it("keeps existing tokens on conflict without --replace and replaces with it", async () => {
    const root = setupProject();
    writeFiles(root, { "src/theme.css": ":root { --color-brand: #ff0000; --color-new: #00ff00; }" });
    const kept = await cli(root, ["import-tokens", "src/theme.css", "--json"]);
    expect(kept.code).toBe(0);
    const data = parseJsonOnly(kept.stdout) as {
      added: string[];
      conflicts: { name: string; replaced: boolean }[];
    };
    expect(data.added).toEqual(["color.new"]);
    expect(data.conflicts).toEqual([expect.objectContaining({ name: "color.brand", replaced: false })]);
    expect(JSON.parse(read(root, "designrail/tokens.json")).tokens["color.brand"].value).toBe("#2563eb");
    const replaced = await cli(root, ["import-tokens", "src/theme.css", "--replace"]);
    expect(replaced.stdout).toMatch(/replaced/);
    expect(JSON.parse(read(root, "designrail/tokens.json")).tokens["color.brand"].value).toBe("#ff0000");
  });

  it("exits 2 and leaves tokens intact for invalid sources", async () => {
    const root = setupProject();
    writeFiles(root, { "broken.json": "{" });
    const before = read(root, "designrail/tokens.json");
    const result = await cli(root, ["import-tokens", "broken.json"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/not valid JSON[\s\S]*not modified/);
    expect(read(root, "designrail/tokens.json")).toBe(before);
    expect((await cli(root, ["import-tokens", "broken.json", "--format", "yaml"])).code).toBe(2);
  });
});

describe("sync", () => {
  it("reports drift with --check (exit 1), writes nothing on --dry-run, and is idempotent", async () => {
    const root = setupProject();
    writeFiles(root, { "AGENTS.md": "# Team rules\n" });
    expect((await cli(root, ["sync", "--check"])).code).toBe(1);
    const dry = await cli(root, ["sync", "--dry-run"]);
    expect(dry.stdout).toMatch(/would append section to/);
    expect(read(root, "AGENTS.md")).toBe("# Team rules\n");
    expect((await cli(root, ["sync"])).code).toBe(0);
    const after = read(root, "AGENTS.md");
    expect(after.startsWith("# Team rules\n")).toBe(true);
    expect((await cli(root, ["sync"])).stdout).toMatch(/up to date/);
    expect(read(root, "AGENTS.md")).toBe(after);
    const check = await cli(root, ["sync", "--check", "--json"]);
    expect(check.code).toBe(0);
    expect(parseJsonOnly(check.stdout)).toMatchObject({ mode: "check", drift: false });
  });

  it("exits 2 on malformed markers without changing the file", async () => {
    const root = setupProject();
    const text = "# Mine\n<!-- DESIGNRAIL:END -->\n";
    writeFiles(root, { "AGENTS.md": text });
    const result = await cli(root, ["sync"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/malformed DesignRail markers/);
    expect(read(root, "AGENTS.md")).toBe(text);
  });
});

describe("task", () => {
  it("writes a brief or prints it with --stdout", async () => {
    const root = setupProject();
    const written = await cli(root, ["task", "Add a delete account button", "--json"]);
    expect(parseJsonOnly(written.stdout)).toMatchObject({
      path: "designrail/tasks/2026-01-15-add-a-delete-account-button.md",
    });
    const printed = await cli(root, ["task", "Add a delete account button", "--stdout"]);
    expect(printed.stdout).toMatch(/^<!-- designrail:task/);
    expect(printed.stdout).toMatch(/Is a confirmation step required/);
    expect((await cli(root, ["task", "  "])).code).toBe(2);
  });
});

describe("check", () => {
  it("exits 0 for clean code, 1 for errors, and 2 for parse failures", async () => {
    const root = setupProject();
    writeFiles(root, {
      "src/Clean.tsx": 'export const C = () => <img alt="" className="bg-brand p-md" />;\n',
    });
    expect((await cli(root, ["check"])).code).toBe(0);
    writeFiles(root, { "src/Bad.tsx": VIOLATING });
    const failing = await cli(root, ["check"]);
    expect(failing.code).toBe(1);
    expect(failing.stdout).toMatch(/Policy: fail on error/);
    expect(failing.stdout).toMatch(/A pass does not prove visual fidelity or accessibility/);
    writeFiles(root, { "src/Broken.tsx": "export const = ;" });
    const broken = await cli(root, ["check"]);
    expect(broken.code).toBe(2);
    expect(broken.stdout).toMatch(/INCOMPLETE/);
  });

  it("prints only valid JSON on stdout with --json, even with colors forced", async () => {
    const root = setupProject();
    writeFiles(root, { "src/Bad.tsx": VIOLATING });
    const result = await cli(root, ["check", "--json"], { env: { FORCE_COLOR: "1" } });
    expect(result.code).toBe(1);
    expect(result.stdout.includes("\u001b[")).toBe(false);
    const report = parseJsonOnly(result.stdout) as {
      violations: { ruleId: string }[];
      result: { status: string };
    };
    expect(report.violations.map((v) => v.ruleId)).toEqual(["DR006", "DR001"]);
    expect(report.result.status).toBe("fail");
  });

  it("fails on warnings with --strict and prints only failing findings with --quiet", async () => {
    const root = setupProject();
    writeFiles(root, { "src/W.tsx": "export const W = () => <div style={{ opacity: 0.5 }} />;\n" });
    expect((await cli(root, ["check"])).code).toBe(0);
    const strict = await cli(root, ["check", "--strict"]);
    expect(strict.code).toBe(1);
    expect(strict.stdout).toMatch(/fail on warning \(--strict\)/);
    const quiet = await cli(root, ["check", "--quiet"]);
    expect(quiet.stdout).not.toMatch(/DR005/);
    expect(quiet.stdout.trim().split("\n")).toHaveLength(2);
  });

  it("writes reports atomically to the default and --output locations, never modifying sources", async () => {
    const root = setupProject();
    writeFiles(root, { "src/Bad.tsx": VIOLATING });
    await cli(root, ["check", "--output", "artifacts/designrail.json"]);
    expect(JSON.parse(read(root, "designrail/reports/latest.json")).schemaVersion).toBe(1);
    expect(JSON.parse(read(root, "artifacts/designrail.json")).summary.errors).toBe(2);
    expect(read(root, "src/Bad.tsx")).toBe(VIOLATING);
    expect((await cli(root, ["check", "--output", "../escape.json"])).code).toBe(2);
    expect((await cli(root, ["check", "../"])).code).toBe(2);
  });

  it("checks explicit paths only and reports missing ones", async () => {
    const root = setupProject();
    writeFiles(root, { "src/a/Bad.tsx": VIOLATING, "src/b/Bad.tsx": VIOLATING });
    const scoped = parseJsonOnly((await cli(root, ["check", "src/a", "--json"])).stdout) as {
      files: { path: string }[];
    };
    expect(scoped.files.map((f) => f.path)).toEqual(["src/a/Bad.tsx"]);
    const missing = await cli(root, ["check", "src/nope"]);
    expect(missing.stdout).toMatch(/Path not found: src\/nope/);
  });

  it("returns a JSON error object for configuration errors in --json mode", async () => {
    const root = setupProject();
    writeFiles(root, {
      "designrail/config.yaml": "schemaVersion: 1\nrules: { DR001: { severity: loud } }\n",
    });
    const result = await cli(root, ["check", "--json"]);
    expect(result.code).toBe(2);
    expect(parseJsonOnly(result.stdout)).toMatchObject({
      error: { category: "configuration", details: [expect.stringMatching(/rules\.DR001\.severity/)] },
    });
  });
});

describe("fix-prompt and doctor", () => {
  it("requires a report, rejects stale ones, and supports --refresh", async () => {
    const root = setupProject();
    writeFiles(root, { "src/Bad.tsx": VIOLATING });
    const none = await cli(root, ["fix-prompt"]);
    expect(none.code).toBe(2);
    expect(none.stderr).toMatch(/No report found/);

    await cli(root, ["check"]);
    const fresh = await cli(root, ["fix-prompt"]);
    expect(fresh.code).toBe(0);
    expect(read(root, "designrail/reports/latest-fix-prompt.md")).toMatch(/DR001/);

    writeFileSync(join(root, "src/Bad.tsx"), 'export const A = () => <img alt="" className="bg-brand" />;\n');
    const stale = await cli(root, ["fix-prompt", "--stdout"]);
    expect(stale.code).toBe(2);
    expect(stale.stderr).toMatch(/stale[\s\S]*src\/Bad\.tsx[\s\S]*--refresh/);
    expect(stale.stdout).toBe("");

    const refreshed = await cli(root, ["fix-prompt", "--refresh", "--stdout"]);
    expect(refreshed.code).toBe(0);
    expect(refreshed.stdout).toMatch(/nothing to repair/);
  });

  it("uses an explicit --report path", async () => {
    const root = setupProject();
    writeFiles(root, { "src/Bad.tsx": VIOLATING });
    await cli(root, ["check", "--no-report", "--output", "out/r.json"]);
    const result = await cli(root, ["fix-prompt", "--report", "out/r.json", "--json"]);
    expect(result.code).toBe(0);
    expect(parseJsonOnly(result.stdout)).toMatchObject({ report: "out/r.json", findings: 2 });
  });

  it("distinguishes configuration errors (exit 2) from healthy setups (exit 0)", async () => {
    const root = setupProject();
    await cli(root, ["sync"]);
    await cli(root, ["check"]);
    const healthy = await cli(root, ["doctor", "--json"]);
    expect(healthy.code).toBe(0);
    const report = parseJsonOnly(healthy.stdout) as {
      checks: { id: string; status: string; category: string }[];
    };
    expect(report.checks.find((c) => c.id === "design")).toMatchObject({ category: "design-violation" });
    expect(report.checks.filter((c) => c.status === "error")).toEqual([]);

    writeFiles(root, {
      "designrail/tokens.json": JSON.stringify({
        schemaVersion: 1,
        tokens: { "color.a": { type: "color", value: "{color.a}" } },
      }),
    });
    const cycle = await cli(root, ["doctor"]);
    expect(cycle.code).toBe(2);
    expect(cycle.stdout).toMatch(
      /error 1 token reference problem.*\[configuration error\]\n\s+- Alias cycle: color\.a -> color\.a/,
    );
    expect((await cli(root, ["check"])).code).toBe(2);
  });

  it("reports missing component files and adapter drift", async () => {
    const root = setupProject({
      components: [
        {
          id: "card",
          exportName: "Card",
          sourceFile: "src/card.tsx",
          importSpecifier: "@/card",
          exportKind: "named",
        },
      ],
    });
    const result = await cli(root, ["doctor"]);
    expect(result.code).toBe(2);
    expect(result.stdout).toMatch(/source file src\/card\.tsx not found/);
    expect(result.stdout).toMatch(/AGENTS\.md is missing/);
  });
});
