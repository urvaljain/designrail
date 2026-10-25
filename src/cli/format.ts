import type { SyncItem } from "../adapters/sync.js";
import type { DoctorResult } from "../diagnostics/doctor.js";
import type { StatusResult } from "../diagnostics/status.js";
import type { CheckReport, Violation } from "../reports/schema.js";
import type { ImportTokensResult } from "../tokens/importer.js";
import { plural } from "../utilities/text.js";
import type { Style } from "./io.js";

function severityLabel(s: Style, v: Violation["severity"]): string {
  const padded = v.padEnd(7);
  return v === "error" ? s.red(padded) : v === "warning" ? s.yellow(padded) : s.cyan(padded);
}

export interface CheckFormatOptions {
  quiet: boolean;
  reportPath: string | null;
}

export function formatCheckReport(report: CheckReport, s: Style, options: CheckFormatOptions): string {
  const out: string[] = [];
  const failSet =
    report.policy.effectiveFailOn === "warning"
      ? new Set(["error", "warning"])
      : report.policy.effectiveFailOn === "error"
        ? new Set(["error"])
        : new Set<string>();
  const shown = options.quiet ? report.violations.filter((v) => failSet.has(v.severity)) : report.violations;
  const sm = report.summary;

  if (!options.quiet) {
    out.push(
      s.bold("DesignRail check"),
      `${plural(sm.filesScanned, "file")} checked: ${sm.filesFullyAnalyzed} fully analyzed, ${sm.filesPartiallyAnalyzed} partially analyzed, ${sm.parseFailures} not parsed`,
      `Policy: fail on ${report.policy.effectiveFailOn}${report.scope.strict ? " (--strict)" : ""}; configured failOn: ${report.policy.failOn}`,
      "",
    );
  }
  let currentFile = "";
  for (const v of shown) {
    if (v.file !== currentFile) {
      if (currentFile) out.push("");
      out.push(s.bold(v.file));
      currentFile = v.file;
    }
    out.push(
      `  ${`${v.line}:${v.column}`.padEnd(8)} ${severityLabel(s, v.severity)} ${v.ruleId}  ${v.message}${v.confidence === "medium" ? s.dim(" (medium confidence)") : ""}`,
    );
    if (!options.quiet)
      out.push(`  ${" ".repeat(8)} ${" ".repeat(7)} ${" ".repeat(5)} ${s.dim(`→ ${v.suggestion}`)}`);
  }
  if (shown.length > 0) out.push("");

  if (report.parseFailures.length > 0) {
    out.push(s.red(s.bold("Parse failures (these files were not checked):")));
    for (const f of report.parseFailures) out.push(`  ${f.file}:${f.line}:${f.column}  ${f.message}`);
    out.push("");
  }
  if (!options.quiet) {
    if (report.unsupported.length > 0) {
      out.push(s.bold(`Not analyzed (${plural(report.unsupported.length, "pattern")}):`));
      for (const u of report.unsupported.slice(0, 8)) out.push(`  ${u.file}:${u.line}  ${s.dim(u.detail)}`);
      if (report.unsupported.length > 8)
        out.push(`  ${s.dim(`...and ${report.unsupported.length - 8} more (see the JSON report)`)}`);
      out.push("");
    }
    const unused = report.suppressions.filter((x) => x.status === "unused");
    if (unused.length > 0) {
      out.push(
        s.dim(
          `${plural(unused.length, "suppression comment")} matched nothing: ${unused.map((u) => `${u.file}:${u.line}`).join(", ")}`,
        ),
        "",
      );
    }
    const skipped = report.skipped.filter((x) => x.reason !== "not found");
    const missing = report.skipped.filter((x) => x.reason === "not found");
    for (const m of missing) out.push(s.yellow(`Path not found: ${m.path}`));
    if (skipped.length > 0)
      out.push(s.dim(`Skipped: ${skipped.map((x) => `${x.path} (${x.reason})`).join("; ")}`));
    if (missing.length + skipped.length > 0) out.push("");
  }
  out.push(
    `${plural(sm.errors, "error")}, ${plural(sm.warnings, "warning")}, ${sm.infos} info` +
      ` · ${sm.suppressed} suppressed · ${sm.excepted} excepted`,
  );
  const status =
    report.result.status === "pass"
      ? s.green("PASS")
      : report.result.status === "fail"
        ? s.red("FAIL")
        : s.red("INCOMPLETE");
  out.push(`${status}: ${report.result.reason}`);
  if (!options.quiet) {
    if (options.reportPath) out.push(s.dim(`Report: ${options.reportPath}`));
    out.push(
      s.dim(
        "Static checks cover supported patterns only. A pass does not prove visual fidelity or accessibility.",
      ),
    );
  }
  return `${out.join("\n")}\n`;
}

