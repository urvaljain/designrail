import { extname } from "node:path";
import { CssSyntaxError } from "postcss";
import { DesignRailError, errorMessage } from "../../utilities/errors.js";
import { importCss } from "./css.js";
import { importDtcg } from "./dtcg.js";
import { importNative } from "./native.js";
import { importTailwindV3 } from "./tailwind-v3.js";
import { IMPORT_FORMATS, type ImportFormat, type ImportOptions, type ImportResult } from "./types.js";

export * from "./types.js";
export { mergeTokens, type MergeOutcome, type MergeConflict } from "./merge.js";

export function detectFormat(relPath: string, text: string): ImportFormat {
  const ext = extname(relPath).toLowerCase();
  if (ext === ".css") return /@theme\b/.test(text) ? "tailwind-v4" : "css";
  if ([".js", ".cjs", ".mjs", ".ts", ".cts", ".mts"].includes(ext)) return "tailwind-v3";
  if (ext === ".json") {
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      if (data && typeof data === "object" && "schemaVersion" in data && "tokens" in data) return "native";
      return "dtcg";
    } catch {
      return "dtcg";
    }
  }
  throw new DesignRailError("usage", `Cannot detect token format for ${relPath}`, {
    hint: `Pass --format with one of: ${IMPORT_FORMATS.join(", ")}`,
  });
}

/** Parses a token source. Throws DesignRailError("parse") for malformed input; never evaluates code. */
export function runImport(
  relPath: string,
  text: string,
  format: ImportFormat,
  options: ImportOptions = {},
): ImportResult {
  try {
    switch (format) {
      case "css":
      case "tailwind-v4":
        return importCss(text, relPath, options, format);
      case "tailwind-v3":
        return importTailwindV3(text, relPath);
      case "native":
        return importNative(parseJson(text, relPath), relPath);
      case "dtcg":
        return importDtcg(parseJson(text, relPath), relPath, options);
    }
  } catch (error) {
    if (error instanceof DesignRailError) throw error;
    const detail =
      error instanceof CssSyntaxError ? `${error.reason} (line ${error.line ?? "?"})` : errorMessage(error);
    throw new DesignRailError("parse", `Could not parse ${relPath} as ${format}`, {
      details: [detail],
      hint: "The existing token file was not modified.",
    });
  }
}

function parseJson(text: string, relPath: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new DesignRailError("parse", `${relPath} is not valid JSON`, {
      details: [errorMessage(error)],
      hint: "The existing token file was not modified.",
    });
  }
}
