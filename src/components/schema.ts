import { z } from "zod";

export const COMPONENTS_SCHEMA_VERSION = 1;

export const COMPONENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
/** "button", "a", or "input[type=checkbox]" (one optional attribute qualifier). */
export const REPLACES_PATTERN = /^[a-z][a-z0-9-]*(\[[a-zA-Z-]+=[A-Za-z0-9_-]+\])?$/;

export const componentSchema = z.strictObject({
  id: z.string().regex(COMPONENT_ID_PATTERN, "Component IDs use lowercase letters, digits, and dashes"),
  exportName: z.string().regex(/^[A-Za-z_$][A-Za-z0-9_$]*$/, "Export name must be a JavaScript identifier"),
  /** Project-relative filesystem path of the implementation entry. */
  sourceFile: z.string().min(1),
  /** The module specifier code should import from (may be an alias, never a filesystem path requirement). */
  importSpecifier: z.string().min(1),
  exportKind: z.enum(["named", "default"]),
  description: z.string().optional(),
  usage: z.string().optional(),
  /** Variants exactly as supplied by the user; DesignRail never infers props or variants. */
  variants: z.array(z.string().min(1)).optional(),
  /** Raw HTML elements this component should be used instead of. */
  replaces: z
    .array(z.string().regex(REPLACES_PATTERN, 'Use an element name such as "button" or "input[type=text]"'))
    .default([]),
  /** Extra implementation files exempt from DR004 (the source file is always exempt). */
  implementationFiles: z.array(z.string().min(1)).default([]),
  importPolicy: z
    .strictObject({
      /** Additional specifiers that are acceptable (for example a barrel "@/components/ui"). */
      alternateSpecifiers: z.array(z.string().min(1)).default([]),
      /** Imports that should be replaced by this component, e.g. { from: "@mui/material", importName: "Button" }. */
      restricted: z
        .array(
          z.strictObject({
            from: z.string().min(1),
            importName: z.string().min(1),
          }),
        )
        .default([]),
    })
    .prefault({}),
});
export type RegisteredComponent = z.infer<typeof componentSchema>;
export type ComponentInput = z.input<typeof componentSchema>;

export const componentFileSchema = z
  .strictObject({
    $comment: z.string().optional(),
    schemaVersion: z.literal(COMPONENTS_SCHEMA_VERSION),
    components: z.array(componentSchema),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    file.components.forEach((component, index) => {
      if (ids.has(component.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["components", index, "id"],
          message: `Duplicate component id "${component.id}"`,
        });
      }
      ids.add(component.id);
    });
  });
export type ComponentFile = z.infer<typeof componentFileSchema>;

export function emptyComponentFile(): ComponentFile {
  return {
    $comment:
      "Registered components. Add entries with `designrail add-component <Name> <path>`. Variants are only what you list.",
    schemaVersion: COMPONENTS_SCHEMA_VERSION,
    components: [],
  };
}

export interface ElementSelector {
  tag: string;
  attribute?: { name: string; value: string };
}

export function parseReplaces(selector: string): ElementSelector {
  const match = /^([a-z][a-z0-9-]*)(?:\[([a-zA-Z-]+)=([A-Za-z0-9_-]+)\])?$/.exec(selector);
  if (!match) return { tag: selector };
  return match[2] ? { tag: match[1]!, attribute: { name: match[2], value: match[3]! } } : { tag: match[1]! };
}
