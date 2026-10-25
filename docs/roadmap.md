# Roadmap

These are possibilities for future releases. None of them are implemented in 0.1.0, and none are promised.

## Checks

- Runtime checks in a real browser: visible focus, keyboard reachability, and responsive layout at configured
  breakpoints. Static analysis cannot verify these reliably, so this release leaves them to manual QA.
- Color contrast between token pairs.
- Theme variants (dark mode, `[data-theme]`) in the token model and checks.
- Typography rules for font sizes, weights, and line heights; radius and shadow rules.
- Cross-file analysis for labels and component props.
- More syntaxes: SCSS, CSS Modules composition, CSS-in-JS (styled-components, Emotion, vanilla-extract), Vue
  and Svelte single-file components, MDX.
- Reading Tailwind's resolved theme from a build artifact instead of parsing configuration.
- Automatic safe fixes for unambiguous findings (for example a literal that equals exactly one token).

## Integrations

- Figma variables import.
- Screenshot or visual comparison.
- IDE extensions with inline findings.
- Pull-request comment bots and SARIF output for code-scanning tools.
- Optional direct integration with AI APIs for task briefs (the current release only uses templates).

## Product

- A local web view of reports.
- Monorepo support with multiple `designrail/` roots.
- Verified Cursor rule format and adapters for more assistants once their conventions can be confirmed.

There is no hosted service, account system, or telemetry planned for the core CLI.
