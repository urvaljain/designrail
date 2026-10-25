import { existsSync, statSync } from "node:fs";
import { protectedReason } from "../filesystem/protected.js";
import { resolveInsideRoot } from "../filesystem/paths.js";
import { atomicWrite, readIfExists } from "../filesystem/safe-write.js";
import type { ProjectContext } from "../project/context.js";
import { DesignRailError, errorMessage } from "../utilities/errors.js";
import { serializeComponentFile } from "./load.js";
import {
  componentFileSchema,
  componentSchema,
  type ComponentFile,
  type RegisteredComponent,
} from "./schema.js";
import { decideExportKind, inferExports, inferImportSpecifier, type ExportDecision } from "./exports.js";
import { formatZodIssues } from "../config/load.js";

export interface RegisterOptions {
  name: string;
  path: string;
  importSpecifier?: string;
  exportKind?: "named" | "default";
  id?: string;
  replaces?: string[];
  description?: string;
  usage?: string;
  variants?: string[];
  implementationFiles?: string[];
  alternateSpecifiers?: string[];
  restricted?: { from: string; importName: string }[];
  update?: boolean;
  dryRun?: boolean;
}

export interface RegisterResult {
  component: RegisteredComponent;
  file: ComponentFile;
  action: "added" | "updated";
  inferred: { exportKind: boolean; importSpecifier: boolean };
  notes: string[];
  written: boolean;
}

export function componentIdFor(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^A-Za-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

const SOURCE_EXT = /\.(tsx|jsx|ts|js|mts|mjs)$/;

export function validateComponentPath(project: ProjectContext, input: string): string {
  const { relative, absolute } = resolveInsideRoot(project.root, input, "component path");
  const reason = protectedReason(relative, { generatedDirectories: [] });
  if (reason) throw new DesignRailError("unsafe-path", `Refusing component path ${relative}: ${reason}`);
  if (!existsSync(absolute)) throw new DesignRailError("usage", `Component file not found: ${relative}`);
  if (!statSync(absolute).isFile())
    throw new DesignRailError("usage", `Component path is not a file: ${relative}`);
  if (!SOURCE_EXT.test(relative)) {
    throw new DesignRailError("usage", `Component file must be .tsx, .jsx, .ts, or .js: ${relative}`);
  }
  return relative;
}

/** Inspects the component file; returns a decision or why inference is unreliable. */
export function inspectComponent(project: ProjectContext, relative: string, name: string): ExportDecision {
  const text = readIfExists(project.root, relative) ?? "";
  try {
    return decideExportKind(inferExports(text, relative), name);
  } catch (error) {
    return { kind: null, reliable: false, reason: `could not parse the file (${errorMessage(error)})` };
  }
}

export function registerComponent(project: ProjectContext, options: RegisterOptions): RegisterResult {
  const sourceFile = validateComponentPath(project, options.path);
  const notes: string[] = [];
  const decision = inspectComponent(project, sourceFile, options.name);
  let exportKind = options.exportKind;
  if (!exportKind) {
    if (!decision.reliable) {
      throw new DesignRailError("usage", `Cannot infer how ${options.name} is exported: ${decision.reason}`, {
        hint: "Pass --export named or --export default.",
      });
    }
    exportKind = decision.kind;
    if (decision.note) notes.push(decision.note);
  } else if (decision.reliable && decision.kind !== exportKind) {
    notes.push(
      `The file appears to export ${options.name} as ${decision.kind}, but --export ${exportKind} was given.`,
    );
  } else if (!decision.reliable) {
    notes.push(`Export could not be verified: ${decision.reason}.`);
  }

  let importSpecifier = options.importSpecifier;
  if (!importSpecifier) {
    const inferred = inferImportSpecifier(sourceFile, project.config.source.importAliases);
    if (!inferred) {
      throw new DesignRailError("usage", `Cannot infer an import specifier for ${sourceFile}`, {
        hint: 'Pass --import "<specifier>" (for example --import "@/components/ui/button"). No import alias in source.importAliases covers this file.',
      });
    }
    importSpecifier = inferred;
  }

  const implementationFiles = (options.implementationFiles ?? []).map(
    (f) => resolveInsideRoot(project.root, f, "implementation file").relative,
  );
  const candidate = {
    id: options.id ?? componentIdFor(options.name),
    exportName: options.name,
    sourceFile,
    importSpecifier,
    exportKind,
    ...(options.description ? { description: options.description } : {}),
    ...(options.usage ? { usage: options.usage } : {}),
    ...(options.variants?.length ? { variants: options.variants } : {}),
    replaces: options.replaces ?? [],
    implementationFiles,
    importPolicy: {
      alternateSpecifiers: options.alternateSpecifiers ?? [],
      restricted: options.restricted ?? [],
    },
  };
  const parsed = componentSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new DesignRailError("usage", "Invalid component definition", {
      details: formatZodIssues(parsed.error),
    });
  }
  const component = parsed.data;
  const existingIndex = project.componentFile.components.findIndex((c) => c.id === component.id);
  if (existingIndex >= 0 && !options.update) {
    throw new DesignRailError("collision", `A component with id "${component.id}" is already registered`, {
      hint: "Pass --update to replace it, or --id to register under a different id.",
    });
  }
  const components = [...project.componentFile.components];
  if (existingIndex >= 0) components[existingIndex] = component;
  else components.push(component);
  const file = componentFileSchema.parse({ ...project.componentFile, components });

  let written = false;
  if (!options.dryRun) {
    atomicWrite(project.root, project.config.paths.components, serializeComponentFile(file));
    written = true;
  }
  return {
    component,
    file,
    action: existingIndex >= 0 ? "updated" : "added",
    inferred: { exportKind: !options.exportKind, importSpecifier: !options.importSpecifier },
    notes,
    written,
  };
}
