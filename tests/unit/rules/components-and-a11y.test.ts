import { describe, expect, it } from "vitest";
import { check, ofRule, setupProject, STANDARD_COMPONENTS } from "../../helpers.js";

describe("DR004 raw elements", () => {
  it("flags raw elements that a registered component replaces", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/Page.tsx": [
          "export function Page() {",
          "  return (",
          "    <form>",
          '      <button type="submit">Save</button>',
          '      <input type="email" aria-label="Email" />',
          '      <input aria-label="Name" />',
          '      <input type="checkbox" aria-label="Agree" />',
          "    </form>",
          "  );",
          "}",
        ].join("\n"),
      }),
      "DR004",
    );
    expect(v.map((x) => `${x.line}:${x.column} ${x.evidence} ${x.component}`)).toEqual([
      "4:7 <button> button",
      '5:7 <input type="email"> input',
      '6:7 <input type="text"> input',
    ]);
    expect(v[0]!.suggestion).toMatch(/import \{ Button \} from "@\/components\/ui\/button"/);
  });

  it("exempts the component's own implementation files", () => {
    const root = setupProject();
    expect(check(root, {}, ["src/components/ui/button.tsx", "src/components/ui/input.tsx"])).toEqual([]);
    const withExtra = setupProject({
      components: [
        { ...STANDARD_COMPONENTS[0]!, implementationFiles: ["src/components/ui/button-base.tsx"] },
      ],
      files: { "src/components/ui/button-base.tsx": "export const Base = () => <button />;" },
    });
    expect(ofRule(check(withExtra, {}, ["src"]), "DR004")).toEqual([]);
  });

  it("only flags explicit mappings and treats dynamic qualifying attributes as unknown", async () => {
    const root = setupProject();
    const v = check(root, {
      "src/X.tsx":
        'export const X = ({ t }: { t: string }) => <><a href="/">Home</a><input type={t} aria-label="x" /><Button /></>;',
    });
    expect(ofRule(v, "DR004")).toEqual([]);
  });

  it("supports approved exceptions with reasons", () => {
    const root = setupProject({
      configEdits: [
        [
          "exceptions: []",
          'exceptions:\n  - rule: DR004\n    files: ["src/legacy/**"]\n    values: [button]\n    reason: Legacy page scheduled for rewrite',
        ],
      ],
    });
    const v = check(root, {
      "src/legacy/Old.tsx": "export const Old = () => <button />;",
      "src/New.tsx": "export const New = () => <button />;",
    });
    expect(ofRule(v, "DR004").map((x) => x.file)).toEqual(["src/New.tsx"]);
  });
});

describe("DR005 inline styles", () => {
  it("allows token references and reports other values once", () => {
    const root = setupProject();
    const v = check(root, {
      "src/S.tsx": [
        "export const S = ({ w }: { w: number }) => (",
        '  <div style={{ color: "var(--color-text)", opacity: 0.5, padding: 13, width: w, ["--x" as string]: 1 }} />',
        ");",
      ].join("\n"),
    });
    expect(ofRule(v, "DR005").map((x) => x.evidence)).toEqual(["opacity: 0.5"]);
    expect(ofRule(v, "DR002")).toHaveLength(1);
    expect(ofRule(v, "DR005")[0]!.severity).toBe("warning");
  });

  it("supports forbid and allow policies", () => {
    const forbid = setupProject({
      configEdits: [["  inlineStyles: allow-token-references", "  inlineStyles: forbid"]],
    });
    expect(
      ofRule(
        check(forbid, {
          "src/S.tsx": 'export const S = () => <div style={{ color: "var(--color-text)" }} />;',
        }),
        "DR005",
      ),
    ).toHaveLength(1);
    const allow = setupProject({
      configEdits: [["  inlineStyles: allow-token-references", "  inlineStyles: allow"]],
    });
    expect(
      ofRule(
        check(allow, { "src/S.tsx": "export const S = () => <div style={{ opacity: 0.5 }} />;" }),
        "DR005",
      ),
    ).toEqual([]);
  });
});

describe("DR006 image alt", () => {
  it("distinguishes missing, empty, dynamic, and nullish alt", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/I.tsx": [
          'import Image from "next/image";',
          "export const I = ({ alt, rest }: { alt: string; rest: object }) => (",
          "  <>",
          '    <img src="a.png" />',
          '    <img src="b.png" alt="" />',
          '    <img src="c.png" alt={alt} />',
          '    <img src="d.png" alt={undefined} />',
          '    <img src="e.png" {...rest} />',
          '    <Image src="f.png" width={1} height={1} />',
          '    <Avatar src="g.png" />',
          "  </>",
          ");",
        ].join("\n"),
      }),
      "DR006",
    );
    expect(v.map((x) => `${x.line} ${x.message}`)).toEqual([
      "4 <img> is missing an alt attribute",
      "7 <img> has alt={undefined}, which renders no alt attribute",
      "9 <Image> is missing an alt attribute",
    ]);
  });
});

