import { describe, expect, it } from "vitest";
import { runCheck } from "../../../src/checker/engine.js";
import { check, ofRule, project, setupProject, writeFiles } from "../../helpers.js";

describe("class extraction", () => {
  it("analyzes static branches in class helpers and records dynamic parts", () => {
    const root = setupProject();
    writeFiles(root, {
      "src/C.tsx": [
        'import { cn } from "./cn";',
        'import { cva } from "class-variance-authority";',
        'const variants = cva("bg-[#111111]", { variants: { tone: { danger: "text-[#222222]", calm: ["bg-brand"] } }, defaultVariants: { tone: "calm" }, compoundVariants: [{ tone: "danger", class: "border-[#333333]" }] });',
        "export const C = ({ on, extra, size }: { on: boolean; extra: string; size: string }) => (",
        '  <div className={cn("p-md", on && "bg-[#444444]", on ? "text-[#555555]" : "text-brand", { "border-[#666666]": on }, extra, `gap-${size} m-[3px]`)} />',
        ");",
      ].join("\n"),
    });
    const report = runCheck(project(root), { paths: ["src/C.tsx"] });
    expect(ofRule(report.violations, "DR001").map((v) => v.evidence)).toEqual([
      'class "bg-[#111111]"',
      'class "text-[#222222]"',
      'class "border-[#333333]"',
      'class "bg-[#444444]"',
      'class "text-[#555555]"',
      'class "border-[#666666]"',
    ]);
    expect(ofRule(report.violations, "DR002").map((v) => v.evidence)).toEqual(['class "m-[3px]"']);
    expect(report.unsupported.map((u) => u.kind)).toEqual([
      "dynamic-class",
      "partial-class",
      "dynamic-class",
    ]);
    expect(report.files[0]!.analysis).toBe("partial");
  });

  it("reads @apply classes in CSS", () => {
    const root = setupProject();
    const v = check(root, { "src/a.css": ".btn {\n  @apply bg-[#abcdef] p-md;\n}" });
    expect(ofRule(v, "DR001").map((x) => `${x.line}:${x.column}`)).toEqual(["2:10"]);
  });
});

describe("suppressions", () => {
  it("suppresses only the listed rule on the next line and requires a reason", () => {
    const root = setupProject();
    writeFiles(root, {
      "src/S.tsx": [
        "export const S = () => (",
        "  <div>",
        "    {/* designrail-ignore-next-line DR004 -- third-party widget needs a native button */}",
        '    <button className="bg-[#123456]" />',
        "    {/* designrail-ignore-next-line DR004 */}",
        "    <button />",
        "    {/* designrail-ignore-next-line DR006 -- nothing to suppress here */}",
        "    <span />",
        "  </div>",
        ");",
      ].join("\n"),
      "src/s.css":
        "/* designrail-ignore-next-line DR001 -- print stylesheet */\n.a { color: #000; }\n.b { color: #000; }",
    });
    const report = runCheck(project(root), { paths: ["src"] });
    expect(report.violations.map((v) => `${v.file}:${v.line} ${v.ruleId}`)).toEqual([
      "src/S.tsx:4 DR001",
      "src/S.tsx:5 DR000",
      "src/S.tsx:6 DR004",
      "src/s.css:3 DR001",
    ]);
    expect(report.summary.suppressed).toBe(2);
    expect(report.suppressions.map((s) => `${s.file}:${s.line} ${s.status}`)).toEqual([
      "src/S.tsx:3 used",
      "src/S.tsx:5 invalid",
      "src/S.tsx:7 unused",
      "src/s.css:1 used",
    ]);
  });
});

describe("suppression placement", () => {
  it("works for a comment between JSX attributes", () => {
    const root = setupProject();
    const v = check(root, {
      "src/A.tsx": [
        "export const A = () => (",
        "  <div",
        "    /* designrail-ignore-next-line DR001 -- chart palette from the data team */",
        '    className="bg-[#123456]"',
        '    title="x"',
        "  />",
        ");",
      ].join("\n"),
    });
    expect(v).toEqual([]);
  });
});

