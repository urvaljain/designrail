<!-- designrail:starter — Delete this line once the guidance below reflects your project's real rules. -->

# Accessibility rules

> **Starter guidance.** Edit to match your team's accessibility commitments.
> DesignRail statically checks a small subset (image `alt` attributes, local form-control labels).
> Passing those checks does not mean an interface is accessible.

## Checked statically by DesignRail

- Every `<img>` has an `alt` attribute. Use `alt=""` only for decorative images.
- Every form control has an accessible name from a wrapping `<label>`, `htmlFor`/`id`, `aria-label`, or
  `aria-labelledby`. `aria-describedby` and `placeholder` are not names.

## Verify manually

- Keyboard: every interactive element is reachable and operable with the keyboard, in a logical order.
- Focus: focus is always visible and is managed when dialogs, menus, or routes change.
- Semantics: use native elements (`button`, `a`, `input`) or registered components that render them.
- Color contrast meets your target (for example WCAG 2.2 AA) for text and essential UI.
- Motion respects `prefers-reduced-motion`.
- Screen-reader announcements for async updates (loading, errors, success).
