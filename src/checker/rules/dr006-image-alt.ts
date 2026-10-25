import type { JsxElementInfo, Rule, RuleContext } from "../types.js";

function imageElementNames(ctx: RuleContext): Set<string> {
  const names = new Set(ctx.project.config.policies.imageElements);
  for (const imp of ctx.file.imports) {
    if (imp.source !== "next/image") continue;
    for (const s of imp.specifiers) if (s.imported === "default") names.add(s.local);
  }
  return names;
}

export const dr006: Rule = {
  id: "DR006",
  name: "image-alt-attribute",
  description:
    'Image elements without an alt attribute. alt="" (decorative) and dynamic alt expressions are accepted; the text itself is not judged.',
  defaultSeverity: "error",
  languages: ["tsx", "jsx", "js", "ts"],
  check(ctx) {
    const names = imageElementNames(ctx);
    for (const element of ctx.file.elements) {
      if (!names.has(element.name)) continue;
      checkElement(ctx, element);
    }
  },
};

function checkElement(ctx: RuleContext, element: JsxElementInfo): void {
  const alt = element.attributes.get("alt");
  if (alt && (alt.kind === "string" || alt.kind === "expression")) return;
  if (alt && alt.kind === "nullish") {
    ctx.report({
      loc: element.loc,
      message: `<${element.name}> has alt={${alt.text}}, which renders no alt attribute`,
      evidence: `<${element.name} alt={${alt.text}}>`,
      suggestion: 'Provide alt text, or alt="" if the image is decorative.',
      confidence: "high",
      subject: element.name,
    });
    return;
  }
  if (alt && (alt.kind === "boolean" || alt.kind === "empty")) {
    ctx.report({
      loc: element.loc,
      message: `<${element.name}> has an alt attribute without a value`,
      evidence: `<${element.name} alt>`,
      suggestion: 'Use alt="description", or alt="" for decorative images.',
      confidence: "medium",
      subject: element.name,
    });
    return;
  }
  if (element.hasSpread) {
    ctx.coverage({
      loc: element.loc,
      kind: "spread-props",
      detail: `<${element.name}> has spread props; alt may be supplied at runtime`,
    });
    return;
  }
  ctx.report({
    loc: element.loc,
    message: `<${element.name}> is missing an alt attribute`,
    evidence: `<${element.name}>`,
    suggestion:
      'Add alt text that conveys the image\'s purpose, or alt="" if it is purely decorative. DesignRail does not judge the text itself.',
    confidence: "high",
    subject: element.name,
  });
}
