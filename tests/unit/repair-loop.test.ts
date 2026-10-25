import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCheck } from "../../src/checker/engine.js";
import { renderFixPrompt } from "../../src/reports/fix-prompt.js";
import { reportFreshness } from "../../src/reports/freshness.js";
import { readReport, writeReport } from "../../src/reports/store.js";
import { project, setupProject, writeFiles } from "../helpers.js";

function checked() {
  const root = setupProject();
  writeFiles(root, { "src/A.tsx": 'export const A = () => <img className="bg-[#abcdef]" />;' });
  const report = runCheck(project(root), {});
  writeReport(project(root), "designrail/reports/latest.json", report);
  return { root, report };
}

describe("report freshness", () => {
  it("is fresh right after a check", () => {
    const { root, report } = checked();
    expect(reportFreshness(project(root), report)).toEqual({ fresh: true, reasons: [] });
  });

  it.each([
    [
      "source edit",
      (root: string) => writeFileSync(join(root, "src/A.tsx"), "export const A = () => null;\n"),
      /files changed since the report: src\/A\.tsx/,
    ],
    ["deleted file", (root: string) => rmSync(join(root, "src/A.tsx")), /no longer present: src\/A\.tsx/],
    [
      "new file",
      (root: string) => writeFiles(root, { "src/B.tsx": "export {};" }),
      /new files in scope.*src\/B\.tsx/,
    ],
    [
      "token change",
      (root: string) =>
        writeFiles(root, { "designrail/tokens.json": JSON.stringify({ schemaVersion: 1, tokens: {} }) }),
      /tokens\.json changed/,
    ],
    [
      "config change",
      (root: string) =>
        writeFiles(root, {
          "designrail/config.yaml":
            "schemaVersion: 1\ncheck: { failOn: warning }\nsource: { include: ['src/**/*.{tsx,ts,css}'] }\n",
        }),
      /config\.yaml changed/,
    ],
  ])("detects %s", (_label, mutate, reason) => {
    const { root, report } = checked();
    mutate(root);
    const freshness = reportFreshness(project(root), report);
    expect(freshness.fresh).toBe(false);
    expect(freshness.reasons.join("\n")).toMatch(reason);
  });

  it("rejects reports that do not match the schema", () => {
    const { root } = checked();
    writeFiles(root, {
      "designrail/reports/latest.json": JSON.stringify({ schemaVersion: 1, tool: { name: "other" } }),
    });
    expect(() => readReport(project(root), "designrail/reports/latest.json")).toThrow(
      /does not match the DesignRail report schema/,
    );
  });
});

describe("fix prompt", () => {
  it("cites rule IDs, locations, evidence, relevant tokens, scope limits, and verification", () => {
    const { root, report } = checked();
    const text = renderFixPrompt(project(root), report, "designrail/reports/latest.json");
    expect(text).toContain("**DR001** (error, high confidence) at line 1, column 40");
    expect(text).toContain('Evidence: `class "bg-[#abcdef]"`');
    expect(text).toContain("**DR006**");
    expect(text).toContain("## Approved tokens");
    expect(text).toContain("| color.brand | #2563eb |");
    expect(text).not.toContain("spacing.md");
    expect(text).toMatch(/Avoid unrelated refactors/);
    expect(text).toMatch(/Preserve existing behavior/);
    expect(text).toMatch(/leave it unchanged and explain why/);
    expect(text).toMatch(/Run `npx designrail check`/);
  });

  it("does not invent work when there are no findings", () => {
    const root = setupProject();
    const report = runCheck(project(root), {});
    const text = renderFixPrompt(project(root), report, "designrail/reports/latest.json");
    expect(text).toContain("There is nothing to repair.");
    expect(text).not.toContain("## Findings");
  });
});
