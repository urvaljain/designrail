import { DEFAULT_ADAPTER_PATHS, type AdapterId } from "../config/schema.js";
import { resolveInsideRoot, isSymlink } from "../filesystem/paths.js";
import { atomicWrite, readIfExists } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import { normalizeNewlines } from "../utilities/text.js";
import {
  appendSection,
  managedBlock,
  parseInner,
  replaceSection,
  sameContent,
  scanManagedSection,
  wasEditedManually,
} from "./markers.js";
import { CURSOR_FRONTMATTER, renderInstructions } from "./render.js";

export type SyncStatus = "create" | "append" | "update" | "unchanged" | "blocked";

export interface SyncProblem {
  kind: "malformed-markers" | "collision" | "manual-edit" | "unsafe-path";
  message: string;
  details: string[];
}

export interface SyncItem {
  id: AdapterId;
  path: string;
  status: SyncStatus;
  /** Full file text after sync (absent when blocked or unchanged). */
  next?: string;
  problem?: SyncProblem;
}

const OWNED: ReadonlySet<AdapterId> = new Set(["cursor", "generic"]);

export function adapterPath(adapter: { id: AdapterId; path?: string | undefined }): string {
  return adapter.path ?? DEFAULT_ADAPTER_PATHS[adapter.id];
}

function ownedFileText(id: AdapterId, block: string): string {
  return id === "cursor" ? `${CURSOR_FRONTMATTER}\n\n${block}\n` : `${block}\n`;
}

/** Computes what `sync` would write for each configured adapter. Never writes. */
export function planSync(project: ProjectContext, options: { force?: boolean } = {}): SyncItem[] {
  const items: SyncItem[] = [];
  for (const adapter of project.config.adapters) {
    const path = adapterPath(adapter);
    const id = adapter.id;
    try {
      const { absolute } = resolveInsideRoot(project.root, path, "adapter path");
      if (isSymlink(absolute)) {
        items.push({
          id,
          path,
          status: "blocked",
          problem: {
            kind: "unsafe-path",
            message: `${path} is a symbolic link; DesignRail will not write through it`,
            details: [],
          },
        });
        continue;
      }
    } catch (error) {
      items.push({
        id,
        path,
        status: "blocked",
        problem: { kind: "unsafe-path", message: (error as Error).message, details: [] },
      });
      continue;
    }
    const block = managedBlock(renderInstructions(project, id));
    const raw = readIfExists(project.root, path);
    const current = raw === null ? null : normalizeNewlines(raw);
    const crlf = raw !== null && raw.includes("\r\n");
    const eol = (text: string): string => (crlf ? text.replace(/\n/g, "\r\n") : text);
    if (current === null) {
      items.push({
        id,
        path,
        status: "create",
        next: OWNED.has(id) ? ownedFileText(id, block) : `${block}\n`,
      });
      continue;
    }
    const scan = scanManagedSection(current);
    if (scan.kind === "malformed") {
      items.push({
        id,
        path,
        status: "blocked",
        problem: {
          kind: "malformed-markers",
          message: `${path} has malformed DesignRail markers; nothing was changed`,
          details: [
            ...scan.problems,
            "Fix the markers by hand (one START and one END line), or remove both to let sync append a fresh section.",
          ],
        },
      });
      continue;
    }
    if (OWNED.has(id)) {
      if (scan.kind === "none") {
        items.push({
          id,
          path,
          status: "blocked",
          problem: {
            kind: "collision",
            message: `${path} exists and was not created by DesignRail; refusing to overwrite it`,
            details: [
              "Rename or remove the file, or set a different path for this adapter in designrail/config.yaml.",
            ],
          },
        });
        continue;
      }
      const expected = ownedFileText(id, block);
      if (sameContent(current, expected)) {
        items.push({ id, path, status: "unchanged" });
        continue;
      }
      const outsideChanged = !sameContent(current, ownedFileText(id, managedBlockFromInner(scan.inner)));
      if ((wasEditedManually(scan.inner) || outsideChanged) && !options.force) {
        items.push({ id, path, status: "blocked", problem: manualEditProblem(path) });
        continue;
      }
      items.push({ id, path, status: "update", next: eol(expected) });
      continue;
    }
    if (scan.kind === "none") {
      items.push({ id, path, status: "append", next: eol(appendSection(current, block)) });
      continue;
    }
    const next = replaceSection(current, scan, block);
    if (sameContent(scan.inner, block.split("\n").slice(1, -1).join("\n"))) {
      items.push({ id, path, status: "unchanged" });
      continue;
    }
    if (wasEditedManually(scan.inner) && !options.force) {
      items.push({ id, path, status: "blocked", problem: manualEditProblem(path) });
      continue;
    }
    items.push({ id, path, status: "update", next: eol(next) });
  }
  return items;
}

/** Rebuilds the block exactly as it would have been generated for the body currently on disk. */
function managedBlockFromInner(inner: string): string {
  return managedBlock(parseInner(inner).body);
}

function manualEditProblem(path: string): SyncProblem {
  return {
    kind: "manual-edit",
    message: `The DesignRail section in ${path} was edited by hand; refusing to replace those edits`,
    details: [
      "Move lasting guidance into designrail/design-rules.md (or outside the markers), then rerun sync.",
      "Run `designrail sync --force` to replace the edited section.",
    ],
  };
}

/** Writes planned changes. Blocked items are never written. */
export function applySync(project: ProjectContext, items: SyncItem[]): SyncItem[] {
  const written: SyncItem[] = [];
  for (const item of items) {
    if (!item.next || item.status === "blocked" || item.status === "unchanged") continue;
    atomicWrite(project.root, item.path, item.next);
    written.push(item);
  }
  return written;
}

export function hasDrift(items: SyncItem[]): boolean {
  return items.some((i) => i.status !== "unchanged");
}