export function formatSync(items: SyncItem[], s: Style, mode: "write" | "dry-run" | "check"): string {
  const verb: Record<SyncItem["status"], string> = {
    create: mode === "write" ? "created" : mode === "check" ? "missing" : "would create",
    append:
      mode === "write"
        ? "appended section to"
        : mode === "check"
          ? "missing section in"
          : "would append section to",
    update: mode === "write" ? "updated" : mode === "check" ? "out of date" : "would update",
    unchanged: "up to date",
    blocked: "blocked",
  };
  const out: string[] = [];
  for (const item of items) {
    const label =
      item.status === "blocked"
        ? s.red(verb.blocked)
        : item.status === "unchanged"
          ? s.green(verb.unchanged)
          : s.yellow(verb[item.status]);
    out.push(`${item.id.padEnd(12)} ${item.path.padEnd(34)} ${label}`);
    if (item.problem) {
      out.push(`  ${item.problem.message}`);
      for (const d of item.problem.details) out.push(`  ${s.dim(`- ${d}`)}`);
    }
  }
  if (items.length === 0) out.push("No adapters are configured (see adapters in designrail/config.yaml).");
  return `${out.join("\n")}\n`;
}

export function formatImport(result: ImportTokensResult, s: Style, dryRun: boolean): string {
  const m = result.merge;
  const out = [
    `${s.bold("Token import")} ${result.source} (${result.format})${dryRun ? s.yellow(" [dry run: nothing written]") : ""}`,
  ];
  const list = (label: string, items: string[]) => {
    if (items.length === 0) return;
    out.push(`${label} (${items.length}):`);
    for (const i of items.slice(0, 50)) out.push(`  ${i}`);
    if (items.length > 50) out.push(`  ...and ${items.length - 50} more`);
  };
  list(s.green("Added"), m.added);
  list(s.cyan("Changed (references merged)"), m.changed);
  if (m.conflicts.length > 0) {
    out.push(`${s.yellow("Conflicts")} (${m.conflicts.length}):`);
    for (const c of m.conflicts) {
      out.push(
        `  ${c.name}: existing ${JSON.stringify(c.existing.value)} (${c.existing.type}) vs incoming ${JSON.stringify(c.incoming.value)} (${c.incoming.type}) → ${m.replaced.includes(c.name) ? "replaced" : "kept existing"}`,
      );
    }
    if (m.replaced.length === 0)
      out.push(s.dim("  Existing values were kept. Rerun with --replace to take the incoming values."));
  }
  if (result.parsed.skipped.length > 0) {
    out.push(`${s.dim("Skipped")} (${result.parsed.skipped.length}):`);
    for (const k of result.parsed.skipped.slice(0, 50))
      out.push(`  ${k.name}${k.line ? ` (line ${k.line})` : ""}: ${k.reason}`);
    if (result.parsed.skipped.length > 50) out.push(`  ...and ${result.parsed.skipped.length - 50} more`);
  }
  if (m.unmatchedAttachments.length > 0) {
    out.push(`${s.dim("Unmatched references")} (${m.unmatchedAttachments.length}):`);
    for (const a of m.unmatchedAttachments)
      out.push(`  ${a.origin} refers to ${a.cssVariable}, which is not a registered ${a.type} token`);
  }
  for (const note of result.parsed.notes) out.push(s.dim(`Note: ${note}`));
  if (result.definitionFileAdded)
    out.push(
      `${dryRun ? "Would add" : "Added"} ${result.source} to tokens.definitionFiles in designrail/config.yaml (raw values there are expected).`,
    );
  if (m.added.length + m.changed.length + m.replaced.length === 0) out.push("No changes to the token file.");
  else if (!dryRun)
    out.push(s.green("Token file updated. Run `designrail sync` to refresh AI instructions."));
  return `${out.join("\n")}\n`;
}

