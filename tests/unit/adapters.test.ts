import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendSection,
  managedBlock,
  replaceSection,
  scanManagedSection,
  wasEditedManually,
} from "../../src/adapters/markers.js";
import { renderInstructions } from "../../src/adapters/render.js";
import { applySync, hasDrift, planSync } from "../../src/adapters/sync.js";
import { project, read, setupProject, writeFiles } from "../helpers.js";

const all = ["  - id: codex", "  - id: codex\n  - id: claude-code\n  - id: cursor\n  - id: generic"] as [
  string,
  string,
];

describe("managed-section markers", () => {
  it("finds a single well-formed section", () => {
    const text = `# Mine\n\n${managedBlock("body")}\n\nAfter`;
    const scan = scanManagedSection(text);
    expect(scan.kind).toBe("ok");
    if (scan.kind === "ok")
      expect(replaceSection(text, scan, managedBlock("new"))).toBe(
        `# Mine\n\n${managedBlock("new")}\n\nAfter`,
      );
  });

  it.each([
    [
      "duplicate start",
      "<!-- DESIGNRAIL:START -->\n<!-- DESIGNRAIL:START -->\n<!-- DESIGNRAIL:END -->",
      /2 start markers/,
    ],
    ["missing end", "<!-- DESIGNRAIL:START -->\ntext", /without an end/],
    ["missing start", "text\n<!-- DESIGNRAIL:END -->", /without a start/],
    ["reversed", "<!-- DESIGNRAIL:END -->\n<!-- DESIGNRAIL:START -->", /before the start/],
    ["near miss", "<!-- DESIGNRAIL:START v2 -->\n<!-- DESIGNRAIL:END -->", /must be exactly/],
    ["inline", "see <!-- DESIGNRAIL:START --> here\n<!-- DESIGNRAIL:END -->", /must be exactly/],
  ])("reports %s as malformed", (_label, text, problem) => {
    const scan = scanManagedSection(text);
    expect(scan.kind).toBe("malformed");
    if (scan.kind === "malformed") expect(scan.problems.join("\n")).toMatch(problem);
  });

  it("detects manual edits through the content hash", () => {
    const block = managedBlock("generated body");
    const inner = block.split("\n").slice(1, -1).join("\n");
    expect(wasEditedManually(inner)).toBe(false);
    expect(wasEditedManually(inner.replace("generated", "edited"))).toBe(true);
  });

  it("appends with a blank line separator", () => {
    expect(appendSection("# Notes", "B")).toBe("# Notes\n\nB\n");
    expect(appendSection("", "B")).toBe("B\n");
  });
});

