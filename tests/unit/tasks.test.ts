import { describe, expect, it } from "vitest";
import { renderTaskBrief, suggestComponents, writeTask } from "../../src/tasks/brief.js";
import { project, read, setupProject, STANDARD_COMPONENTS } from "../helpers.js";
import { componentFileSchema } from "../../src/components/schema.js";

describe("task briefs", () => {
  it("contains every section, preserves the request, and makes no fabricated claims", () => {
    const root = setupProject();
    const request = "Add a profile form with email field.\nUse ``` fences ``` safely.";
    const text = renderTaskBrief(project(root), request, "2026-01-15");
    for (const heading of [
      "## Original request",
      "## Intended outcome (to confirm)",
      "## Scope",
      "## Assumptions and open questions",
      "## Relevant components",
      "## Design policies",
      "## Responsive guidance",
      "## Accessibility guidance",
      "## Implementation checklist",
      "## Acceptance criteria",
      "## Verification commands",
      "## Implementation prompt",
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain("````\nAdd a profile form with email field.\nUse ``` fences ``` safely.\n````");
    expect(text).toContain("No assumptions were made");
    expect(text).toContain("Files affected: not determined by DesignRail");
    expect(text).toContain("Keyword-matched suggestions");
    expect(text).toMatch(/Which validation rules apply/);
    expect(text).toContain("inspect the code where this change belongs".replace("inspect", "Inspect"));
  });

  it("labels keyword matches as suggestions", () => {
    const components = componentFileSchema.parse({
      schemaVersion: 1,
      components: STANDARD_COMPONENTS,
    }).components;
    const s = suggestComponents("Add a save button and an email field", components);
    expect(s.map((x) => [x.component.exportName, x.matched])).toEqual([
      ["Button", ["button", "save"]],
      ["Input", ["email", "field"]],
    ]);
    expect(suggestComponents("Show a chart", components)).toEqual([]);
  });

  it("uses safe filenames and never overwrites on collision", () => {
    const root = setupProject();
    const p = project(root);
    const a = writeTask(p, "Build ../../etc/passwd page!", { date: "2026-01-15" });
    const b = writeTask(p, "Build ../../etc/passwd page!", { date: "2026-01-15" });
    expect(a.path).toBe("designrail/tasks/2026-01-15-build-etc-passwd-page.md");
    expect(b.path).toBe("designrail/tasks/2026-01-15-build-etc-passwd-page-2.md");
    expect(read(root, a.path)).toContain("Build ../../etc/passwd page!");
    expect(() => writeTask(p, "   ", { date: "2026-01-15" })).toThrow(/empty/);
  });
});
