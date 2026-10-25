import { CONFIG_PATH, readConfig } from "../config/load.js";
import type { DesignRailConfig } from "../config/schema.js";
import { readComponentFile } from "../components/load.js";
import type { ComponentFile } from "../components/schema.js";
import { realRoot } from "../filesystem/paths.js";
import { readTokenFile } from "../tokens/load.js";
import { buildRegistry, type TokenRegistry } from "../tokens/registry.js";
import type { TokenFile } from "../tokens/schema.js";
import { DesignRailError } from "../utilities/errors.js";
import { fingerprint } from "../utilities/hash.js";

export interface ProjectContext {
  root: string;
  config: DesignRailConfig;
  configText: string;
  tokenFile: TokenFile;
  tokensExist: boolean;
  registry: TokenRegistry;
  componentFile: ComponentFile;
  componentsExist: boolean;
}

export function notInitializedError(): DesignRailError {
  return new DesignRailError("configuration", `DesignRail is not initialized here (missing ${CONFIG_PATH})`, {
    hint: "Run `designrail init` in the project root, or pass --cwd <project-root>.",
  });
}

/** Loads and validates configuration, tokens, and components. Throws DesignRailError on invalid data. */
export function loadProject(cwd: string): ProjectContext {
  const root = realRoot(cwd);
  const loaded = readConfig(root);
  if (!loaded) throw notInitializedError();
  const tokens = readTokenFile(root, loaded.config.paths.tokens);
  const components = readComponentFile(root, loaded.config.paths.components);
  return {
    root,
    config: loaded.config,
    configText: loaded.text,
    tokenFile: tokens.file,
    tokensExist: tokens.exists,
    registry: buildRegistry(tokens.file),
    componentFile: components.file,
    componentsExist: components.exists,
  };
}

/** Raises a configuration error when tokens contain missing aliases or cycles. */
export function assertTokensUsable(project: ProjectContext): void {
  const blocking = project.registry.problems.filter(
    (p) => p.kind === "alias-cycle" || p.kind === "missing-alias",
  );
  if (blocking.length > 0) {
    throw new DesignRailError(
      "configuration",
      `${project.config.paths.tokens} has unresolvable token references`,
      {
        details: blocking.map((p) => p.message),
        hint: 'Fix the alias values ("{group.name}") so every alias points to an existing token without cycles.',
      },
    );
  }
}

export interface ProjectFingerprints {
  config: string;
  tokens: string;
  components: string;
}

export function projectFingerprints(project: ProjectContext): ProjectFingerprints {
  return {
    config: fingerprint(project.config),
    tokens: fingerprint(project.tokenFile.tokens),
    components: fingerprint(project.componentFile.components),
  };
}