describe("DR007 form labels", () => {
  it("accepts wrapping labels, htmlFor/id, aria-label, aria-labelledby, and title", () => {
    const root = setupProject();
    const v = check(root, {
      "src/F.tsx": [
        "export const F = ({ id }: { id: string }) => (",
        "  <form>",
        '    <label>Name <input type="checkbox" /></label>',
        '    <label htmlFor="email">Email</label><select id="email" />',
        '    <textarea aria-label="Notes" />',
        '    <span id="l">Bio</span><textarea aria-labelledby="l" />',
        '    <input type="checkbox" title="Remember me" />',
        '    <label htmlFor={id}>Dyn</label><input type="checkbox" id={id} />',
        '    <input type="hidden" name="csrf" />',
        '    <input type="submit" value="Go" />',
        "  </form>",
        ");",
      ].join("\n"),
    });
    expect(ofRule(v, "DR007")).toEqual([]);
  });

  it("flags controls without accessible names and explains describedby/placeholder", () => {
    const root = setupProject();
    const v = ofRule(
      check(root, {
        "src/F.tsx": [
          "export function F() {",
          "  return (",
          "    <div>",
          '      <select aria-describedby="help" />',
          '      <textarea placeholder="Say something" />',
          '      <input type="checkbox" id="orphan" />',
          "    </div>",
          "  );",
          "}",
        ].join("\n"),
      }),
      "DR007",
    );
    expect(v.map((x) => [x.line, x.severity, x.confidence])).toEqual([
      [4, "error", "high"],
      [5, "error", "high"],
      [6, "warning", "medium"],
    ]);
    expect(v[0]!.message).toMatch(/aria-describedby adds a description, not a name/);
    expect(v[1]!.message).toMatch(/placeholder is not a label/);
  });

  it("treats cross-component relationships cautiously", async () => {
    const root = setupProject();
    const { runCheck } = await import("../../../src/checker/engine.js");
    const { writeFiles, project } = await import("../../helpers.js");
    writeFiles(root, {
      "src/C.tsx": [
        "export const Spread = (props: object) => <select {...props} />;",
        "export const Dyn = ({ id }: { id: string }) => <div><textarea id={id} /></div>;",
        "export function Root() {",
        "  return <textarea />;",
        "}",
      ].join("\n"),
    });
    const report = runCheck(project(root), { paths: ["src/C.tsx"] });
    expect(ofRule(report.violations, "DR007").map((x) => [x.line, x.severity, x.confidence])).toEqual([
      [4, "warning", "medium"],
    ]);
    expect(report.unsupported.map((u) => u.kind).sort()).toEqual(["cross-component-label", "spread-props"]);
  });

  it("recognizes registered label components", () => {
    const root = setupProject({
      components: [
        ...STANDARD_COMPONENTS,
        {
          id: "label",
          exportName: "Label",
          sourceFile: "src/components/ui/label.tsx",
          importSpecifier: "@/components/ui/label",
          exportKind: "named",
          replaces: ["label"],
        },
      ],
      files: { "src/components/ui/label.tsx": "export const Label = (p: object) => <label {...p} />;" },
    });
    const v = check(root, {
      "src/L.tsx":
        'import { Label as L } from "@/components/ui/label";\nexport const X = () => <L>Pick <select /></L>;',
    });
    expect(ofRule(v, "DR007")).toEqual([]);
  });
});

describe("DR008 component imports", () => {
  const components = [
    {
      ...STANDARD_COMPONENTS[0]!,
      implementationFiles: ["src/components/ui/button-internals.tsx"],
      importPolicy: {
        alternateSpecifiers: ["@/components/ui"],
        restricted: [{ from: "@mui/material", importName: "Button" }],
      },
    },
  ];
  const files = { "src/components/ui/button-internals.tsx": "export const x = 1;" };

  it("flags restricted imports including aliased named imports", () => {
    const root = setupProject({ components, files });
    const v = ofRule(
      check(root, {
        "src/A.tsx":
          'import { Button as MuiButton, TextField } from "@mui/material";\nexport const A = () => <MuiButton />;',
      }),
      "DR008",
    );
    expect(v.map((x) => [x.line, x.severity, x.message])).toEqual([
      [1, "error", 'Button from "@mui/material" is restricted; use the registered Button'],
    ]);
  });

  it("flags non-recommended specifiers and internal files, accepts approved ones", () => {
    const root = setupProject({ components, files });
    const v = ofRule(
      check(root, {
        "src/features/B.tsx": [
          'import { Button } from "../components/ui/button";',
          'import { x } from "@/components/ui/button-internals";',
          'import { Button as Ok } from "@/components/ui/button";',
          'import { Button as AlsoOk } from "@/components/ui";',
          'import { Button as Other } from "some-library";',
          "export const B = () => null;",
        ].join("\n"),
      }),
      "DR008",
    );
    expect(v.map((x) => [x.line, x.severity])).toEqual([
      [1, "warning"],
      [2, "error"],
    ]);
  });

  it("does not flag an unrelated function that shares the component's name", () => {
    const root = setupProject({ components, files });
    const v = check(root, {
      "src/C.tsx":
        'import { Button } from "./local-button";\nfunction Button2() { return null; }\nexport const C = () => <Button />;',
    });
    expect(ofRule(v, "DR008")).toEqual([]);
  });

  it("exempts the component's own implementation files", () => {
    const root = setupProject({
      components,
      files: {
        "src/components/ui/button-internals.tsx":
          'import { Button } from "@mui/material";\nexport const x = Button;',
      },
    });
    expect(ofRule(check(root, {}, ["src"]), "DR008")).toEqual([]);
  });
});
