import { parse, type ParseResult } from "@babel/parser";
import type * as t from "@babel/types";
import type { Language } from "../types.js";

export interface ParseFailureInfo {
  line: number;
  column: number;
  message: string;
}

export type SourceParse = { ok: true; ast: ParseResult<t.File> } | { ok: false; error: ParseFailureInfo };

export function languageOf(path: string): Language | null {
  if (/\.tsx$/.test(path)) return "tsx";
  if (/\.(ts|mts|cts)$/.test(path)) return "ts";
  if (/\.jsx$/.test(path)) return "jsx";
  if (/\.(js|mjs|cjs)$/.test(path)) return "js";
  if (/\.css$/.test(path)) return "css";
  return null;
}

/** Parses TS/JS/JSX source with Babel. Syntax errors are returned, never thrown. Code is never executed. */
export function parseSource(content: string, language: Exclude<Language, "css">): SourceParse {
  const plugins: ("typescript" | "jsx")[] =
    language === "tsx" ? ["typescript", "jsx"] : language === "ts" ? ["typescript"] : ["jsx"];
  try {
    const ast = parse(content, { sourceType: "unambiguous", plugins, errorRecovery: false });
    return { ok: true, ast };
  } catch (error) {
    const e = error as { message?: string; loc?: { line: number; column: number } };
    return {
      ok: false,
      error: {
        line: e.loc?.line ?? 1,
        column: (e.loc?.column ?? 0) + 1,
        message: (e.message ?? String(error)).replace(/\s*\(\d+:\d+\)$/, ""),
      },
    };
  }
}

const SKIP_KEYS = new Set([
  "loc",
  "start",
  "end",
  "range",
  "extra",
  "leadingComments",
  "trailingComments",
  "innerComments",
  "comments",
  "tokens",
]);

/** Depth-first traversal with an ancestor stack. Return false from the visitor to skip children. */
export function traverse(
  root: t.Node,
  visit: (node: t.Node, ancestors: readonly t.Node[]) => boolean | void,
): void {
  const ancestors: t.Node[] = [];
  const walk = (node: t.Node): void => {
    if (visit(node, ancestors) === false) return;
    ancestors.push(node);
    for (const key of Object.keys(node)) {
      if (SKIP_KEYS.has(key)) continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (const child of value)
          if (child && typeof child === "object" && typeof (child as t.Node).type === "string")
            walk(child as t.Node);
      } else if (value && typeof value === "object" && typeof (value as t.Node).type === "string") {
        walk(value as t.Node);
      }
    }
    ancestors.pop();
  };
  walk(root);
}

/** Maps string offsets to 1-based line/column positions. */
export class LineIndex {
  private readonly starts: number[] = [0];
  constructor(text: string) {
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) this.starts.push(i + 1);
  }
  locate(offset: number): { line: number; column: number } {
    let lo = 0;
    let hi = this.starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.starts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.starts[lo]! + 1 };
  }
}
