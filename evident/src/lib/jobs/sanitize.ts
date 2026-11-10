import { normalizeWhitespace } from "../text";

/**
 * Job descriptions are untrusted third-party text. Two things happen before any of it
 * reaches a model or a user:
 *   1. HTML is reduced to visible text; hidden elements are dropped and flagged, because
 *      hidden text is the usual carrier for both keyword stuffing and prompt injection.
 *   2. Instruction-like sentences aimed at an AI reader are detected, flagged and removed
 *      from the copy that is sent to a model.
 */
export interface IntegrityFlag {
  code:
    | "hidden_text"
    | "prompt_injection"
    | "level_experience_conflict"
    | "experience_inconsistent"
    | "work_mode_conflict"
    | "salary_implausible"
    | "missing_description"
    | "duplicate"
    | "apply_link_not_https"
    | "contact_details_in_description";
  detail: string;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", hellip: "…" };

export function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => safeCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m);
}

function safeCodePoint(n: number): string {
  return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : "";
}

const HIDDEN_STYLE = /display\s*:\s*none|visibility\s*:\s*hidden|font-size\s*:\s*0(?:px|pt|em|rem)?\s*(?:;|$|")|opacity\s*:\s*0(?:\.0+)?\s*(?:;|$|")|color\s*:\s*(?:#fff(?:fff)?|white|transparent)\b|(?:height|width)\s*:\s*0(?:px)?\s*(?:;|$|")|left\s*:\s*-\d{3,}px/i;

export function htmlToText(input: string): { text: string; hiddenText: string[] } {
  let html = input;
  // Some boards (Greenhouse) return entity-escaped HTML.
  if (!/<[a-z][\s\S]*>/i.test(html) && /&lt;[a-z]/i.test(html)) html = decodeEntities(html);

  const hiddenText: string[] = [];
  const strip = (fragment: string) => normalizeWhitespace(decodeEntities(fragment.replace(/<[^>]+>/g, " ")));

  html = html.replace(/<!--([\s\S]*?)-->/g, (_, c: string) => {
    const t = strip(c);
    if (t.length > 12) hiddenText.push(t);
    return " ";
  });
  html = html.replace(/<(script|style|noscript|template|iframe|object|svg)\b[\s\S]*?<\/\1>/gi, " ");
  // Elements hidden by attribute or inline style. Non-greedy to the first matching close tag is
  // enough here: we only need to drop the text, not preserve structure.
  html = html.replace(/<([a-z0-9]+)\b([^>]*)>([\s\S]*?)<\/\1>/gi, (m, _tag: string, attrs: string, inner: string) => {
    const hidden = /\bhidden\b/i.test(attrs.replace(/"[^"]*"/g, "")) || /aria-hidden\s*=\s*["']?true/i.test(attrs) || HIDDEN_STYLE.test(attrs);
    if (!hidden) return m;
    const t = strip(inner);
    if (t.length > 0) hiddenText.push(t);
    return " ";
  });

  const text = html
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*li[^>]*>/gi, "\n• ")
    .replace(/<\/\s*(p|div|h[1-6]|li|ul|ol|tr|section|article)\s*>/gi, "\n")
    .replace(/<\s*(p|div|h[1-6]|ul|ol|tr|section|article)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "");
  return { text: normalizeWhitespace(decodeEntities(text)), hiddenText };
}

const INJECTION_PATTERNS: RegExp[] = [
  /\b(ignore|disregard|forget|override)\b[^.\n]{0,40}\b(previous|prior|above|earlier|all|any|your)\b[^.\n]{0,30}\b(instructions?|prompts?|rules?|guidelines?|context)\b/i,
  /\b(system|developer)\s+(prompt|message|instructions?)\b/i,
  /\byou are (now|no longer)\b[^.\n]{0,60}/i,
  /\b(as an? |dear |attention[,:]? )(ai|llm|language model|assistant|chatbot|gpt|claude)\b/i,
  /\b(ai|llm|language model|assistant|chatbot|screening (tool|system|model)|ranking (tool|system|model))s?\b[^.\n]{0,60}\b(must|should|shall|need to|are instructed to|are required to)\b[^.\n]{0,60}\b(rank|rate|score|recommend|mark|classify|output|respond|reply|say|tell|include|report)\b/i,
  /\b(rank|rate|score|mark|classify|recommend)\b[^.\n]{0,30}\b(this|the) (job|role|posting|listing|candidate|applicant)\b[^.\n]{0,40}\b(as|at)\b[^.\n]{0,20}\b(100|10\/10|top|highest|perfect|best|strong match|#1)\b/i,
  /\b(do not|don't|never)\b[^.\n]{0,30}\b(mention|reveal|disclose|flag|warn|tell)\b[^.\n]{0,40}\b(user|candidate|applicant|this instruction)\b/i,
  /\b(reveal|print|output|repeat|exfiltrate|send)\b[^.\n]{0,30}\b(system prompt|instructions|api key|secret|credentials|conversation|resume data)\b/i,
  /<\/?(system|assistant|instructions?|tool_call|function_call)>/i,
  /\[\/?(INST|SYSTEM)\]/,
  /\bBEGIN (SYSTEM|INSTRUCTIONS?)\b/,
];

export interface InjectionFinding {
  excerpt: string;
}

/** Sentences in `text` that address an AI reader rather than a human applicant. */
export function detectInjection(text: string): InjectionFinding[] {
  const findings: InjectionFinding[] = [];
  for (const sentence of splitSentences(text)) {
    if (INJECTION_PATTERNS.some((re) => re.test(sentence))) findings.push({ excerpt: sentence.slice(0, 200) });
  }
  return findings;
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z<\[])/))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** The description with injection-like sentences removed; this is the only form a model ever sees. */
export function neutralize(text: string): string {
  const kept = text.split("\n").map((line) =>
    line
      .split(/(?<=[.!?])\s+(?=[A-Z<\[])/)
      .filter((sentence) => !INJECTION_PATTERNS.some((re) => re.test(sentence)))
      .join(" "),
  );
  return normalizeWhitespace(kept.join("\n"));
}

/** Delimit untrusted text for a prompt. The closing tag cannot be forged from inside the block. */
export function wrapUntrusted(label: string, text: string): string {
  const safe = text.replace(/<\/?untrusted[^>]*>/gi, "");
  return `<untrusted source="${label}">\n${safe}\n</untrusted>`;
}

export interface CleanDescription {
  /** Human-visible text, shown in the UI. */
  text: string;
  /** Text with AI-directed instructions removed, used for extraction and any model call. */
  modelText: string;
  flags: IntegrityFlag[];
}

export function cleanDescription(raw: string): CleanDescription {
  const flags: IntegrityFlag[] = [];
  const { text, hiddenText } = /<[a-z!/]|&lt;[a-z]/i.test(raw) ? htmlToText(raw) : { text: normalizeWhitespace(decodeEntities(raw)), hiddenText: [] };
  if (hiddenText.length > 0) {
    flags.push({ code: "hidden_text", detail: `The posting contained ${hiddenText.length} block(s) of text hidden from human readers. It was removed and not used.` });
  }
  const injections = [...detectInjection(text), ...hiddenText.flatMap(detectInjection)];
  if (injections.length > 0) {
    flags.push({
      code: "prompt_injection",
      detail: `The posting contains ${injections.length} instruction(s) aimed at automated readers (for example: "${injections[0]!.excerpt.slice(0, 90)}"). They were ignored and excluded from analysis.`,
    });
  }
  if (text.length < 120) flags.push({ code: "missing_description", detail: "The source provided little or no description, so requirements could not be extracted reliably." });
  if (/[a-z0-9._%+-]+@(gmail|yahoo|outlook|hotmail|proton(mail)?)\.[a-z.]+/i.test(text) || /\b(whatsapp|telegram)\b[^.\n]{0,40}\d{6,}/i.test(text)) {
    flags.push({ code: "contact_details_in_description", detail: "The posting asks applicants to use a personal email or messaging number. Legitimate employers rarely do this; verify before sharing personal data." });
  }
  return { text, modelText: neutralize(text), flags };
}
