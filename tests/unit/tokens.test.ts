import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runImport, mergeTokens } from "../../src/tokens/import/index.js";
import { importTokens } from "../../src/tokens/importer.js";
import { buildRegistry } from "../../src/tokens/registry.js";
import { tokenFileSchema, type TokenFile } from "../../src/tokens/schema.js";
import { DesignRailError } from "../../src/utilities/errors.js";
import { project, read, setupProject, writeFiles } from "../helpers.js";

const fixtures = join(import.meta.dirname, "..", "fixtures", "tokens");
const fixture = (name: string) => readFileSync(join(fixtures, name), "utf8");

describe("token registry", () => {
  it("resolves alias chains and indexes references", () => {
    const registry = buildRegistry({
      schemaVersion: 1,
      tokens: {
        "color.brand": {
          type: "color",
          value: "#2563eb",
          references: { cssVariables: ["--brand"], tailwindKeys: ["brand"] },
        },
        "color.primary": { type: "color", value: "{color.brand}" },
        "color.action": { type: "color", value: "{color.primary}" },
      },
    });
    expect(registry.byName.get("color.action")!.resolved).toBe("#2563eb");
    expect(registry.byCssVariable.get("--brand")!.name).toBe("color.brand");
    expect(registry.byTailwindKey.get("color")!.get("brand")!.name).toBe("color.brand");
    expect(registry.problems).toEqual([]);
  });

  it("reports cycles and missing aliases with clear messages", () => {
    const registry = buildRegistry(tokenFileSchema.parse(JSON.parse(fixture("cycle.json"))));
    const messages = registry.problems.map((p) => p.message);
    expect(messages.some((m) => /Alias cycle: color\.a -> color\.b -> color\.c -> color\.a/.test(m))).toBe(
      true,
    );
    expect(messages).toContain("Token color.d refers to missing token {color.missing}");
  });

  it("reports type mismatches and duplicate references", () => {
    const registry = buildRegistry({
      schemaVersion: 1,
      tokens: {
        "color.a": { type: "color", value: "#fff", references: { cssVariables: ["--x"] } },
        "spacing.a": { type: "spacing", value: "{color.a}", references: { cssVariables: ["--x"] } },
      },
    });
    expect(registry.problems.map((p) => p.kind).sort()).toEqual(["duplicate-reference", "type-mismatch"]);
  });
});

describe("CSS custom property import", () => {
  const css = `
@layer base {
  :root {
    --color-brand: #2563eb;
    --space-4: 1rem;
    --radius: 0.5rem;
    --primary: oklch(0.6 0.2 250);
    --primary-hover: var(--primary);
    --shell: 0 0% 100%;
    --gutter: 24px;
    --radius-sm: calc(var(--radius) - 2px);
    --font-family-body: "Inter", sans-serif;
  }
  .dark { --color-brand: #60a5fa; }
}
@media (min-width: 768px) { :root { --gutter: 32px; } }
`;
  it("imports base values, preserves units, and skips ambiguous or scoped values", () => {
    const result = runImport("src/tokens.css", css, "css");
    const byName = Object.fromEntries(result.tokens.map((t) => [t.name, t.token]));
    expect(byName["color.brand"]).toMatchObject({
      type: "color",
      value: "#2563eb",
      references: { cssVariables: ["--color-brand"] },
    });
    expect(byName["spacing.4"]).toMatchObject({ type: "spacing", value: "1rem" });
    expect(byName["radius.default"]).toMatchObject({ type: "radius", value: "0.5rem" });
    expect(byName["color.primary"]!.type).toBe("color");
    expect(byName["radius.sm"]).toMatchObject({ unresolved: "computed expression" });
    expect(byName["font-family.body"]!.value).toEqual(["Inter", "sans-serif"]);
    const skipped = Object.fromEntries(result.skipped.map((s) => [s.name, s.reason]));
    expect(skipped["--shell"]).toMatch(/HSL channels/);
    expect(skipped["--gutter"]).toMatch(/ambiguous/);
    expect(result.skipped.some((s) => s.name === "--color-brand" && /\.dark/.test(s.reason))).toBe(true);
    expect(result.skipped.some((s) => /@media/.test(s.reason))).toBe(true);
    // --primary-hover is var(--primary) but its type cannot be inferred from the name alone.
    expect(skipped["--primary-hover"]).toBeDefined();
  });

  it("honors --assume-type for ambiguous entries only when the value fits", () => {
    const result = runImport("src/tokens.css", ":root { --gutter: 24px; --shell: 0 0% 100%; }", "css", {
      assumeType: "spacing",
    });
    expect(result.tokens.map((t) => t.name)).toEqual(["spacing.gutter"]);
  });

  it("turns var() references into aliases during merge", () => {
    const result = runImport(
      "a.css",
      ":root { --color-base: #111111; --color-text: var(--color-base); }",
      "css",
    );
    const merged = mergeTokens({ schemaVersion: 1, tokens: {} }, result, { replace: false });
    expect(merged.file.tokens["color.text"]).toMatchObject({ value: "{color.base}" });
    expect(merged.file.tokens["color.text"]!.unresolved).toBeUndefined();
    expect(buildRegistry(merged.file).byName.get("color.text")!.resolved).toBe("#111111");
  });

  it("reports malformed CSS as a parse error", () => {
    expect(() => runImport("bad.css", ":root { --a: #fff", "css")).toThrow(DesignRailError);
  });
});