describe("parse failures and scope", () => {
  it("reports malformed files without claiming a clean run", () => {
    const root = setupProject();
    writeFiles(root, {
      "src/Bad.tsx": "export const Bad = () => <div>",
      "src/bad.css": ".a { color: red",
      "src/Good.tsx": "export const G = () => <img />;",
    });
    const report = runCheck(project(root), { paths: ["src"] });
    expect(report.parseFailures.map((f) => f.file)).toEqual(["src/Bad.tsx", "src/bad.css"]);
    expect(report.parseFailures[0]!.line).toBeGreaterThan(0);
    expect(report.result).toMatchObject({ status: "incomplete", exitCode: 2 });
    expect(ofRule(report.violations, "DR006")).toHaveLength(1);
  });

  it("honors include/exclude for explicit paths and reports skipped files", () => {
    const root = setupProject();
    writeFiles(root, {
      "scripts/x.tsx": "export const X = () => <img />;",
      "src/x.test.tsx": "export const T = () => <img />;",
      "src/y.scss": "",
    });
    const report = runCheck(project(root), { paths: ["scripts/x.tsx", "src/x.test.tsx", "src/y.scss"] });
    expect(report.files).toEqual([]);
    expect(report.skipped).toEqual([
      { path: "scripts/x.tsx", reason: "not matched by source.include" },
      { path: "src/x.test.tsx", reason: "matched by source.exclude" },
      { path: "src/y.scss", reason: "not matched by source.include" },
    ]);
  });

  it("reports included files with unsupported types", () => {
    const root = setupProject({ configEdits: [["    - src/**/*.{tsx,jsx,ts,js,css}", "    - src/**/*"]] });
    writeFiles(root, { "src/y.scss": "", "src/z.tsx": "export {};" });
    const report = runCheck(project(root), {});
    expect(report.files.map((f) => f.path)).toEqual([
      "src/components/ui/button.tsx",
      "src/components/ui/input.tsx",
      "src/z.tsx",
    ]);
    expect(report.skipped).toEqual([
      {
        path: "src/y.scss",
        reason: "unsupported file type (supported: .tsx .jsx .ts .js .mjs .cjs .mts .cts .css)",
      },
    ]);
  });

  it("rejects check paths outside the project", () => {
    const root = setupProject();
    expect(() => runCheck(project(root), { paths: ["../"] })).toThrow(/outside the project root/);
  });

  it("refuses to run with token alias cycles", () => {
    const root = setupProject({
      tokens: {
        "color.a": { type: "color", value: "{color.b}" },
        "color.b": { type: "color", value: "{color.a}" },
      },
    });
    expect(() => runCheck(project(root), {})).toThrow(/unresolvable token references/);
  });

  it("produces deterministic reports", () => {
    const root = setupProject();
    writeFiles(root, {
      "src/b.css": ".a { color: #111; margin: 3px; }",
      "src/A.tsx": 'export const A = () => <img className="bg-[#222]" />;',
    });
    const now = new Date("2026-01-01T00:00:00Z");
    const first = JSON.stringify(runCheck(project(root), { now }));
    const second = JSON.stringify(runCheck(project(root), { now }));
    expect(first).toBe(second);
  });

  it("applies severity overrides, disabled rules, failOn, and strict mode", () => {
    const root = setupProject({
      configEdits: [
        ["  DR006: { enabled: true, severity: error }", "  DR006: { enabled: false, severity: error }"],
        ["  DR001: { enabled: true, severity: error }", "  DR001: { enabled: true, severity: warning }"],
      ],
    });
    writeFiles(root, { "src/A.tsx": 'export const A = () => <img className="bg-[#222]" />;' });
    const normal = runCheck(project(root), {});
    expect(normal.violations.map((v) => `${v.ruleId}:${v.severity}`)).toEqual(["DR001:warning"]);
    expect(normal.result.exitCode).toBe(0);
    const strict = runCheck(project(root), { strict: true });
    expect(strict.result).toMatchObject({ exitCode: 1, status: "fail" });
    expect(strict.policy).toEqual({ failOn: "error", effectiveFailOn: "warning" });
  });
});
