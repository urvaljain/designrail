import { formatZodIssues } from "../config/load.js";
import { readIfExists } from "../filesystem/safe-write.js";
import { DesignRailError, errorMessage } from "../utilities/errors.js";
import { emptyTokenFile, tokenFileSchema, type TokenFile } from "./schema.js";

export function parseTokenFileText(text: string, label: string): TokenFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DesignRailError("configuration", `${label} is not valid JSON`, {
      details: [errorMessage(error)],
    });
  }
  const result = tokenFileSchema.safeParse(data);
  if (!result.success) {
    throw new DesignRailError("configuration", `${label} is invalid`, {
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}

export function readTokenFile(root: string, relPath: string): { file: TokenFile; exists: boolean } {
  const text = readIfExists(root, relPath);
  if (text === null) return { file: emptyTokenFile(), exists: false };
  return { file: parseTokenFileText(text, relPath), exists: true };
}

export function serializeTokenFile(file: TokenFile): string {
  const sorted: TokenFile = {
    ...(file.$comment ? { $comment: file.$comment } : {}),
    schemaVersion: file.schemaVersion,
    tokens: Object.fromEntries(
      Object.keys(file.tokens)
        .sort()
        .map((k) => [k, file.tokens[k]!]),
    ),
  };
  return `${JSON.stringify(sorted, null, 2)}\n`;
}
