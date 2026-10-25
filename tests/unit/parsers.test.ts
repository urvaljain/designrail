import { describe, expect, it } from "vitest";
import {
  findColorLiterals,
  parseDimension,
  splitSpaceComponents,
  splitTopLevelCommas,
  varReferences,
  wrappedVarReference,
} from "../../src/checker/parsers/css-values.js";
import { parseClass } from "../../src/checker/parsers/tailwind.js";
import { parseSuppression } from "../../src/checker/suppressions.js";
import { parseJsonc } from "../../src/utilities/jsonc.js";
import { slugify } from "../../src/utilities/text.js";

describe("Tailwind class parser", () => {
  it("parses variants, important, negative, and keys", () => {
    expect(parseClass("md:hover:!-mt-md")).toMatchObject({
      variants: ["md", "hover"],
      important: true,
      negative: true,
      prefix: "mt",
      value: { kind: "key", key: "md" },
    });
    expect(parseClass("px-4")).toMatchObject({ prefix: "px", value: { kind: "key", key: "4" } });
    expect(parseClass("bg-brand/50")).toMatchObject({
      prefix: "bg",
      value: { kind: "key", key: "brand", modifier: "50" },
    });
    expect(parseClass("text-sm")).toMatchObject({ prefix: "text", value: { kind: "key", key: "sm" } });
    expect(parseClass("top-4").prefix).toBe("top");
    expect(parseClass("border-x-brand")).toMatchObject({ prefix: "border-x", value: { key: "brand" } });
  });

  it("parses arbitrary values, hints, v4 variable shorthand, and arbitrary properties", () => {
    expect(parseClass("bg-[#ff0000]")).toMatchObject({
      prefix: "bg",
      value: { kind: "arbitrary", raw: "#ff0000" },
    });
    expect(parseClass("shadow-[0_0_0_1px_#000]").value).toMatchObject({ raw: "0 0 0 1px #000" });
    expect(parseClass("text-[color:var(--brand)]").value).toMatchObject({
      kind: "arbitrary",
      hint: "color",
      raw: "var(--brand)",
    });
    expect(parseClass("bg-(--brand)").value).toEqual({ kind: "var", name: "--brand" });
    expect(parseClass("[color:#fff]").arbitraryProperty).toEqual({ property: "color", value: "#fff" });
    expect(parseClass("lg:[&>*]:p-md")).toMatchObject({ variants: ["lg", "[&>*]"], prefix: "p" });
    expect(parseClass("content-['a\\_b']").value).toBeUndefined();
  });

  it("does not treat unrelated utilities as matches", () => {
    expect(parseClass("flex").prefix).toBeUndefined();
    expect(parseClass("-translate-x-1").prefix).toBeUndefined();
  });
});

describe("CSS value helpers", () => {
  it("finds literal colors but not references, URLs, or wrapped variables", () => {
    expect(findColorLiterals("1px solid #ccc").map((c) => c.text)).toEqual(["#ccc"]);
    expect(findColorLiterals("rgb(1, 2, 3) hsla(0 0% 0% / .5)").map((c) => c.kind)).toEqual([
      "function",
      "function",
    ]);
    expect(findColorLiterals("url(#gradient) var(--brand)")).toEqual([]);
    expect(findColorLiterals("hsl(var(--primary))")).toEqual([]);
    expect(findColorLiterals("#gggggg #12")).toEqual([]);
    expect(findColorLiterals("color-mix(in srgb, #fff 50%, var(--x))").map((c) => c.text)).toEqual(["#fff"]);
  });

  it("extracts var() references with fallbacks", () => {
    expect(varReferences("var(--a, var(--b, 4px))")).toEqual([
      { name: "--a", fallback: "var(--b, 4px)" },
      { name: "--b", fallback: "4px" },
    ]);
  });

  it("recognizes variables wrapped in a single color function", () => {
    expect(wrappedVarReference("hsl(var(--primary))")).toBe("--primary");
    expect(wrappedVarReference("rgb(var(--x) / <alpha-value>)")).toBe("--x");
    expect(wrappedVarReference("var(--x)")).toBe("--x");
    expect(wrappedVarReference("calc(var(--x) * 2)")).toBeNull();
  });

  it("parses dimensions and splits values", () => {
    expect(parseDimension("-1.5rem")).toEqual({ number: -1.5, unit: "rem" });
    expect(parseDimension("0")).toEqual({ number: 0, unit: "" });
    expect(parseDimension("calc(1px)")).toBeNull();
    expect(splitSpaceComponents("8px calc(1px + 2px) var(--x)")).toEqual([
      "8px",
      "calc(1px + 2px)",
      "var(--x)",
    ]);
    expect(splitTopLevelCommas('"Inter, Tight", sans-serif')).toEqual(['"Inter, Tight"', "sans-serif"]);
  });
});

describe("suppression comments", () => {
  const loc = { line: 3, column: 1 };
  it("requires rule IDs and a reason", () => {
    expect(
      parseSuppression(" designrail-ignore-next-line DR001, DR002 -- brand gradient", loc, 3),
    ).toMatchObject({ valid: true, rules: ["DR001", "DR002"], reason: "brand gradient", targetLine: 4 });
    expect(parseSuppression("designrail-ignore-next-line DR001", loc, 3)).toMatchObject({ valid: false });
    expect(parseSuppression("designrail-ignore-next-line -- reason here", loc, 3)).toMatchObject({
      valid: false,
    });
    expect(parseSuppression("designrail-ignore-next-line DR999 -- reason", loc, 3)?.problem).toMatch(
      /unknown rule/,
    );
    expect(parseSuppression("ordinary comment", loc, 3)).toBeNull();
  });
});

describe("utilities", () => {
  it("parses JSON with comments and trailing commas", () => {
    expect(parseJsonc('{ // c\n "a": "x//y", /* b */ "b": [1,], }')).toEqual({ a: "x//y", b: [1] });
  });

  it("creates safe slugs", () => {
    expect(slugify("Add a settings form with email field and save button", 50)).toBe(
      "add-a-settings-form-with-email-field-and-save",
    );
    expect(slugify("../../etc/passwd")).toBe("etc-passwd");
    expect(slugify("Ünïcödé — ☃")).toBe("unicode");
    expect(slugify("☃☃☃")).toBe("task");
  });
});
