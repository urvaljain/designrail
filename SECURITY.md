# Security policy

## Supported versions

DesignRail has not had a public release yet. Security fixes will target the latest released version.

## Reporting a vulnerability

Please do not open a public issue for security problems.

**Maintainer setup required before publication:** no private reporting channel is configured for this
repository yet. Before the first public release, maintainers should enable GitHub private vulnerability
reporting (repository Settings → Security) or publish a dedicated contact here. Until then, contact a
maintainer privately through the hosting platform and include:

- the affected version and command;
- a description of the issue and its impact;
- steps or a minimal project that reproduces it.

## Security model

Relevant areas for reports:

- DesignRail must not read or write outside the project root (path traversal, symlinks).
- It must not execute project code, configuration files, or commands found in project files.
- It must not read secrets (`.env*`, keys, certificates) or dependency and build directories.
- It must not overwrite user-authored files without an explicit option.
- It makes no network requests and collects no telemetry.

The AI tools that consume DesignRail's instructions and prompts are outside this project's control.
