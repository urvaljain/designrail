import { existsSync } from "node:fs";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { atomicWrite } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import type { RegisteredComponent } from "../components/schema.js";
import { TOKEN_TYPES } from "../tokens/schema.js";
import { tokensOfType } from "../tokens/registry.js";
import { TOKEN_TYPE_LABEL } from "../tokens/usage.js";
import { DesignRailError } from "../utilities/errors.js";
import { code, slugify } from "../utilities/text.js";
import { docState } from "../adapters/render.js";

/** Element keywords used for suggestion matching. Matches are labeled as suggestions only. */
const ELEMENT_KEYWORDS: Record<string, string[]> = {
  button: ["button", "buttons", "btn", "submit", "action", "cta", "click", "save", "cancel", "confirm"],
  a: ["link", "links", "navigate", "navigation", "href"],
  input: ["input", "inputs", "field", "fields", "form", "email", "password", "search", "text", "name"],
  select: ["select", "dropdown", "picker", "choose", "option", "options"],
  textarea: ["textarea", "comment", "message", "notes", "bio", "description"],
  img: ["image", "images", "photo", "avatar", "picture", "logo"],
  dialog: ["dialog", "modal", "popup", "confirmation"],
  table: ["table", "tables", "grid", "rows", "columns"],
  section: ["section", "card", "panel", "tile"],
};

const QUESTION_TRIGGERS: { pattern: RegExp; questions: string[] }[] = [
  {
    pattern: /\b(form|field|input|submit|sign ?up|sign ?in|login|register|edit)\b/i,
    questions: [
      "Which validation rules apply, and where should errors appear?",
      "What happens on submit (which endpoint or handler, and what success and failure look like)?",
    ],
  },
  {
    pattern: /\b(table|list|grid|feed|results|history)\b/i,
    questions: [
      "What should appear while loading, when there is no data, and on error?",
      "Is pagination, sorting, or filtering required?",
    ],
  },
  {
    pattern: /\b(modal|dialog|drawer|popover|sheet|menu)\b/i,
    questions: ["How is it opened and dismissed, and where should focus go when it closes?"],
  },
  {
    pattern: /\b(settings|preferences|profile|account)\b/i,
    questions: ["Which settings exist, and where is each one stored?"],
  },
  {
    pattern: /\b(dashboard|chart|graph|metric|stats|analytics)\b/i,
    questions: ["Which data sources and metrics are shown? Do not invent figures."],
  },
  {
    pattern: /\b(delete|remove|archive|destroy)\b/i,
    questions: ["Is a confirmation step required, and can the action be undone?"],
  },
  {
    pattern: /\b(upload|file|attachment)\b/i,
    questions: ["Which file types and sizes are allowed, and how is progress shown?"],
  },
];

const GENERAL_QUESTIONS = [
  "Where in the app does this belong (route, page, or parent component)?",
  "Who can see or use it (roles, permissions, feature flags)?",
  "Are there designs, copy, or existing examples to follow?",
];

export interface ComponentSuggestion {
  component: RegisteredComponent;
  matched: string[];
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 2);
}