describe("instruction content", () => {
  it("covers policies, sources, verification, and limits without promising compliance", () => {
    const root = setupProject();
    const text = renderInstructions(project(root), "codex");
    for (const expected of [
      "do not guarantee compliance",
      "Before implementing",
      "During implementation",
      "After implementing",
      "Run `npx designrail check`",
      "`designrail/tokens.json`",
      "starter template; not yet customized",
      "| color.brand | color | #2563eb | `var(--color-brand)`, `bg-brand`",
      'import { Button } from "@/components/ui/button"',
      "Do not invent props or variants",
      "loading, empty, error, disabled, and success",
      "designrail-ignore-next-line",
      "Responsive behavior is not verified",
    ]) {
      expect(text).toContain(expected);
    }
    expect(text).not.toMatch(/(?<!`)@designrail\//);
  });

  it("points to canonical files instead of inlining large registries", () => {
    const tokens = Object.fromEntries(
      Array.from({ length: 60 }, (_, i) => [
        `color.c${i}`,
        { type: "color" as const, value: "#000000", references: { cssVariables: [`--c${i}`] } },
      ]),
    );
    const root = setupProject({ tokens });
    const text = renderInstructions(project(root), "codex");
    expect(text).toContain("60 tokens are registered (60 colors)");
    expect(text).not.toContain("color.c59");
  });

  it("labels an unconfigured token registry honestly", () => {
    const root = setupProject({ tokens: {} });
    expect(renderInstructions(project(root), "codex")).toContain("No design tokens are registered yet");
  });
});

describe("sync", () => {
  it("creates files, appends to existing instructions without touching user content, and is idempotent", () => {
    const root = setupProject({ configEdits: [all] });
    const userText = "# Team instructions\n\nAlways run tests.\n";
    writeFiles(root, { "AGENTS.md": userText });
    const first = planSync(project(root));
    expect(first.map((i) => [i.id, i.status])).toEqual([
      ["codex", "append"],
      ["claude-code", "create"],
      ["cursor", "create"],
      ["generic", "create"],
    ]);
    applySync(project(root), first);
    const agents = read(root, "AGENTS.md");
    expect(agents.startsWith(userText)).toBe(true);
    expect(read(root, ".cursor/rules/designrail.mdc")).toMatch(
      /^---\ndescription: .+\nalwaysApply: true\n---\n\n<!-- DESIGNRAIL:START -->/,
    );
    expect(read(root, "DESIGNRAIL_CONTEXT.md")).toContain("# DesignRail context");

    const snapshot = ["AGENTS.md", "CLAUDE.md", ".cursor/rules/designrail.mdc", "DESIGNRAIL_CONTEXT.md"].map(
      (f) => read(root, f),
    );
    const second = planSync(project(root));
    expect(second.every((i) => i.status === "unchanged")).toBe(true);
    expect(hasDrift(second)).toBe(false);
    applySync(project(root), second);
    expect(
      ["AGENTS.md", "CLAUDE.md", ".cursor/rules/designrail.mdc", "DESIGNRAIL_CONTEXT.md"].map((f) =>
        read(root, f),
      ),
    ).toEqual(snapshot);
  });

  it("updates only the managed section when inputs change", () => {
    const root = setupProject();
    writeFiles(root, { "AGENTS.md": "Before\n" });
    applySync(project(root), planSync(project(root)));
    writeFileSync(join(root, "AGENTS.md"), `${read(root, "AGENTS.md")}\nAfter text written later\n`);
    writeFiles(root, { "designrail/tokens.json": JSON.stringify({ schemaVersion: 1, tokens: {} }) });
    const plan = planSync(project(root));
    expect(plan[0]!.status).toBe("update");
    applySync(project(root), plan);
    const text = read(root, "AGENTS.md");
    expect(text.startsWith("Before\n")).toBe(true);
    expect(text.endsWith("\nAfter text written later\n")).toBe(true);
    expect(text).toContain("No design tokens are registered yet");
  });

  it("refuses malformed markers and leaves the file unchanged", () => {
    const root = setupProject();
    const broken = "# Mine\n<!-- DESIGNRAIL:START -->\nold\n";
    writeFiles(root, { "AGENTS.md": broken });
    const [item] = planSync(project(root));
    expect(item!.status).toBe("blocked");
    expect(item!.problem!.kind).toBe("malformed-markers");
    applySync(project(root), [item!]);
    expect(read(root, "AGENTS.md")).toBe(broken);
  });

  it("reports a collision for Cursor/generic files DesignRail does not own", () => {
    const root = setupProject({ configEdits: [["  - id: codex", "  - id: cursor"]] });
    writeFiles(root, { ".cursor/rules/designrail.mdc": "---\nalwaysApply: true\n---\nmy own rule\n" });
    const [item] = planSync(project(root));
    expect(item!.problem!.kind).toBe("collision");
  });

  it("blocks hand-edited managed sections unless forced", () => {
    const root = setupProject();
    applySync(project(root), planSync(project(root)));
    writeFileSync(
      join(root, "AGENTS.md"),
      read(root, "AGENTS.md").replace("### Sources of truth", "### Sources of truth (edited)"),
    );
    expect(planSync(project(root))[0]!.problem!.kind).toBe("manual-edit");
    const forced = planSync(project(root), { force: true });
    expect(forced[0]!.status).toBe("update");
  });

  it("treats Prettier-formatted output as unchanged (no drift, no manual-edit block)", async () => {
    const { format } = await import("prettier");
    const root = setupProject({ configEdits: [all] });
    applySync(project(root), planSync(project(root)));
    for (const file of ["AGENTS.md", "CLAUDE.md", ".cursor/rules/designrail.mdc", "DESIGNRAIL_CONTEXT.md"]) {
      const original = read(root, file);
      const formatted = await format(original, { parser: "markdown" });
      expect(formatted).not.toBe(original); // tables were realigned
      writeFileSync(join(root, file), formatted);
    }
    expect(planSync(project(root)).map((i) => i.status)).toEqual([
      "unchanged",
      "unchanged",
      "unchanged",
      "unchanged",
    ]);
  });

  it("preserves CRLF line endings in user files", () => {
    const root = setupProject();
    writeFiles(root, { "AGENTS.md": "# Mine\r\nKeep this\r\n" });
    applySync(project(root), planSync(project(root)));
    const text = read(root, "AGENTS.md");
    expect(text.startsWith("# Mine\r\nKeep this\r\n")).toBe(true);
    expect(text.replace(/\r\n/g, "").includes("\n")).toBe(false);
    expect(planSync(project(root))[0]!.status).toBe("unchanged");
  });

  it("refuses symlinked adapter files", async () => {
    const { symlinkSync } = await import("node:fs");
    const root = setupProject();
    writeFiles(root, { "docs/agents.md": "x" });
    symlinkSync(join(root, "docs/agents.md"), join(root, "AGENTS.md"));
    expect(planSync(project(root))[0]!.problem!.kind).toBe("unsafe-path");
  });
});
