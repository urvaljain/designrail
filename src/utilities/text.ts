export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Lowercase ASCII slug made of [a-z0-9-], at most `maxLength` characters, never empty. */
export function slugify(input: string, maxLength = 60): string {
  const slug = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  let cut = slug.slice(0, maxLength);
  if (slug.length > maxLength && slug[maxLength] !== "-" && cut.includes("-"))
    cut = cut.slice(0, cut.lastIndexOf("-"));
  cut = cut.replace(/-+$/g, "");
  return cut.length > 0 ? cut : "task";
}

export function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Escapes characters that would break a Markdown table cell. */
export function mdCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** Wraps a value in backticks safely (also prevents Claude Code `@path` import expansion). */
export function code(value: string): string {
  const fence = value.includes("`") ? "``" : "`";
  const pad = value.startsWith("`") || value.endsWith("`") ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}

export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function ensureTrailingNewline(text: string): string {
  return text.endsWith("\n") ? text : `${text}\n`;
}
