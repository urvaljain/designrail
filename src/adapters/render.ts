import type { AdapterId } from "../config/schema.js";
import { readIfExists } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import { formatTokenValue, tokensOfType } from "../tokens/registry.js";
import { TOKEN_TYPES } from "../tokens/schema.js";
import { TOKEN_TYPE_LABEL, tokenUsage } from "../tokens/usage.js";
import { code, mdCell } from "../utilities/text.js";

/** Above these sizes adapters point to the canonical files instead of inlining entries. */
export const INLINE_TOKEN_LIMIT = 40;
export const INLINE_COMPONENT_LIMIT = 25;

export const STARTER_MARKER = "designrail:starter";

export type DocState = "missing" | "starter" | "customized";

export function docState(project: ProjectContext, relPath: string): DocState {
  const text = readIfExists(project.root, relPath);
  if (text === null) return "missing";
  return text.includes(STARTER_MARKER) ? "starter" : "customized";
}

function docLine(project: ProjectContext, label: string, relPath: string): string {
  const state = docState(project, relPath);
  const suffix =
    state === "missing"
      ? " (missing)"
      : state === "starter"
        ? " (starter template; not yet customized by the project, treat as general guidance)"
        : " (project-defined)";
  return `- ${label}: ${code(relPath)}${suffix}`;
}

function frameworkLabel(project: ProjectContext): string {
  const c = project.config.project;
  const framework =
    c.framework === "next" ? "Next.js (React)" : c.framework === "react" ? "React" : "unspecified framework";
  const styling = [
    c.styling.tailwind !== "none" ? `Tailwind CSS ${c.styling.tailwind}` : null,
    c.styling.css ? "CSS" : null,
  ]
    .filter(Boolean)
    .join(" + ");
  return `${framework}${styling ? `, styled with ${styling}` : ""}`;
}

function tokenSection(project: ProjectContext): string[] {
  const { registry, config } = project;
  const tailwind = config.project.styling.tailwind !== "none";
  const out: string[] = [];
  if (registry.tokens.length === 0) {
    out.push(
      "### Token policy (not configured)",
      "",
      `No design tokens are registered yet (${code(config.paths.tokens)} is unconfigured). Follow existing styles in nearby files, avoid introducing new raw values, and say so when a value would need a token.`,
    );
    return out;
  }
  out.push("### Token policy (project-defined tokens)", "");
  out.push(
    "- Style with the registered tokens: CSS variables such as `var(--name)`" +
      (tailwind ? " or the Tailwind keys listed for each token." : "."),
  );
  if (config.policies.rawValues === "forbid") {
    out.push(
      "- Raw colors, spacing values, and font families are not allowed, even when they equal a token's value. Reference the token instead.",
    );
  } else {
    out.push(
      "- Prefer token references. A raw value is tolerated only when it exactly equals a registered token value.",
    );
  }
  if (tailwind) {
    if (config.policies.tailwind.defaultPalette === "flag")
      out.push(
        "- Do not use Tailwind's default palette (for example `bg-blue-500`); use the semantic color tokens.",
      );
    out.push("- Avoid arbitrary values such as `p-[13px]` or `bg-[#123456]`.");
    if (config.policies.tailwind.numericSpacing === "flag")
      out.push("- Use the token-backed spacing keys, not Tailwind's numeric spacing scale.");
    if (config.policies.tailwind.numericSpacing === "allow")
      out.push("- Tailwind's numeric spacing scale (for example `p-4`) is approved.");
  }
  out.push(
    "- If a needed token does not exist, do not invent one: use the closest registered token and explain the gap in your summary.",
  );
  out.push("");
  if (registry.tokens.length <= INLINE_TOKEN_LIMIT) {
    out.push("| Token | Type | Value | Use as |", "| --- | --- | --- | --- |");
    for (const token of registry.tokens) {
      const usage = tokenUsage(token, tailwind);
      out.push(
        `| ${mdCell(token.name)} | ${token.type} | ${mdCell(formatTokenValue(token.resolved ?? token.value))} | ${usage.length ? mdCell(usage.map((u) => code(u)).join(", ")) : "(no code reference registered)"} |`,
      );
    }
  } else {
    const counts = TOKEN_TYPES.map((t) => [t, tokensOfType(registry, t).length] as const).filter(
      ([, n]) => n > 0,
    );
    out.push(
      `${registry.tokens.length} tokens are registered (${counts.map(([t, n]) => `${n} ${TOKEN_TYPE_LABEL[t].toLowerCase()}`).join(", ")}). Read ${code(config.paths.tokens)} for names, values, and references.`,
    );
  }
  return out;
}

function componentSection(project: ProjectContext): string[] {
  const components = [...project.componentFile.components].sort((a, b) =>
    a.exportName.localeCompare(b.exportName),
  );
  const path = project.config.paths.components;
  if (components.length === 0) {
    return [
      "### Components (none registered)",
      "",
      `No components are registered in ${code(path)}. Reuse existing components you find in the repository before writing new ones.`,
    ];
  }
  const out = ["### Components (project-registered)", ""];
  out.push("- Use a registered component instead of the raw element it replaces when it fits the need.");
  out.push(
    "- Import from the listed specifier. Do not invent props or variants; only the variants listed here are documented.",
  );
  out.push("- If no registered component fits, explain why before writing a new one or using a raw element.");
  out.push("");
  if (components.length <= INLINE_COMPONENT_LIMIT) {
    out.push("| Component | Import | Replaces | Variants | Notes |", "| --- | --- | --- | --- | --- |");
    for (const c of components) {
      const importLine =
        c.exportKind === "named"
          ? `import { ${c.exportName} } from "${c.importSpecifier}"`
          : `import ${c.exportName} from "${c.importSpecifier}"`;
      const notes = [c.description, c.usage].filter(Boolean).join(" ");
      out.push(
        `| ${c.exportName} | ${code(importLine)} | ${c.replaces.length ? c.replaces.map((r) => code(`<${r}>`)).join(", ") : "-"} | ${c.variants?.length ? mdCell(c.variants.join(", ")) : "-"} | ${notes ? mdCell(notes) : "-"} |`,
      );
    }
  } else {
    out.push(
      `${components.length} components are registered. Read ${code(path)} for import specifiers and the raw elements each replaces.`,
    );
  }
  return out;
}

