# Components

`designrail/components.json` lists components that AI tools should reuse. Registration feeds the generated
instructions, task-brief suggestions, DR004 (raw element instead of component), and DR008 (import policy).

```json
{
  "schemaVersion": 1,
  "components": [
    {
      "id": "button",
      "exportName": "Button",
      "sourceFile": "src/components/ui/button.tsx",
      "importSpecifier": "@/components/ui/button",
      "exportKind": "named",
      "description": "Action button.",
      "usage": "Use variant=\"secondary\" for non-primary actions.",
      "variants": ["primary", "secondary"],
      "replaces": ["button"],
      "implementationFiles": [],
      "importPolicy": {
        "alternateSpecifiers": [],
        "restricted": [{ "from": "@mui/material", "importName": "Button" }]
      }
    }
  ]
}
```

| Field                              | Meaning                                                                                                                      |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `id`                               | Registry ID (lowercase, digits, dashes)                                                                                      |
| `exportName`                       | The exported identifier                                                                                                      |
| `sourceFile`                       | Project-relative **filesystem path** of the implementation                                                                   |
| `importSpecifier`                  | The **module specifier** other files should import from (may be an alias); not a path requirement                            |
| `exportKind`                       | `named` or `default`                                                                                                         |
| `description`, `usage`             | Shown to AI tools                                                                                                            |
| `variants`                         | Exactly the variants you list. DesignRail never infers props or variants                                                     |
| `replaces`                         | Raw elements this component should be used instead of: `button`, `a`, or one attribute qualifier such as `input[type=email]` |
| `implementationFiles`              | Extra files that implement the component and may use the raw elements (the source file is always exempt)                     |
| `importPolicy.alternateSpecifiers` | Other acceptable specifiers, for example a barrel `@/components/ui`                                                          |
| `importPolicy.restricted`          | Imports that should be replaced by this component. `importName` may be `default` or `*`                                      |

## Registering

```sh
designrail add-component Button src/components/ui/button.tsx \
  --import "@/components/ui/button" \
  --replaces button \
  --description "Action button." \
  --usage 'Use variant="secondary" for non-primary actions.' \
  --variants primary,secondary \
  --restrict "@mui/material:Button"
```

- The path must be a `.tsx`, `.jsx`, `.ts`, or `.js` file inside the project; traversal, symlinks out of the
  project, secrets, and dependency or build folders are rejected.
- **Export kind** is inferred by parsing the file: `export function Button`, `export const Button`,
  `export { X as Button }`, `export default function Button`, or `export default Button`. When the file
  re-exports with `export *` or has an anonymous default export (`export default forwardRef(...)`),
  inference is unreliable: DesignRail asks on a terminal, or requires `--export`.
- **Import specifier** is inferred only from `source.importAliases` (for example `@/*` to `src/*` gives
  `@/components/ui/button`; an `index` file maps to its directory). Otherwise pass `--import`, or answer the
  prompt on a terminal.
- An existing ID is not replaced unless you pass `--update`. `--dry-run` validates without writing.

`designrail list-components [--json]` shows each component's source path, specifier, replaced elements,
and whether the file exists. `doctor` verifies source files, implementation files, export kinds, and whether
the specifier resolves to the source file through the configured aliases.

## How the checks use the registry

- **DR004** flags `<button>` in application code when `Button` replaces `button`. It does not flag the
  element inside `button.tsx` itself or in listed implementation files. Elements without an explicit
  `replaces` mapping are never flagged. For `input[type=...]` selectors, an `<input>` without `type`
  counts as `text`, and a dynamic `type={...}` is recorded as unknown instead of reported.
- **DR008** flags restricted imports (matching the imported name, so `import { Button as MuiButton }` is
  caught), imports of the component's module through a different specifier (`../ui/button` instead of
  `@/components/ui/button`, capped at warning), and imports of internal implementation files. A local
  function that happens to be called `Button` is never flagged by name alone.
- **DR007** treats components that replace `label` (for example a shadcn-style `Label`) like `<label>`
  when checking wrapping labels.

Registered components are not checked internally: DesignRail does not verify that `Input` renders a label
or that `Button` forwards props. Describe expectations in `usage` and review them manually.
