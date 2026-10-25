import type { JsxElementInfo, Rule, RuleContext } from "../types.js";

const UNLABELED_INPUT_TYPES = new Set(["hidden", "submit", "reset", "button", "image"]);

function nonEmpty(element: JsxElementInfo, name: string): boolean {
  const attr = element.attributes.get(name);
  if (!attr) return false;
  if (attr.kind === "string") return attr.value.trim() !== "";
  return attr.kind === "expression";
}

function isControl(element: JsxElementInfo): boolean {
  if (element.name === "select" || element.name === "textarea") return true;
  if (element.name !== "input") return false;
  const type = element.attributes.get("type");
  if (type?.kind === "string") return !UNLABELED_INPUT_TYPES.has(type.value.toLowerCase());
  return true;
}

export const dr007: Rule = {
  id: "DR007",
  name: "form-control-label",
  description:
    "input, select, and textarea elements without local evidence of an accessible name (wrapping label, htmlFor/id, aria-label, aria-labelledby, or title).",
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "js", "ts"],
  check(ctx: RuleContext) {
    for (const element of ctx.file.elements) {
      if (!element.intrinsic || !isControl(element)) continue;
      if (element.insideLabel) continue;
      if (
        nonEmpty(element, "aria-label") ||
        nonEmpty(element, "aria-labelledby") ||
        nonEmpty(element, "title")
      )
        continue;
      const id = element.attributes.get("id");
      if (id?.kind === "string" && ctx.file.labelTargets.static.has(id.value)) continue;
      if (id?.kind === "expression" && ctx.file.labelTargets.expressions.has(id.text)) continue;
      const describedOnly = element.attributes.has("aria-describedby");
      const placeholderOnly = element.attributes.has("placeholder");
      const note = describedOnly
        ? " aria-describedby adds a description, not a name."
        : placeholderOnly
          ? " A placeholder is not a label."
          : "";
      if (element.hasSpread) {
        ctx.coverage({
          loc: element.loc,
          kind: "spread-props",
          detail: `<${element.name}> has spread props; its accessible name may be supplied at runtime`,
        });
        continue;
      }
      if (id?.kind === "expression") {
        ctx.coverage({
          loc: element.loc,
          kind: "cross-component-label",
          detail: `<${element.name} id={${id.text}}> may be labeled elsewhere; the association cannot be verified in this file`,
        });
        continue;
      }
      if (id?.kind === "string") {
        ctx.report({
          loc: element.loc,
          message: `<${element.name} id="${id.value}"> has no <label htmlFor="${id.value}"> in this file.${note}`,
          evidence: `<${element.name} id="${id.value}">`,
          suggestion: `Add <label htmlFor="${id.value}">, aria-label, or aria-labelledby. If the label is rendered by another component, ignore this with a reason.`,
          confidence: "medium",
          maxSeverity: "warning",
          subject: element.name,
        });
        continue;
      }
      ctx.report({
        loc: element.loc,
        message: `<${element.name}> has no accessible name.${note}`,
        evidence: `<${element.name}>`,
        suggestion:
          "Wrap it in <label>, connect a <label htmlFor> to its id, or add aria-label / aria-labelledby.",
        confidence: element.isComponentRoot ? "medium" : "high",
        ...(element.isComponentRoot ? { maxSeverity: "warning" as const } : {}),
        subject: element.name,
      });
    }
  },
};
