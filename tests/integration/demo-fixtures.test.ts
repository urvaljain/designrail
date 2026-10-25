/**
 * Verifies the demo's documented fixture results against the demo's real DesignRail configuration.
 * Each fixture is copied into a temporary copy of the demo, as an AI tool's output would land in src/.
 */
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCheck } from "../../src/checker/engine.js";
import { importTokens } from "../../src/tokens/importer.js";
import { loadProject } from "../../src/project/context.js";

const demo = resolve(import.meta.dirname, "..", "..", "examples", "react-tailwind-demo");
const expected = JSON.parse(readFileSync(join(demo, "fixtures", "expected-findings.json"), "utf8")) as Record<
  string,
  { status: string; findings: string[]; unsupported: string[]; parseFailure?: string }
>;
let root: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "designrail-demo-")));
  for (const entry of ["src", "designrail", "tsconfig.json", "package.json"]) {
    cpSync(join(demo, entry), join(root, entry), { recursive: true });
  }
  rmSync(join(root, "designrail", "reports"), { recursive: true, force: true });
});

afterAll(() => rmSync(root, { recursive: true, force: true }));

function target(fixture: string): string {
  return fixture.endsWith("BillingPanel.tsx")
    ? "src/features/billing/BillingPanel.tsx"
    : `src/fixtures/${fixture.split("/").pop()}`;
}

describe("demo application", () => {
  it("passes its own check (the clean example)", () => {
    const report = runCheck(loadProject(root), {});
    expect(report.violations).toEqual([]);
    expect(report.result.status).toBe("pass");
  });
});

describe("demo fixtures", () => {
  for (const [fixture, want] of Object.entries(expected)) {
    if (fixture.startsWith("$")) continue;
    it(`${fixture} -> ${want.status}`, () => {
      const path = target(fixture);
      mkdirSync(dirname(join(root, path)), { recursive: true });
      cpSync(join(demo, "fixtures", fixture), join(root, path));
      try {
        const report = runCheck(loadProject(root), { paths: [path] });
        expect(report.result.status).toBe(want.status);
        expect(report.violations.map((v) => `${v.ruleId} ${v.severity} ${v.line}:${v.column}`)).toEqual(
          want.findings,
        );
        expect(report.unsupported.map((u) => `${u.kind} ${u.line}:${u.column}`)).toEqual(want.unsupported);
        if (want.parseFailure)
          expect(report.parseFailures.map((f) => `${f.line}:${f.column}`)).toEqual([want.parseFailure]);
      } finally {
        rmSync(join(root, path));
      }
    });
  }

  it("rejects the token alias-cycle fixture without changing tokens.json", () => {
    cpSync(join(demo, "fixtures", "rules", "token-cycle.json"), join(root, "token-cycle.json"));
    const before = readFileSync(join(root, "designrail", "tokens.json"), "utf8");
    expect(() => importTokens(loadProject(root), "token-cycle.json")).toThrow(/Alias cycle|inconsistent/);
    expect(readFileSync(join(root, "designrail", "tokens.json"), "utf8")).toBe(before);
  });
});