function splitIdentifier(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Keyword overlap between the request and component names, descriptions, and replaced elements. */
export function suggestComponents(
  description: string,
  components: RegisteredComponent[],
): ComponentSuggestion[] {
  const requestWords = new Set(words(description));
  const out: ComponentSuggestion[] = [];
  for (const component of components) {
    const matched = new Set<string>();
    for (const w of splitIdentifier(component.exportName))
      if (requestWords.has(w) || requestWords.has(`${w}s`)) matched.add(w);
    for (const w of words(component.description ?? ""))
      if (w.length >= 4 && requestWords.has(w)) matched.add(w);
    for (const selector of component.replaces) {
      const tag = selector.split("[")[0]!;
      for (const keyword of ELEMENT_KEYWORDS[tag] ?? [tag])
        if (requestWords.has(keyword)) matched.add(keyword);
    }
    if (matched.size > 0) out.push({ component, matched: [...matched].sort() });
  }
  return out.sort(
    (a, b) =>
      b.matched.length - a.matched.length || a.component.exportName.localeCompare(b.component.exportName),
  );
}

export function questionsFor(description: string): { general: string[]; triggered: string[] } {
  const triggered: string[] = [];
  for (const trigger of QUESTION_TRIGGERS)
    if (trigger.pattern.test(description)) triggered.push(...trigger.questions);
  return { general: GENERAL_QUESTIONS, triggered: [...new Set(triggered)] };
}

/** A fence longer than any backtick run in the content, so user text cannot break out. */
function fenceFor(content: string): string {
  const longest = Math.max(2, ...[...content.matchAll(/`+/g)].map((m) => m[0].length));
  return "`".repeat(longest + 1);
}

export function renderTaskBrief(project: ProjectContext, description: string, generatedOn: string): string {
  const request = description.trim();
  const { config, registry } = project;
  const suggestions = suggestComponents(request, project.componentFile.components);
  const questions = questionsFor(request);
  const checks = [...config.commands.projectChecks, config.commands.check];
  const tailwind = config.project.styling.tailwind !== "none";
  const tokenCounts = TOKEN_TYPES.map((t) => [t, tokensOfType(registry, t).length] as const).filter(
    ([, n]) => n > 0,
  );
  const fence = fenceFor(request);
  const title = request.split("\n")[0]!.slice(0, 80);

  const docNote = (label: string, path: string): string => {
    const state = docState(project, path);
    return `- ${label}: ${code(path)}${state === "starter" ? " (starter template, not project-specific yet)" : state === "missing" ? " (missing)" : ""}`;
  };

  const prompt = [
    "Implement the request below in this repository.",
    "",
    "Request:",
    ...request.split("\n").map((l) => `> ${l}`),
    "",
    "Before writing code:",
    "1. Read the repository's instructions and the DesignRail files under designrail/ (tokens.json, components.json, design-rules.md, accessibility-rules.md, product-context.md).",
    "2. Inspect the code where this change belongs and confirm the expected behavior from repository evidence.",
    "3. Resolve the open questions listed in the task brief from the repository. If something is still unknown and blocks the work, ask instead of guessing.",
    "",
    "While implementing:",
    "- Reuse registered components where they fit and use registered tokens for colors, spacing, and fonts.",
    "- If a needed token or component is missing, explain it instead of inventing one.",
    "- Preserve existing behavior, keyboard interaction, and semantics. Keep changes within this task.",
    "- Handle loading, empty, error, disabled, and success states where relevant.",
    "",
    "After implementing:",
    ...checks.map((c) => `- Run \`${c}\` and fix what it reports in the files you changed.`),
    "- Summarize changed files, assumptions, unresolved findings, and what needs manual verification (keyboard, focus, responsive layout, visual fidelity).",
  ].join("\n");

  const lines = [
    `<!-- designrail:task generated ${generatedOn}. Template-generated scaffold; it contains no AI analysis. Edit freely. -->`,
    `# Task: ${title}`,
    "",
    "> This brief was assembled from deterministic templates and the project's DesignRail files.",
    "> It does not analyze the codebase or the request. Sections marked *to confirm* need human or agent judgment.",
    "",
    "## Original request",
    "",
    fence,
    request,
    fence,
    "",
    "## Intended outcome (to confirm)",
    "",
    "The user-visible result described in the request. Restate it precisely after inspecting the repository, and confirm it with the requester if the request is ambiguous.",
    "",
    "## Scope",
    "",
    "- In scope: the changes needed to deliver the request.",
    "- Out of scope unless requested: unrelated refactors, new tokens or components, changes to `designrail/` configuration, dependency changes.",
    "- Files affected: not determined by DesignRail. Identify them by inspecting the repository.",
    "",
    "## Assumptions and open questions",
    "",
    "No assumptions were made. Answer these from the repository or ask the requester:",
    "",
    ...questions.general.map((q) => `- [ ] ${q}`),
    ...(questions.triggered.length > 0
      ? [
          "",
          "Template prompts triggered by words in the request:",
          "",
          ...questions.triggered.map((q) => `- [ ] ${q}`),
        ]
      : []),
    "",
    "## Relevant components",
    "",
    ...(project.componentFile.components.length === 0
      ? [
          `No components are registered in ${code(config.paths.components)}. Look for existing components in the repository.`,
        ]
      : suggestions.length === 0
        ? [
            `No registered component matched words in the request. All registered components are listed in ${code(config.paths.components)}.`,
          ]
        : [
            "Keyword-matched suggestions. These are word matches, not a judgment of suitability; verify each before use.",
            "",
            ...suggestions.map(
              (s) =>
                `- ${s.component.exportName} from ${code(s.component.importSpecifier)}${s.component.replaces.length ? ` (replaces ${s.component.replaces.map((r) => code(`<${r}>`)).join(", ")})` : ""}. Matched: ${s.matched.join(", ")}.`,
            ),
          ]),
    "",
    "## Design policies",
    "",
    registry.tokens.length === 0
      ? `- Tokens: none registered yet (${code(config.paths.tokens)} is unconfigured). Avoid introducing new raw values.`
      : `- Tokens: ${tokenCounts.map(([t, n]) => `${n} ${TOKEN_TYPE_LABEL[t].toLowerCase()}`).join(", ")} in ${code(config.paths.tokens)}. Use ${tailwind ? "their Tailwind keys or " : ""}CSS variables; raw values ${config.policies.rawValues === "forbid" ? "are not allowed" : "are tolerated only when equal to a token value"}.`,
    "- If a needed token or component is missing, stop and explain rather than inventing one.",
    docNote("Design rules", config.paths.designRules),
    docNote("Product context", config.paths.productContext),
    "",
    "## Responsive guidance",
    "",
    ...(config.responsive.approach === "unspecified" && config.responsive.guidance.length === 0
      ? ["- No responsive approach is configured. Follow nearby patterns and confirm small-screen behavior."]
      : [
          ...(config.responsive.approach !== "unspecified"
            ? [`- Approach: ${config.responsive.approach}.`]
            : []),
          ...config.responsive.guidance.map((g) => `- ${g}`),
        ]),
    ...(tokensOfType(registry, "breakpoint").length > 0
      ? [
          `- Breakpoint tokens: ${tokensOfType(registry, "breakpoint")
            .map((b) => b.name)
            .join(", ")}.`,
        ]
      : []),
    "",
    "## Accessibility guidance",
    "",
    '- Images need `alt` (`alt=""` only when decorative). Form controls need an accessible name.',
    "- Keep native semantics and keyboard behavior; manage focus for overlays.",
    docNote("Accessibility rules", config.paths.accessibilityRules),
    "",
    "## Implementation checklist",
    "",
    "- [ ] Read repository instructions and DesignRail files",
    "- [ ] Resolve open questions from repository evidence (or ask)",
    "- [ ] Implement using registered components and tokens",
    "- [ ] Handle loading, empty, error, disabled, and success states where relevant",
    "- [ ] Run the verification commands below",
    "- [ ] Summarize changes, assumptions, and manual checks",
    "",
    "## Acceptance criteria",
    "",
    "- [ ] The behavior described in the request works as confirmed above.",
    `- [ ] ${code(config.commands.check)} reports no errors for the changed files.`,
    "- [ ] No new raw colors, spacing values, or font families outside approved exceptions.",
    "- [ ] Keyboard operation, focus visibility, and responsive layout were checked manually.",
    ...(config.commands.projectChecks.length > 0 ? ["- [ ] Project checks pass."] : []),
    "",
    "## Verification commands",
    "",
    "```sh",
    ...checks,
    "```",
    "",
    "## Implementation prompt",
    "",
    "Copy this into your AI coding assistant:",
    "",
    fenceFor(prompt) + "text",
    prompt,
    fenceFor(prompt),
    "",
  ];
  return lines.join("\n");
}

export interface TaskFileResult {
  path: string;
  content: string;
}

/** Picks designrail/tasks/<date>-<slug>.md, adding -2, -3, ... on collision. */
export function taskFilePath(
  project: ProjectContext,
  description: string,
  date: string,
  slugOverride?: string,
): string {
  const base = `${date}-${slugify(slugOverride ?? description, 50)}`;
  const dir = project.config.paths.tasks;
  for (let n = 1; n < 1000; n++) {
    const candidate = `${dir}/${n === 1 ? base : `${base}-${n}`}.md`;
    const { absolute } = resolveInsideRoot(project.root, candidate, "task path");
    if (!existsSync(absolute)) return candidate;
  }
  throw new DesignRailError("operational", "Could not find a free task filename");
}

export function writeTask(
  project: ProjectContext,
  description: string,
  options: { date: string; slug?: string },
): TaskFileResult {
  if (description.trim() === "") throw new DesignRailError("usage", "Task description is empty");
  const content = renderTaskBrief(project, description, options.date);
  const path = taskFilePath(project, description, options.date, options.slug);
  atomicWrite(project.root, path, content, { mustNotExist: true });
  return { path, content };
}