export function formatStatus(status: StatusResult, s: Style): string {
  const out = [s.bold("DesignRail status"), `Project root: ${status.root}`];
  if (!status.initialized) {
    out.push("Initialized: no");
  } else if (status.error) {
    out.push(
      s.red(`Configuration error: ${status.error.message}`),
      ...status.error.details.map((d) => `  - ${d}`),
    );
  } else {
    const p = status.project!;
    out.push(
      "Initialized: yes",
      `Framework: ${p.framework}; styling: Tailwind ${p.tailwind}${p.css ? " + CSS" : ""}`,
      `Tokens: ${status.tokens!.count}${
        status.tokens!.count > 0
          ? ` (${Object.entries(status.tokens!.byType)
              .map(([t, n]) => `${n} ${t}`)
              .join(", ")})`
          : " (unconfigured)"
      }${status.tokens!.unresolved ? `; ${status.tokens!.unresolved} unresolved` : ""}`,
      `Components: ${status.components!.count}`,
      `Rules enabled: ${status.rules!.enabled.join(", ") || "none"}${status.rules!.disabled.length ? `; disabled: ${status.rules!.disabled.join(", ")}` : ""}; failOn: ${status.rules!.failOn}`,
      "Adapters:",
      ...status.adapters!.map(
        (a) =>
          `  ${a.id.padEnd(12)} ${a.path.padEnd(34)} ${a.state === "up-to-date" ? s.green(a.state) : a.state === "blocked" ? s.red(a.state) : s.yellow(a.state)}${a.problem ? ` (${a.problem})` : ""}`,
      ),
    );
    const last = status.lastCheck;
    if (!last) out.push("Last check: none");
    else {
      out.push(
        `Last check: ${last.generatedAt || "unreadable"} ${last.status.toUpperCase()}: ${last.summary.errors} errors, ${last.summary.warnings} warnings, ${last.summary.unsupportedPatterns} unanalyzed patterns${last.fresh ? "" : s.yellow(" (stale)")}`,
      );
      for (const r of last.staleReasons) out.push(s.dim(`  - ${r}`));
    }
  }
  if (status.gaps.length > 0) {
    out.push("", s.bold("Setup gaps:"), ...status.gaps.map((g) => `  - ${g}`));
  }
  return `${out.join("\n")}\n`;
}

const CATEGORY_LABEL = {
  "configuration-error": "configuration error",
  "missing-capability": "missing optional capability",
  "unsupported-syntax": "unsupported syntax",
  "design-violation": "design violation",
  setup: "setup",
} as const;

export function formatDoctor(result: DoctorResult, s: Style): string {
  const out = [s.bold("DesignRail doctor"), `Project root: ${result.root}`, ""];
  for (const c of result.checks) {
    const mark =
      c.status === "ok" ? s.green("ok   ") : c.status === "warn" ? s.yellow("warn ") : s.red("error");
    out.push(`${mark} ${c.message} ${s.dim(`[${CATEGORY_LABEL[c.category]}]`)}`);
    for (const d of c.details ?? []) out.push(`        ${s.dim(`- ${d}`)}`);
    if (c.hint) out.push(`        ${s.dim(c.hint)}`);
  }
  const errors = result.checks.filter((c) => c.status === "error").length;
  const warns = result.checks.filter((c) => c.status === "warn").length;
  out.push("", `${plural(errors, "error")}, ${plural(warns, "warning")}`);
  return `${out.join("\n")}\n`;
}
