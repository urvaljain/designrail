import { describe, expect, it } from "vitest";
import { check, ofRule, setupProject } from "../../helpers.js";

describe("DR001 hard-coded colors", () => {
  it("flags literal colors in className arbitrary values, inline styles, and CSS with exact locations", () => {
    const root = setupProject();
    const v = check(root, {
      "src/A.tsx": [
        "export function A() {",
        '  return <div className="p-md bg-[#ff0000] text-[rgb(1,2,3)]" style={{ color: "hsl(0 0% 0%)" }} />;',
        "}",
      ].join("\n"),
      "src/a.css": ".x {\n  border: 1px solid #cccccc;\n  background: var(--color-brand);\n}\n",
    });
    const hits = ofRule(v, "DR001").map((x) => `${x.file}:${x.line}:${x.column}`);
    // Columns are 1-based: `bg-[#ff0000]` starts at column 31 of line 2.
    expect(hits).toEqual(["src/A.tsx:2:31", "src/A.tsx:2:44", "src/A.tsx:2:72", "src/a.css:2:3"]);
  });

  it("suggests the token whose value matches, without accepting the literal", () => {
    const root = setupProject();
    const [finding] = ofRule(check(root, { "src/a.css": ".x { color: #FFF; }" }), "DR001");
    expect(finding!.suggestion).toMatch(/var\(--color-surface\)/);
    expect(finding!.severity).toBe("error");
    const [cls] = ofRule(
      check(root, { "src/B.tsx": 'export const B = () => <p className="text-[#2563eb]" />;' }),
      "DR001",
    );
    expect(cls!.suggestion).toMatch(/text-brand/);
  });

  it("accepts token references, CSS keywords, wrapped variables, and local custom properties", () => {
    const root = setupProject();
    const v = check(root, {
      "src/ok.tsx": [
        "export const Ok = () => (",
        '  <div className="bg-brand text-text border-surface/50 bg-transparent text-current bg-[var(--color-brand)] bg-(--color-brand)"',
        '    style={{ color: "var(--color-text)", borderColor: "currentColor" }} />',
        ");",
      ].join("\n"),
      "src/ok.css": ".a { --local: var(--color-brand); color: var(--local); fill: hsl(var(--color-brand)); }",
    });
    expect(ofRule(v, "DR001")).toEqual([]);
  });

  it("does not flag color strings in prose, URLs, IDs, or ordinary logic", () => {
    const root = setupProject();
    const v = check(root, {
      "src/prose.tsx": [
        'const BRAND_HEX = "#2563eb"; // data, not styling',
        'const fills = { warning: "#ffcc00" };',
        "export function Prose() {",
        '  console.log("#fff", fills.warning);',
        '  return <a href="#fff" title="Use #fff on dark" data-color="#000">Colors like #fff and rgb(0,0,0) are described here.</a>;',
        "}",
      ].join("\n"),
      "src/urls.css": '.b { background-image: url("#abc"), url(img/#fff.png); content: "#fff"; }',
    });
    expect(ofRule(v, "DR001")).toEqual([]);
  });

  it("exempts token definition files", () => {
    const root = setupProject({
      configEdits: [["  definitionFiles: []", "  definitionFiles: [src/tokens.css]"]],
    });
    const v = check(root, {
      "src/tokens.css": ":root { --color-brand: #2563eb; }\n@theme { --color-x: #fff; }",
      "src/other.css": ":root { --color-y: #fff; }",
    });
    expect(ofRule(v, "DR001").map((x) => x.file)).toEqual(["src/other.css"]);
    expect(ofRule(v, "DR001")[0]!.message).toMatch(/Custom property --color-y defines a hard-coded color/);
  });

  it("flags Tailwind default palette utilities by policy, and allows them when configured", () => {
    const flagged = setupProject();
    expect(
      ofRule(
        check(flagged, {
          "src/p.tsx": 'export const P = () => <p className="text-blue-500 hover:bg-slate-50 bg-white" />;',
        }),
        "DR001",
      ),
    ).toHaveLength(3);
    const allowed = setupProject({
      configEdits: [["    defaultPalette: flag", "    defaultPalette: allow"]],
    });
    expect(
      ofRule(
        check(allowed, { "src/p.tsx": 'export const P = () => <p className="text-blue-500" />;' }),
        "DR001",
      ),
    ).toEqual([]);
  });

  it("reports unregistered CSS variables as medium-confidence warnings", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, { "src/v.css": ".a { color: var(--made-up); background-color: var(--spacing-md); }" }),
      "DR001",
    );
    expect(v.map((x) => [x.severity, x.confidence])).toEqual([
      ["warning", "medium"],
      ["warning", "medium"],
    ]);
    expect(v[1]!.message).toMatch(/spacing token/);
  });

  it("flags hard-coded fallbacks of unregistered variables only", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/f.css": ".a { color: var(--color-brand, #fff); background: var(--unknown, #000); }",
      }),
      "DR001",
    );
    expect(v.map((x) => x.message)).toEqual([expect.stringMatching(/fallback color #000/)]);
  });

  it("allows matching raw values only under the explicit allow-matching-tokens policy", () => {
    const root = setupProject({
      configEdits: [["  rawValues: forbid", "  rawValues: allow-matching-tokens"]],
    });
    const v = ofRule(check(root, { "src/m.css": ".a { color: #2563eb; background: #123456; }" }), "DR001");
    expect(v.map((x) => x.evidence)).toEqual(["background: #123456"]);
  });

  it("ignores test files by default", () => {
    const root = setupProject();
    const v = check(root, { "src/A.test.tsx": 'export const T = () => <p className="bg-[#fff]" />;' }, [
      "src",
    ]);
    expect(v).toEqual([]);
  });
});
