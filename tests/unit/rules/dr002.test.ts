import { describe, expect, it } from "vitest";
import { runCheck } from "../../../src/checker/engine.js";
import { check, ofRule, project, setupProject, writeFiles } from "../../helpers.js";

describe("DR002 spacing", () => {
  it("flags raw spacing literals in CSS, inline styles, and arbitrary utilities", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/s.css": ".a { margin: 0 13px; padding-inline: 16px; gap: 1.5rem; }",
        "src/S.tsx":
          'export const S = () => <div className="p-[7px] -mt-[4px]" style={{ padding: 12, marginTop: "2em" }} />;',
      }),
      "DR002",
    );
    // Files are ordered by code point, so src/S.tsx precedes src/s.css.
    expect(v.map((x) => x.evidence)).toEqual([
      'class "p-[7px]"',
      'class "-mt-[4px]"',
      "padding: 12 (numeric inline style, rendered as 12px)",
      "margin-top: 2em",
      "margin: 0 13px",
      "padding-inline: 16px",
      "gap: 1.5rem",
    ]);
    expect(v[5]!.message).toMatch(/matches a token/);
    expect(v[5]!.suggestion).toMatch(/var\(--spacing-md\)/);
  });

  it("accepts token references, zero, auto, keywords, env(), and token-only calc()", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/ok.css": [
          ".a { margin: 0 auto; padding: var(--spacing-md) var(--spacing-sm); gap: inherit; }",
          ".b { margin-top: calc(var(--spacing-md) * -1); padding-bottom: env(safe-area-inset-bottom); }",
          ".c { margin: -0px; padding: 10%; }",
        ].join("\n"),
        "src/Ok.tsx":
          'export const Ok = () => <div className="p-md gap-sm -mt-md m-0 mx-auto px-[var(--spacing-sm)] py-(--spacing-lg)" style={{ margin: 0 }} />;',
      }),
      "DR002",
    );
    expect(v).toEqual([]);
  });

  it("flags raw lengths inside calc() under tokens-only and follows the calc policy", () => {
    const root = setupProject();
    expect(
      ofRule(check(root, { "src/c.css": ".a { margin: calc(var(--spacing-md) + 3px); }" }), "DR002")[0]!
        .message,
    ).toMatch(/Raw length 3px inside calc/);
    const allow = setupProject({ configEdits: [["    calc: tokens-only", "    calc: allow"]] });
    expect(
      ofRule(check(allow, { "src/c.css": ".a { margin: calc(var(--spacing-md) + 3px); }" }), "DR002"),
    ).toEqual([]);
  });

  it("applies documented percentage and zero policies", () => {
    const root = setupProject({
      configEdits: [
        ["    percentages: allow", "    percentages: flag"],
        ["    zero: allow", "    zero: flag"],
      ],
    });
    const v = ofRule(check(root, { "src/p.css": ".a { padding: 5%; margin: 0; }" }), "DR002");
    expect(v.map((x) => x.message)).toEqual([
      expect.stringMatching(/Percentage/),
      expect.stringMatching(/Zero spacing/),
    ]);
  });

  it("does not equate px and rem without remBasePx, and suggests across units when set", () => {
    const strict = setupProject();
    const [noConversion] = ofRule(check(strict, { "src/r.css": ".a { gap: 24px; }" }), "DR002");
    expect(noConversion!.message).toMatch(/not a registered spacing token/);
    expect(noConversion!.suggestion).not.toMatch(/spacing\.lg/);

    const converting = setupProject({ configEdits: [["  remBasePx: null", "  remBasePx: 16"]] });
    const [converted] = ofRule(check(converting, { "src/r.css": ".a { gap: 24px; }" }), "DR002");
    expect(converted!.message).toMatch(/matches a token/);
    expect(converted!.suggestion).toMatch(/spacing\.lg/);
  });

  it("does not interpret Tailwind numeric suffixes as pixels: unknown mappings are coverage notes", () => {
    const root = setupProject();
    writeFiles(root, { "src/N.tsx": 'export const N = () => <div className="p-4 gap-2 m-px p-huge" />;' });
    const report = runCheck(project(root), { paths: ["src/N.tsx"] });
    expect(ofRule(report.violations, "DR002")).toEqual([]);
    expect(
      report.unsupported
        .filter((u) => u.kind === "unresolved-tailwind-spacing")
        .map((u) => u.detail.split(":")[0]),
    ).toEqual(["p-4", "gap-2", "m-px", "p-huge"]);
    expect(report.files[0]!.analysis).toBe("partial");
    expect(report.result.status).toBe("pass");
  });

  it("follows the numericSpacing policy when set explicitly", () => {
    const flag = setupProject({ configEdits: [["    numericSpacing: unknown", "    numericSpacing: flag"]] });
    expect(
      ofRule(check(flag, { "src/N.tsx": 'export const N = () => <div className="p-4" />;' }), "DR002"),
    ).toHaveLength(1);
    const allow = setupProject({
      configEdits: [["    numericSpacing: unknown", "    numericSpacing: allow"]],
    });
    const report = runCheck(project(allow), { paths: [] });
    writeFiles(allow, { "src/N.tsx": 'export const N = () => <div className="p-4" />;' });
    expect(report.violations).toEqual([]);
    expect(runCheck(project(allow), { paths: ["src/N.tsx"] }).unsupported).toEqual([]);
  });

  it("does not check non-spacing properties", () => {
    const root = setupProject();
    expect(
      ofRule(check(root, { "src/w.css": ".a { width: 13px; top: 3px; border-width: 1px; }" }), "DR002"),
    ).toEqual([]);
  });
});
