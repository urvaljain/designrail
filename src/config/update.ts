import { parseDocument, type Document } from "yaml";
import { atomicWrite } from "../filesystem/safe-write.js";
import { DesignRailError } from "../utilities/errors.js";
import { CONFIG_PATH, parseConfigText } from "./load.js";

/**
 * Edits config.yaml through the YAML document model so user comments and formatting survive.
 * The edited text is re-validated before it is written atomically.
 */
export function updateConfigYaml(root: string, currentText: string, mutate: (doc: Document) => void): string {
  const doc = parseDocument(currentText);
  if (doc.errors.length > 0) {
    throw new DesignRailError("configuration", `${CONFIG_PATH} is not valid YAML`, {
      details: doc.errors.map((e) => e.message),
    });
  }
  mutate(doc);
  const next = doc.toString({ lineWidth: 0 });
  parseConfigText(next);
  if (next !== currentText) atomicWrite(root, CONFIG_PATH, next);
  return next;
}

export function addToStringList(doc: Document, path: string[], value: string): boolean {
  const current = doc.getIn(path);
  const list: string[] =
    current && typeof current === "object" && "toJSON" in current
      ? ((current as { toJSON(): unknown }).toJSON() as string[])
      : Array.isArray(current)
        ? (current as string[])
        : [];
  if (list.includes(value)) return false;
  doc.setIn(path, doc.createNode([...list, value]));
  return true;
}
