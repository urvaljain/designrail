import { formatZodIssues } from "../../config/load.js";
import { DesignRailError } from "../../utilities/errors.js";
import { tokenFileSchema } from "../schema.js";
import type { ImportResult } from "./types.js";

export function importNative(data: unknown, sourceFile: string): ImportResult {
  const parsed = tokenFileSchema.safeParse(data);
  if (!parsed.success) {
    throw new DesignRailError("parse", `${sourceFile} is not a valid DesignRail token file`, {
      details: formatZodIssues(parsed.error),
    });
  }
  return {
    format: "native",
    sourceFile,
    tokens: Object.entries(parsed.data.tokens).map(([name, token]) => ({ name, token })),
    attachments: [],
    skipped: [],
    notes: [],
  };
}