function responsiveSection(project: ProjectContext): string[] {
  const { responsive } = project.config;
  const breakpoints = tokensOfType(project.registry, "breakpoint");
  const out = ["### Responsive layout", ""];
  if (responsive.approach === "unspecified" && responsive.guidance.length === 0) {
    out.push(
      "- No responsive approach is configured. Follow the patterns in nearby files and ask when the intended behavior on small screens is unclear.",
    );
  } else {
    if (responsive.approach !== "unspecified") out.push(`- Approach: ${responsive.approach}.`);
    for (const line of responsive.guidance) out.push(`- ${line}`);
  }
  if (breakpoints.length > 0) {
    out.push(
      `- Breakpoints: ${breakpoints.map((b) => `${b.name} = ${formatTokenValue(b.resolved ?? b.value)}`).join(", ")}.`,
    );
  }
  out.push(
    "- Responsive behavior is not verified by DesignRail; check layouts manually at the relevant widths.",
  );
  return out;
}

export function renderInstructions(project: ProjectContext, adapter: AdapterId): string {
  const { config } = project;
  const check = config.commands.check;
  const projectChecks = config.commands.projectChecks;
  const lines: string[] = [
    "## DesignRail: design-system context",
    "",
    `These instructions come from the DesignRail files in ${code("designrail/")}. They guide AI coding tools but do not guarantee compliance, and other instructions you receive may take precedence. ${code(check)} statically checks a subset of these rules; passing it does not prove visual fidelity or accessibility.`,
    "",
    `Project: ${config.project.name} (${frameworkLabel(project)}).`,
    "",
    "### Sources of truth",
    "",
    `- Tokens: ${code(config.paths.tokens)} (${project.registry.tokens.length} registered${project.registry.tokens.length === 0 ? ", unconfigured" : ""})`,
    `- Components: ${code(config.paths.components)} (${project.componentFile.components.length} registered)`,
    docLine(project, "Design rules", config.paths.designRules),
    docLine(project, "Accessibility rules", config.paths.accessibilityRules),
    docLine(project, "Product context", config.paths.productContext),
    `- Checker configuration and approved exceptions: ${code("designrail/config.yaml")}`,
    "",
    "### Before implementing",
    "",
    "1. Read the repository's existing instructions and the files listed above that are relevant to the task.",
    "2. Inspect the registered components and tokens you may need.",
    "3. Confirm the requested behavior from code and documentation in the repository.",
    "4. List requirements that are missing or ambiguous instead of inventing them; ask when they block the work.",
    "",
    ...tokenSection(project),
    "",
    ...componentSection(project),
    "",
    "### During implementation",
    "",
    "1. Reuse registered components when suitable, and use token references for colors, spacing, and fonts.",
    "2. Preserve existing behavior, keyboard interaction, and semantic HTML.",
    "3. Keep changes within the task; avoid unrelated refactors.",
    "4. If a needed token or component is missing, explain it instead of silently creating one.",
    "5. Consider loading, empty, error, disabled, and success states where they apply.",
    "",
    ...responsiveSection(project),
    "",
    "### Accessibility",
    "",
    '- Checked statically: every `<img>` has an `alt` attribute (`alt=""` only for decorative images); form controls have a label (wrapping `<label>`, `htmlFor`/`id`, `aria-label`, or `aria-labelledby`).',
    "- Verify manually: keyboard operation, visible focus, focus management in dialogs and menus, color contrast, and screen-reader announcements.",
    "",
    "### After implementing",
    "",
    ...(projectChecks.length > 0
      ? [`1. Run the project's checks: ${projectChecks.map((c) => code(c)).join(", ")}.`]
      : ["1. Run the project's usual lint, typecheck, and test commands."]),
    `2. Run ${code(check)} and fix the violations it reports in files you changed.`,
    "3. Report what DesignRail cannot verify (dynamic classes, responsive layout, focus, visual fidelity) as manual checks.",
    "4. Summarize changed files, remaining assumptions, and any unresolved findings with the reason.",
    "",
    "### Exceptions",
    "",
    `- Approved exceptions live under ${code("exceptions")} in ${code("designrail/config.yaml")}, each with a reason. Propose new exceptions; do not add them unless asked.`,
    `- A single line can be suppressed with ${code("// designrail-ignore-next-line DR001 -- <reason>")} (or ${code("{/* ... */}")} in JSX, ${code("/* ... */")} in CSS). Use it only when the finding is wrong or explicitly accepted, and mention it in your summary.`,
  ];
  if (adapter === "generic") {
    lines.unshift(
      "# DesignRail context",
      "",
      "Attach or paste this file into AI assistants that do not read repository instruction files automatically. It is regenerated by `designrail sync`.",
      "",
    );
  }
  return lines.join("\n");
}

export const CURSOR_FRONTMATTER = [
  "---",
  "description: DesignRail design-system rules for UI work (tokens, components, accessibility)",
  "alwaysApply: true",
  "---",
].join("\n");
