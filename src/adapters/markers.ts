import { sha256 } from "../utilities/hash.js";

export const START_MARKER = "<!-- DESIGNRAIL:START -->";
export const END_MARKER = "<!-- DESIGNRAIL:END -->";
const HASH_PREFIX = "<!-- designrail:content-hash ";
export const NOTICE_LINE =
  "<!-- Managed by DesignRail. Edit the inputs in designrail/ and run `designrail sync`; changes inside this section are replaced. -->";

export type SectionScan =
  | { kind: "none" }
  | { kind: "ok"; startLine: number; endLine: number; inner: string }
  | { kind: "malformed"; problems: string[] };

/**
 * Locates the managed section. Any line mentioning DESIGNRAIL:START/END counts as a marker,
 * so near-miss spellings are reported as malformed instead of being ignored.
 */
export function scanManagedSection(text: string): SectionScan {
  const lines = text.split("\n");
  const starts: number[] = [];
  const ends: number[] = [];
  const problems: string[] = [];
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/DESIGNRAIL:START/.test(line)) {
      if (trimmed !== START_MARKER)
        problems.push(`line ${index + 1}: start marker must be exactly ${START_MARKER} on its own line`);
      starts.push(index);
    }
    if (/DESIGNRAIL:END/.test(line)) {
      if (trimmed !== END_MARKER)
        problems.push(`line ${index + 1}: end marker must be exactly ${END_MARKER} on its own line`);
      ends.push(index);
    }
  });
  if (starts.length === 0 && ends.length === 0) return { kind: "none" };
  if (starts.length > 1)
    problems.push(
      `found ${starts.length} start markers (lines ${starts.map((i) => i + 1).join(", ")}); expected one`,
    );
  if (ends.length > 1)
    problems.push(
      `found ${ends.length} end markers (lines ${ends.map((i) => i + 1).join(", ")}); expected one`,
    );
  if (starts.length === 0) problems.push("end marker without a start marker");
  if (ends.length === 0) problems.push("start marker without an end marker");
  if (starts.length === 1 && ends.length === 1 && ends[0]! < starts[0]!)
    problems.push("end marker appears before the start marker");
  if (problems.length > 0) return { kind: "malformed", problems };
  const startLine = starts[0]!;
  const endLine = ends[0]!;
  return { kind: "ok", startLine, endLine, inner: lines.slice(startLine + 1, endLine).join("\n") };
}

function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === "\\" && line[i + 1] === "|") {
      current += "\\|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells.slice(1, -1);
}

/**
 * Canonical form used to compare generated Markdown: ignores trailing whitespace, blank lines,
 * and Markdown table padding, so formatter-only changes (for example Prettier aligning tables or
 * adding a blank line before a marker) are not treated as drift or as manual edits.
 */
export function normalizeForComparison(text: string): string {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => {
      const trimmed = line.replace(/\s+$/, "");
      if (!/^\s*\|.*\|$/.test(trimmed)) return trimmed;
      const cells = splitTableRow(trimmed.trim()).map((cell) =>
        /^:?-{3,}:?$/.test(cell) ? cell.replace(/-+/, "---") : cell,
      );
      return `| ${cells.join(" | ")} |`;
    })
    .filter((line) => line.trim() !== "")
    .join("\n");
}

export function bodyHash(body: string): string {
  return sha256(normalizeForComparison(body)).slice(0, 16);
}

export function sameContent(a: string, b: string): boolean {
  return normalizeForComparison(a) === normalizeForComparison(b);
}

/** Builds the full managed block, including markers and the content hash. */
export function managedBlock(body: string): string {
  const trimmed = body.trim();
  return [START_MARKER, `${HASH_PREFIX}${bodyHash(trimmed)} -->`, NOTICE_LINE, "", trimmed, END_MARKER].join(
    "\n",
  );
}

export interface InnerParse {
  hash: string | null;
  body: string;
}

export function parseInner(inner: string): InnerParse {
  const lines = inner.split("\n");
  let hash: string | null = null;
  let i = 0;
  if (lines[i]?.startsWith(HASH_PREFIX)) {
    hash = lines[i]!.slice(HASH_PREFIX.length)
      .replace(/\s*-->\s*$/, "")
      .trim();
    i++;
  }
  if (lines[i] === NOTICE_LINE) i++;
  return { hash, body: lines.slice(i).join("\n").trim() };
}

/** True when the stored hash no longer matches the body, i.e. someone edited inside the section. */
export function wasEditedManually(inner: string): boolean {
  const { hash, body } = parseInner(inner);
  return hash === null || hash !== bodyHash(body);
}

/** Replaces the section between valid markers, keeping everything outside byte-for-byte. */
export function replaceSection(
  text: string,
  scan: Extract<SectionScan, { kind: "ok" }>,
  block: string,
): string {
  const lines = text.split("\n");
  return [...lines.slice(0, scan.startLine), block, ...lines.slice(scan.endLine + 1)].join("\n");
}

/** Appends a managed block to an existing file, separated by a blank line. */
export function appendSection(text: string, block: string): string {
  if (text.trim() === "") return `${block}\n`;
  const base = text.endsWith("\n") ? text : `${text}\n`;
  return `${base}\n${block}\n`;
}
