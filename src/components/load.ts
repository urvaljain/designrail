import { formatZodIssues } from "../config/load.js";
import { readIfExists } from "../filesystem/safe-write.js";
import { DesignRailError, errorMessage } from "../utilities/errors.js";
import { componentFileSchema, emptyComponentFile, type ComponentFile } from "./schema.js";

export function parseComponentFileText(text: string, label: string): ComponentFile {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new DesignRailError("configuration", `${label} is not valid JSON`, {
      details: [errorMessage(error)],
    });
  }
  const result = componentFileSchema.safeParse(data);
  if (!result.success) {
    throw new DesignRailError("configuration", `${label} is invalid`, {
      details: formatZodIssues(result.error),
    });
  }
  return result.data;
}

export function readComponentFile(root: string, relPath: string): { file: ComponentFile; exists: boolean } {
  const text = readIfExists(root, relPath);
  if (text === null) return { file: emptyComponentFile(), exists: false };
  return { file: parseComponentFileText(text, relPath), exists: true };
}

export function serializeComponentFile(file: ComponentFile): string {
  const components = [...file.components].sort((a, b) => a.id.localeCompare(b.id));
  return `${JSON.stringify({ ...file, components }, null, 2)}\n`;
}
