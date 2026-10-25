import { rmSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { inferExports, decideExportKind, inferImportSpecifier } from "../../src/components/exports.js";
import { registerComponent } from "../../src/components/register.js";
import { applyInit, planInit } from "../../src/project/init.js";
import { DesignRailError } from "../../src/utilities/errors.js";
import { makeProject, project, read, setupProject, writeFiles } from "../helpers.js";

describe("init", () => {
  it("creates the documented files in an empty directory with an unconfigured token registry", () => {
    const root = makeProject();
    const plan = planInit(root);
    expect(plan.actions.map((a) => a.path)).toEqual([
      "designrail/config.yaml",
      "designrail/tokens.json",
      "designrail/components.json",
      "designrail/design-rules.md",
      "designrail/accessibility-rules.md",
      "designrail/product-context.md",
      "designrail/tasks/.gitkeep",
      "designrail/reports/.gitignore",
    ]);
    applyInit(plan);
    expect(JSON.parse(read(root, "designrail/tokens.json"))).toMatchObject({
      $comment: expect.stringMatching(/^Unconfigured/),
      tokens: {},
    });
    expect(read(root, "designrail/design-rules.md")).toContain("designrail:starter");
    expect(project(root).config.source.include).toEqual(["src/**/*.{tsx,jsx,ts,js,css}"]);
  });

  it("detects Next.js, Tailwind, aliases, scripts, and an existing .claude/CLAUDE.md", () => {
    const root = makeProject({
      "package.json": JSON.stringify({
        name: "shop",
        dependencies: { next: "15.0.0", react: "19.0.0" },
        devDependencies: { tailwindcss: "^3.4.0" },
        scripts: { lint: "eslint .", "design:check": "designrail check" },
      }),
      "pnpm-lock.yaml": "",
      "tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }',
      "app/page.tsx": "",
      "src/styles/globals.css": ":root { --brand: #000; }",
      ".claude/CLAUDE.md": "# existing",
    });
    const plan = planInit(root);
    expect(plan.config.project).toMatchObject({
      name: "shop",
      framework: "next",
      styling: { tailwind: "v3" },
    });
    expect(plan.config.source.include).toEqual([
      "src/**/*.{tsx,jsx,ts,js,css}",
      "app/**/*.{tsx,jsx,ts,js,css}",
    ]);
    expect(plan.config.source.importAliases).toEqual({ "@/*": ["src/*"] });
    expect(plan.config.commands).toEqual({
      check: "pnpm run design:check",
      projectChecks: ["pnpm run lint"],
    });
    expect(plan.config.adapters).toEqual([{ id: "codex" }, { id: "claude-code", path: ".claude/CLAUDE.md" }]);
    expect(plan.detection.tokenCandidates).toContain("src/styles/globals.css");
  });

  it("keeps existing files and valid configuration on repeated runs", () => {
    const root = setupProject();
    const before = ["designrail/config.yaml", "designrail/tokens.json", "designrail/components.json"].map(
      (f) => read(root, f),
    );
    writeFiles(root, { "designrail/design-rules.md": "# Our rules" });
    const plan = planInit(root, { framework: "next" });
    expect(plan.actions.every((a) => a.action === "keep")).toBe(true);
    expect(plan.ignoredSettings).toEqual(["framework"]);
    applyInit(plan);
    expect(
      ["designrail/config.yaml", "designrail/tokens.json", "designrail/components.json"].map((f) =>
        read(root, f),
      ),
    ).toEqual(before);
    expect(read(root, "designrail/design-rules.md")).toBe("# Our rules");
  });

  it("recreates only missing files", () => {
    const root = setupProject();
    rmSync(`${root}/designrail/product-context.md`);
    const plan = planInit(root);
    expect(plan.actions.filter((a) => a.action === "create").map((a) => a.path)).toEqual([
      "designrail/product-context.md",
    ]);
  });

  it("refuses to proceed when the existing config is invalid", () => {
    const root = makeProject({ "designrail/config.yaml": "schemaVersion: 1\nunknownKey: true\n" });
    expect(() => planInit(root)).toThrow(DesignRailError);
    expect(read(root, "designrail/config.yaml")).toBe("schemaVersion: 1\nunknownKey: true\n");
  });

  it("rejects configured paths that escape the project", () => {
    const root = makeProject({
      "designrail/config.yaml": "schemaVersion: 1\npaths: { tokens: ../../tokens.json }\n",
    });
    expect(() => planInit(root)).toThrow(/unsafe paths/);
  });
});

describe("component registration", () => {
  it("infers named and default exports only when reliable", () => {
    expect(decideExportKind(inferExports("export function Button() {}", "a.tsx"), "Button")).toMatchObject({
      kind: "named",
      reliable: true,
    });
    expect(
      decideExportKind(inferExports("const Card = () => null; export default Card;", "a.tsx"), "Card"),
    ).toMatchObject({ kind: "default" });
    expect(
      decideExportKind(inferExports("const X = 1; export { X as Button };", "a.tsx"), "Button"),
    ).toMatchObject({ kind: "named" });
    expect(
      decideExportKind(inferExports("export default forwardRef(() => null);", "a.tsx"), "Button"),
    ).toMatchObject({ reliable: false });
    expect(decideExportKind(inferExports('export * from "./x";', "a.ts"), "Button")).toMatchObject({
      reliable: false,
    });
    expect(decideExportKind(inferExports("export const Other = 1;", "a.ts"), "Button")).toMatchObject({
      reliable: false,
      reason: "Button is not exported from the file",
    });
  });

  it("infers import specifiers from aliases and keeps them separate from paths", () => {
    expect(inferImportSpecifier("src/components/ui/button.tsx", { "@/*": ["src/*"] })).toBe(
      "@/components/ui/button",
    );
    // An index file is imported by its directory; "@ui/*" cannot express the directory itself.
    expect(
      inferImportSpecifier("src/components/ui/index.ts", {
        "@/*": ["src/*"],
        "@ui/*": ["src/components/ui/*"],
      }),
    ).toBe("@/components/ui");
    expect(
      inferImportSpecifier("src/components/ui/card.tsx", {
        "@/*": ["src/*"],
        "@ui/*": ["src/components/ui/*"],
      }),
    ).toBe("@ui/card");
    expect(inferImportSpecifier("lib/a.tsx", { "@/*": ["src/*"] })).toBeNull();
  });

  it("validates paths and requires explicit flags when inference is unreliable", () => {
    const root = setupProject({ components: [] });
    writeFiles(root, {
      "src/anon.tsx": "export default () => null;",
      "lib/x.tsx": "export const X = () => null;",
    });
    const p = project(root);
    expect(() => registerComponent(p, { name: "Evil", path: "../outside.tsx" })).toThrow(
      /outside the project root/,
    );
    expect(() => registerComponent(p, { name: "Gone", path: "src/missing.tsx" })).toThrow(/not found/);
    expect(() => registerComponent(p, { name: "Env", path: ".env" })).toThrow(/secret/);
    expect(() => registerComponent(p, { name: "Anon", path: "src/anon.tsx" })).toThrow(
      /Cannot infer how Anon is exported/,
    );
    expect(() => registerComponent(p, { name: "X", path: "lib/x.tsx" })).toThrow(
      /Cannot infer an import specifier/,
    );
    const ok = registerComponent(p, {
      name: "Anon",
      path: "src/anon.tsx",
      exportKind: "default",
      replaces: ["section"],
    });
    expect(ok.component).toMatchObject({ id: "anon", importSpecifier: "@/anon", exportKind: "default" });
    expect(ok.notes.join()).toMatch(/could not be verified/);
  });

  it("refuses duplicate ids unless updating, and never invents variants", () => {
    const root = setupProject({ components: [] });
    const first = registerComponent(project(root), { name: "Button", path: "src/components/ui/button.tsx" });
    expect(first.component.variants).toBeUndefined();
    expect(() =>
      registerComponent(project(root), { name: "Button", path: "src/components/ui/button.tsx" }),
    ).toThrow(/already registered/);
    const updated = registerComponent(project(root), {
      name: "Button",
      path: "src/components/ui/button.tsx",
      update: true,
      variants: ["primary"],
    });
    expect(updated.action).toBe("updated");
    expect(project(root).componentFile.components).toHaveLength(1);
  });
});