describe("Tailwind v4 @theme import", () => {
  it("maps verified namespaces, attaches @theme inline keys to :root tokens, and reports the rest", () => {
    const css = `@import "tailwindcss";
:root { --brand: #2563eb; }
@theme inline { --color-brand: var(--brand); --color-missing: var(--nope); }
@theme {
  --color-*: initial;
  --color-surface: #fff;
  --spacing: 0.25rem;
  --spacing-md: 1rem;
  --font-sans: Inter, sans-serif;
  --font-weight-bold: 700;
  --text-sm: 0.875rem;
  --text-sm--line-height: 1.25rem;
  --leading-tight: 1.25;
  --radius-md: 0.5rem;
  --shadow-card: 0 1px 2px rgb(0 0 0 / 0.1);
  --breakpoint-md: 48rem;
  --ease-snappy: cubic-bezier(0.2, 0, 0, 1);
}`;
    const result = runImport("src/app.css", css, "tailwind-v4");
    const byName = Object.fromEntries(result.tokens.map((t) => [t.name, t.token]));
    expect(byName["color.brand"]).toMatchObject({
      references: { cssVariables: ["--brand"], tailwindKeys: ["brand"] },
    });
    expect(byName["color.surface"]).toMatchObject({
      references: { cssVariables: ["--color-surface"], tailwindKeys: ["surface"] },
    });
    expect(byName["spacing.md"]!.references!.tailwindKeys).toEqual(["md"]);
    expect(byName["spacing.base"]).toMatchObject({ value: "0.25rem" });
    expect(byName["font-weight.bold"]).toMatchObject({ type: "fontWeight", value: "700" });
    expect(byName["font-family.sans"]).toMatchObject({ value: ["Inter", "sans-serif"] });
    expect(byName["line-height.tight"]!.type).toBe("lineHeight");
    expect(byName["shadow.card"]!.type).toBe("shadow");
    expect(byName["breakpoint.md"]!.references!.tailwindKeys).toEqual(["md"]);
    expect(result.attachments).toEqual([
      expect.objectContaining({ cssVariable: "--nope", tailwindKey: "missing" }),
    ]);
    const reasons = result.skipped.map((s) => `${s.name}: ${s.reason}`).join("\n");
    expect(reasons).toMatch(/--text-sm--line-height: sub-property/);
    expect(reasons).toMatch(/--ease-snappy: Tailwind theme namespace not modeled/);
    expect(result.notes.join(" ")).toMatch(/namespace reset/);
  });
});

