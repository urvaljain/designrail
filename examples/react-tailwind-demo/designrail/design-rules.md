# Design rules (demo)

- Colors come only from the semantic tokens in `src/index.css` (`brand`, `surface`, `text`, `border`, ...).
  Never use Tailwind's default palette or hex values in components.
- Spacing uses the named scale `xs`, `sm`, `md`, `lg`, `xl` (`p-md`, `gap-sm`). Numeric utilities such as `p-4` are not allowed.
- Group settings in `Card` sections. Use `Button` for every action and `Input` for text-like fields.
- Primary action on the right; secondary actions use `variant="secondary"`.
