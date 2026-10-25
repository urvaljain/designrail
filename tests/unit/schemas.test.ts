import { describe, expect, it } from "vitest";
import { parseConfigText } from "../../src/config/load.js";
import { configSchema, defaultConfig } from "../../src/config/schema.js";
import { renderConfigYaml } from "../../src/config/template.js";
import { componentFileSchema } from "../../src/components/schema.js";
import { tokenFileSchema } from "../../src/tokens/schema.js";
import { reportSchema } from "../../src/reports/schema.js";
import { DesignRailError } from "../../src/utilities/errors.js";

describe("configuration schema", () => {
  it("fills documented defaults from a minimal config", () => {
    const config = parseConfigText("schemaVersion: 1\n");
    expect(config.check.failOn).toBe("error");
    expect(config.rules.DR005.severity).toBe("warning");
    expect(config.rules.DR001).toEqual({ enabled: true, severity: "error" });
    expect(config.policies.rawValues).toBe("forbid");
    expect(config.policies.remBasePx).toBeNull();
    expect(config.policies.tailwind.numericSpacing).toBe("unknown");
    expect(config.adapters.map((a) => a.id)).toEqual(["codex", "claude-code"]);
  });

  it("round-trips the commented template", () => {
    const config = defaultConfig({ project: { name: "demo", framework: "next" } });
    const parsed = parseConfigText(renderConfigYaml(config));
    expect(parsed).toEqual(config);
  });

  it("rejects unknown keys, wrong versions, and invalid enums with paths", () => {
    const attempt = (text: string) => {
      try {
        parseConfigText(text);
        return [];
      } catch (error) {
        expect(error).toBeInstanceOf(DesignRailError);
        return (error as DesignRailError).details;
      }
    };
    expect(attempt("schemaVersion: 2\n").join()).toMatch(/schemaVersion/);
    expect(attempt("schemaVersion: 1\nrulez: {}\n").join()).toMatch(/rulez/);
    expect(attempt("schemaVersion: 1\nrules:\n  DR001: { severity: fatal }\n").join()).toMatch(
      /rules\.DR001\.severity/,
    );
    expect(attempt("schemaVersion: 1\ncheck: { failOn: sometimes }\n").join()).toMatch(/check\.failOn/);
  });

  it("requires a reason on every exception", () => {
    const result = configSchema.safeParse({
      schemaVersion: 1,
      exceptions: [{ rule: "DR001", values: ["#fff"] }],
    });
    expect(result.success).toBe(false);
  });

  it("treats YAML as data only (no custom tags)", () => {
    expect(() => parseConfigText("schemaVersion: !!js/function 'function(){}'\n")).toThrow(DesignRailError);
  });

  it("reports empty or malformed YAML as configuration errors", () => {
    expect(() => parseConfigText("")).toThrow(/empty/);
    expect(() => parseConfigText("schemaVersion: [1\n")).toThrow(/not valid YAML/);
  });
});

describe("token schema", () => {
  it("accepts literal values, aliases, and references", () => {
    const ok = tokenFileSchema.safeParse({
      schemaVersion: 1,
      tokens: {
        "color.brand": {
          type: "color",
          value: "#2563eb",
          references: { cssVariables: ["--brand"], tailwindKeys: ["brand"] },
        },
        "color.primary": { type: "color", value: "{color.brand}" },
        "font-family.sans": { type: "fontFamily", value: ["Inter", "sans-serif"] },
        "font-weight.bold": { type: "fontWeight", value: 700 },
      },
    });
    expect(ok.success).toBe(true);
  });

  it("rejects unknown types, bad names, and CSS variables without --", () => {
    expect(
      tokenFileSchema.safeParse({ schemaVersion: 1, tokens: { "x y": { type: "color", value: "#fff" } } })
        .success,
    ).toBe(false);
    expect(
      tokenFileSchema.safeParse({ schemaVersion: 1, tokens: { a: { type: "gradient", value: "x" } } })
        .success,
    ).toBe(false);
    expect(
      tokenFileSchema.safeParse({
        schemaVersion: 1,
        tokens: { a: { type: "color", value: "#fff", references: { cssVariables: ["brand"] } } },
      }).success,
    ).toBe(false);
  });
});

describe("component schema", () => {
  const base = {
    id: "button",
    exportName: "Button",
    sourceFile: "src/button.tsx",
    importSpecifier: "@/button",
    exportKind: "named",
  };

  it("keeps filesystem paths and import specifiers separate and defaults lists", () => {
    const parsed = componentFileSchema.parse({ schemaVersion: 1, components: [base] });
    expect(parsed.components[0]).toMatchObject({
      sourceFile: "src/button.tsx",
      importSpecifier: "@/button",
      replaces: [],
      implementationFiles: [],
    });
    expect(parsed.components[0]!.variants).toBeUndefined();
  });

  it("rejects duplicate ids and invalid replaces selectors", () => {
    expect(componentFileSchema.safeParse({ schemaVersion: 1, components: [base, base] }).success).toBe(false);
    expect(
      componentFileSchema.safeParse({ schemaVersion: 1, components: [{ ...base, replaces: ["Button!"] }] })
        .success,
    ).toBe(false);
    expect(
      componentFileSchema.safeParse({
        schemaVersion: 1,
        components: [{ ...base, replaces: ["input[type=email]"] }],
      }).success,
    ).toBe(true);
  });
});

describe("report schema", () => {
  it("rejects reports from another schema version", () => {
    expect(reportSchema.safeParse({ schemaVersion: 99 }).success).toBe(false);
  });
});
