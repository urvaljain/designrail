import { describe, expect, it } from "vitest";
import { check, ofRule, setupProject } from "../../helpers.js";

describe("DR003 font families", () => {
  it("accepts token references and configured fallbacks", () => {
    const root = setupProject();
    const v = check(root, {
      "src/ok.css":
        ".a { font-family: var(--font-sans); } .b { font-family: var(--font-mono), monospace; } .c { font-family: system-ui, sans-serif; } .d { font-family: inherit; }",
      "src/Ok.tsx":
        'export const Ok = () => <p className="font-sans font-mono font-bold font-[600]" style={{ fontFamily: "var(--font-sans)" }} />;',
    });
    expect(ofRule(v, "DR003")).toEqual([]);
  });

  it("flags unapproved families with exact (not substring) matching", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/f.css": ".a { font-family: 'Inter Tight', sans-serif; } .b { font-family: Helvetica, Arial; }",
        "src/F.tsx":
          'export const F = () => <p className="font-[\'Comic_Sans_MS\']" style={{ fontFamily: "Georgia, serif" }} />;',
      }),
      "DR003",
    );
    expect(v.map((x) => x.message)).toEqual([
      "Font family 'Comic Sans MS' not approved by any font-family token",
      "Font family Georgia not approved by any font-family token",
      "Font family 'Inter Tight' not approved by any font-family token",
      "Font families Helvetica, Arial not approved by any font-family token",
    ]);
  });

  it("flags literal lists that repeat a token instead of referencing it", () => {
    const root = setupProject();
    const [finding] = ofRule(
      check(root, { "src/r.css": '.a { font-family: "Inter", sans-serif; }' }),
      "DR003",
    );
    expect(finding!.message).toMatch(/repeats approved families/);
    expect(finding!.suggestion).toMatch(/var\(--font-sans\)/);
    const relaxed = setupProject({
      configEdits: [["  rawValues: forbid", "  rawValues: allow-matching-tokens"]],
    });
    expect(
      ofRule(check(relaxed, { "src/r.css": '.a { font-family: "Inter", sans-serif; }' }), "DR003"),
    ).toEqual([]);
  });

  it("reports the font shorthand as unanalyzed instead of guessing", async () => {
    const root = setupProject();
    const { runCheck } = await import("../../../src/checker/engine.js");
    const { writeFiles, project } = await import("../../helpers.js");
    writeFiles(root, { "src/s.css": ".a { font: 12px/1.5 Papyrus; }" });
    const report = runCheck(project(root), { paths: ["src/s.css"] });
    expect(ofRule(report.violations, "DR003")).toEqual([]);
    expect(report.unsupported.map((u) => u.kind)).toEqual(["font-shorthand"]);
  });
});
