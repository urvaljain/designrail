import type { ProjectContext } from "../project/context.js";
import { formatTokenValue } from "../tokens/registry.js";
import type { TokenType } from "../tokens/schema.js";
import { tokenUsage } from "../tokens/usage.js";
import { code, mdCell, plural } from "../utilities/text.js";
import type { CheckReport, Violation } from "./schema.js";

const RULE_TOKEN_TYPES: Partial<Record<string, TokenType>> = {
  DR001: "color",
  DR002: "spacing",
  DR003: "fontFamily",
};
const TOKEN_LIMIT = 40;

function groupByFile(violations: Violation[]): Map<string, Violation[]> {
  const map = new Map<string, Violation[]>();
  for (const v of violations) {
    const list = map.get(v.file) ?? [];
    list.push(v);
    map.set(v.file, list);
  }
  return map;
}

function tokenTable(project: ProjectContext, type: TokenType): string[] {
  const tokens = project.registry.tokens.filter((t) => t.type === type);
  if (tokens.length === 0) return [`No ${type} tokens are registered.`];
  if (tokens.length > TOKEN_LIMIT)
    return [`${tokens.length} ${type} tokens are registered; see ${code(project.config.paths.tokens)}.`];
  const tailwind = project.config.project.styling.tailwind !== "none";
  return [
    "| Token | Value | Use as |",
    "| --- | --- | --- |",
    ...tokens.map(
      (t) =>
        `| ${mdCell(t.name)} | ${mdCell(formatTokenValue(t.resolved ?? t.value))} | ${mdCell(
          tokenUsage(t, tailwind)
            .map((u) => code(u))
            .join(", ") || "-",
        )} |`,
    ),
  ];
}

/** Builds the repair prompt from a verified-fresh report. Contains only evidence from the report. */
export function renderFixPrompt(project: ProjectContext, report: CheckReport, reportPath: string): string {
  const check = project.config.commands.check;
  const header = [
    "# DesignRail repair prompt",
    "",
    `<!-- Generated from ${reportPath} (report time ${report.generatedAt}). The report matched the current files when this prompt was created. -->`,
    "",
  ];
  const violations = report.violations;
  if (violations.length === 0 && report.parseFailures.length === 0) {
    return [
      ...header,
      `The latest DesignRail report has no findings (${report.summary.filesScanned} files checked, threshold: ${report.policy.effectiveFailOn}). There is nothing to repair.`,
      "",
      ...(report.unsupported.length > 0
        ? [
            `Note: ${plural(report.unsupported.length, "pattern")} could not be analyzed statically (see the report's "unsupported" list). They are not known to be wrong, only unverified.`,
            "",
          ]
        : []),
      "A clean static check does not prove visual fidelity or accessibility; verify keyboard use, focus, and responsive layout manually.",
      "",
    ].join("\n");
  }

  const lines = [
    ...header,
    `Fix the ${plural(violations.length, "design-system finding")} below. They come from \`designrail check\` and include exact locations and evidence.`,
    "",
    "## Scope and constraints",
    "",
    "- Edit only the files listed below, and only to resolve these findings.",
    "- Preserve existing behavior, props, semantics, keyboard interaction, and visual intent.",
    "- Avoid unrelated refactors, renames, formatting churn, and dependency changes.",
    "- Use only the approved tokens and components listed here. Do not invent tokens, components, props, or variants.",
    "- Do not add exceptions or `designrail-ignore-next-line` comments unless the finding is wrong; if you do, state the reason.",
    "- If a finding cannot be fixed with what is approved, leave it unchanged and explain why in your summary.",
    "",
    `## Findings (${violations.length})`,
    "",
  ];
  for (const [file, list] of groupByFile(violations)) {
    lines.push(`### ${code(file)}`, "");
    list.forEach((v, i) => {
      lines.push(
        `${i + 1}. **${v.ruleId}** (${v.severity}, ${v.confidence} confidence) at line ${v.line}, column ${v.column}: ${v.message}`,
      );
      lines.push(`   - Evidence: ${code(v.evidence)}`);
      lines.push(`   - Suggested correction: ${v.suggestion}`);
      if (v.confidence === "medium")
        lines.push(
          "   - Medium confidence: confirm the finding against the surrounding code before changing it.",
        );
    });
    lines.push("");
  }
  if (report.parseFailures.length > 0) {
    lines.push(
      "## Files DesignRail could not parse",
      "",
      "These files were not checked. Fix syntax errors only if they are part of your current work:",
      "",
    );
    for (const f of report.parseFailures)
      lines.push(`- ${code(`${f.file}:${f.line}:${f.column}`)}: ${f.message}`);
    lines.push("");
  }

  const ruleIds = new Set(violations.map((v) => v.ruleId));
  const tokenTypes = [
    ...new Set([...ruleIds].map((r) => RULE_TOKEN_TYPES[r]).filter((t): t is TokenType => Boolean(t))),
  ];
  if (tokenTypes.length > 0) {
    lines.push("## Approved tokens", "");
    for (const type of tokenTypes) lines.push(`**${type}**`, "", ...tokenTable(project, type), "");
  }
  const componentIds = new Set(violations.map((v) => v.component).filter(Boolean));
  const components = project.componentFile.components.filter((c) => componentIds.has(c.id));
  if (components.length > 0) {
    lines.push("## Approved components", "");
    for (const c of components) {
      const imp =
        c.exportKind === "named"
          ? `import { ${c.exportName} } from "${c.importSpecifier}"`
          : `import ${c.exportName} from "${c.importSpecifier}"`;
      lines.push(
        `- ${c.exportName}: ${code(imp)}${c.replaces.length ? `; replaces ${c.replaces.map((r) => code(`<${r}>`)).join(", ")}` : ""}${c.variants?.length ? `; documented variants: ${c.variants.join(", ")}` : ""}${c.usage ? `. ${c.usage}` : ""}`,
      );
    }
    lines.push("");
  }

  lines.push("## Not verified by DesignRail", "");
  if (report.unsupported.length > 0) {
    lines.push(
      `${plural(report.unsupported.length, "pattern")} could not be analyzed statically (dynamic classes or styles, unresolved mappings). Do not change them just because they are listed:`,
      "",
    );
    for (const u of report.unsupported.slice(0, 10))
      lines.push(`- ${code(`${u.file}:${u.line}`)}: ${u.detail}`);
    if (report.unsupported.length > 10)
      lines.push(`- ...and ${report.unsupported.length - 10} more in the report.`);
    lines.push("");
  }
  lines.push(
    "Keyboard behavior, focus visibility, responsive layout, color contrast, and visual fidelity always need manual verification.",
    "",
  );

  lines.push(
    "## Required verification",
    "",
    ...project.config.commands.projectChecks.map((c, i) => `${i + 1}. Run ${code(c)}.`),
    `${project.config.commands.projectChecks.length + 1}. Run ${code(check)} and confirm these findings are resolved without new ones.`,
    `${project.config.commands.projectChecks.length + 2}. In your summary, list each finding as fixed or unresolved (with the reason), and the files you changed.`,
    "",
  );
  return lines.join("\n");
}