describe("Tailwind v3 config import", () => {
  it("reads literal theme values without evaluating the file and reports computed ones", () => {
    const result = runImport("tailwind.config.ts", fixture("tailwind.config.ts"), "tailwind-v3");
    const byName = Object.fromEntries(result.tokens.map((t) => [t.name, t.token]));
    expect(byName["color.brand"]).toMatchObject({
      value: "#2563eb",
      references: { tailwindKeys: ["brand"] },
    });
    expect(byName["color.brand-50"]).toMatchObject({
      value: "#eff6ff",
      references: { tailwindKeys: ["brand-50"] },
    });
    expect(byName["spacing.18"]).toMatchObject({ value: "4.5rem" });
    expect(byName["spacing.gutter"]).toMatchObject({ value: "1.5rem" });
    expect(byName["font-family.sans"]).toMatchObject({
      value: ["Inter"],
      description: expect.stringMatching(/spread/),
    });
    expect(byName["font-family.display"]).toMatchObject({ value: ["Poppins", "sans-serif"] });
    expect(byName["font-size.body"]).toMatchObject({ value: "1rem" });
    expect(byName["radius.default"]).toMatchObject({ references: { tailwindKeys: ["DEFAULT"] } });
    expect(byName["breakpoint.tablet"]).toMatchObject({ value: "640px" });
    expect(result.attachments).toEqual([
      expect.objectContaining({ cssVariable: "--primary", tailwindKey: "primary", type: "color" }),
    ]);
    const skipped = result.skipped.map((s) => `${s.name}: ${s.reason}`).join("\n");
    expect(skipped).toMatch(/theme\.colors\.accent: computed or non-literal value/);
    expect(skipped).toMatch(/theme\.extend\.boxShadow: computed value/);
    expect(skipped).toMatch(/theme\.extend\.screens\.wide: object form/);
    expect(skipped).toMatch(/theme\.extend\.zIndex: theme key not modeled/);
    expect(result.notes.join("\n")).toMatch(/plugins are configured/);
    expect(result.notes.join("\n")).toMatch(/theme\.colors replaces Tailwind's defaults/);
  });

  it("handles module.exports and wrapper calls and never runs code", () => {
    const cjs =
      "globalThis.__ran = true;\nmodule.exports = withPlugin({ theme: { extend: { colors: { ink: '#111' } } } });";
    const result = runImport("tailwind.config.js", cjs, "tailwind-v3");
    expect(result.tokens.map((t) => t.name)).toEqual(["color.ink"]);
    expect(result.notes.join(" ")).toMatch(/wrapped in withPlugin/);
    expect((globalThis as { __ran?: boolean }).__ran).toBeUndefined();
  });
});

describe("DTCG import (documented subset)", () => {
  it("imports supported types with inherited $type, aliases, and derived CSS variables", () => {
    const result = runImport("tokens.json", fixture("dtcg.json"), "dtcg");
    const byName = Object.fromEntries(result.tokens.map((t) => [t.name, t.token]));
    expect(byName["color.brand"]).toMatchObject({
      type: "color",
      value: "#2563eb",
      description: "Primary brand color",
      references: { cssVariables: ["--color-brand"] },
    });
    expect(byName["color.primary"]).toMatchObject({ value: "{color.brand}" });
    expect(byName["color.object"]).toMatchObject({ value: "#0000ff" });
    expect(byName["spacing.md"]).toMatchObject({ type: "spacing", value: "16px" });
    expect(byName["spacing.lg"]).toMatchObject({ value: "24px" });
    expect(byName["font.family.body"]).toMatchObject({ type: "fontFamily", value: ["Inter", "sans-serif"] });
    expect(byName["font.weight.bold"]).toMatchObject({ type: "fontWeight", value: 700 });
    const skipped = Object.fromEntries(result.skipped.map((s) => [s.name, s.reason]));
    expect(skipped["size.icon"]).toMatch(/without a recognized group name/);
    expect(skipped["motion.fast"]).toMatch(/not supported/);
  });

  it("can skip derived CSS variables", () => {
    const result = runImport("tokens.json", fixture("dtcg.json"), "dtcg", { deriveCssVariables: false });
    expect(result.tokens[0]!.token.references).toEqual({});
  });
});

describe("merging imports", () => {
  const existing: TokenFile = {
    schemaVersion: 1,
    tokens: { "color.brand": { type: "color", value: "#2563eb", references: { cssVariables: ["--brand"] } } },
  };

  it("keeps existing values on conflict unless replace is set", () => {
    const incoming = runImport("a.css", ":root { --color-brand: #ff0000; --color-new: #00ff00; }", "css");
    const kept = mergeTokens(existing, incoming, { replace: false });
    expect(kept.added).toEqual(["color.new"]);
    expect(kept.conflicts.map((c) => c.name)).toEqual(["color.brand"]);
    expect(kept.file.tokens["color.brand"]!.value).toBe("#2563eb");
    const replaced = mergeTokens(existing, incoming, { replace: true });
    expect(replaced.file.tokens["color.brand"]).toMatchObject({
      value: "#ff0000",
      references: { cssVariables: ["--brand", "--color-brand"] },
    });
    expect(existing.tokens["color.brand"]!.value).toBe("#2563eb");
  });

  it("merges references for identical values as a change, not a conflict", () => {
    const incoming = runImport("a.css", ":root { --color-brand: #2563eb; }", "css");
    const merged = mergeTokens(existing, incoming, { replace: false });
    expect(merged.changed).toEqual(["color.brand"]);
    expect(merged.conflicts).toEqual([]);
    expect(merged.file.tokens["color.brand"]!.references!.cssVariables).toEqual(["--brand", "--color-brand"]);
  });
});

describe("importTokens (writes)", () => {
  it("leaves the token file byte-for-byte intact when the source is invalid", () => {
    const root = setupProject();
    writeFiles(root, { "bad.json": "{ not json", "bad.css": ":root { --a: #fff" });
    const before = read(root, "designrail/tokens.json");
    expect(() => importTokens(project(root), "bad.json")).toThrow(DesignRailError);
    expect(() => importTokens(project(root), "bad.css")).toThrow(DesignRailError);
    expect(read(root, "designrail/tokens.json")).toBe(before);
  });

  it("refuses imports that would introduce alias cycles, without partial writes", () => {
    const root = setupProject();
    writeFiles(root, { "cycle.json": fixture("cycle.json") });
    const before = read(root, "designrail/tokens.json");
    expect(() => importTokens(project(root), "cycle.json")).toThrow(/inconsistent/);
    expect(read(root, "designrail/tokens.json")).toBe(before);
  });

  it("rejects token sources outside the project", () => {
    const root = setupProject();
    expect(() => importTokens(project(root), "../../etc/hosts.css")).toThrow(/outside the project root/);
  });

  it("records CSS sources as token definition files and preserves config comments", () => {
    const root = setupProject();
    writeFiles(root, { "src/theme.css": ":root { --color-ink: #111111; }" });
    const result = importTokens(project(root), "src/theme.css");
    expect(result.written).toBe(true);
    expect(project(root).config.tokens.definitionFiles).toEqual(["src/theme.css"]);
    expect(read(root, "designrail/config.yaml")).toMatch(/# DesignRail configuration/);
  });

  it("keeps Tailwind keys checkable when they wrap unregistered HSL-channel variables (shadcn/ui v3 style)", async () => {
    const { runCheck } = await import("../../src/checker/engine.js");
    const root = setupProject({ tokens: {}, tailwind: "v3" });
    writeFiles(root, {
      "src/globals.css": ":root { --background: 0 0% 100%; --primary: 222 47% 11%; }",
      "tailwind.config.js":
        "module.exports = { theme: { extend: { colors: { background: 'hsl(var(--background))', primary: { DEFAULT: 'hsl(var(--primary))' } } } } };",
      "src/A.tsx":
        'export const A = () => <div className="bg-background text-primary border-[#ffffff]" />;\n',
    });
    const css = importTokens(project(root), "src/globals.css");
    expect(css.merge.added).toEqual([]);
    const tw = importTokens(project(root), "tailwind.config.js");
    expect(tw.merge.added).toEqual(["color.background", "color.primary"]);
    expect(project(root).tokenFile.tokens["color.background"]).toMatchObject({
      value: "hsl(var(--background))",
      unresolved: "references --background",
      references: { tailwindKeys: ["background"] },
    });
    const report = runCheck(project(root), { paths: ["src/A.tsx"] });
    expect(report.violations.map((v) => v.evidence)).toEqual(['class "border-[#ffffff]"']);
  });

  it("does not write in dry-run mode", () => {
    const root = setupProject();
    writeFiles(root, { "src/theme.css": ":root { --color-ink: #111111; }" });
    const before = read(root, "designrail/tokens.json");
    const result = importTokens(project(root), "src/theme.css", { dryRun: true });
    expect(result.merge.added).toEqual(["color.ink"]);
    expect(read(root, "designrail/tokens.json")).toBe(before);
    expect(project(root).config.tokens.definitionFiles).toEqual([]);
  });
});
