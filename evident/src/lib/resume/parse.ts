import { findSkills, skillById } from "../taxonomy";
import { normalizeWhitespace, splitLines, truncate } from "../text";

export type SectionKind = "header" | "summary" | "experience" | "projects" | "education" | "skills" | "achievements" | "other";

export interface ResumeLine {
  id: string;
  section: SectionKind;
  text: string;
  isHeading: boolean;
  hasMetric: boolean;
  hasActionVerb: boolean;
}

export interface SkillEvidence {
  lineId: string;
  quote: string;
  /** "demonstrated": used in an experience/project line. "listed": only named in a skills list or summary. */
  strength: "demonstrated" | "listed";
}

export interface ResumeSkill {
  skillId: string;
  name: string;
  strength: "demonstrated" | "listed";
  evidence: SkillEvidence[];
}

export type ResumeWarning =
  | "empty"
  | "too_short"
  | "garbled_text"
  | "no_sections_detected"
  | "no_contact_details"
  | "no_experience_or_projects"
  | "no_skills_detected"
  | "no_dates_found"
  | "very_long";

export interface ParsedResume {
  status: "parsed" | "needs_review" | "failed";
  warnings: ResumeWarning[];
  lines: ResumeLine[];
  sections: { kind: SectionKind; heading: string; lineIds: string[] }[];
  skills: ResumeSkill[];
  contact: { hasEmail: boolean; hasPhone: boolean; links: string[] };
  /** Months of dated experience found in the experience section; null when no date ranges were readable. */
  experienceMonths: number | null;
  education: { degree: string | null; graduationYear: number | null };
  stats: { characters: number; words: number; lines: number; bulletsWithMetrics: number; bullets: number };
}

const HEADINGS: [SectionKind, RegExp][] = [
  ["experience", /^(work |professional |relevant |industry )?(experience|employment|work history|internships?)( history)?$/i],
  ["projects", /^(academic |personal |key |selected |technical )?projects?$/i],
  ["education", /^(education|academics?|academic (background|qualifications?)|qualifications?)$/i],
  ["skills", /^((technical|core|key|relevant) )?(skills|competenc(y|ies)|technologies|tech stack|tools)( (&|and) (tools|technologies|interests))?$/i],
  ["summary", /^(summary|profile|objective|about( me)?|professional summary|career objective)$/i],
  ["achievements", /^(achievements?|awards?|honou?rs?|certifications?|publications?|leadership|extra-?curriculars?|positions of responsibility|volunteer(ing)?|activities)( (&|and) [a-z ]+)?$/i],
];

const ACTION_VERBS =
  /^(built|led|designed|developed|implemented|created|launched|shipped|improved|reduced|increased|optimi[sz]ed|automated|analy[sz]ed|managed|migrated|architected|delivered|deployed|wrote|drove|owned|researched|trained|tested|integrated|refactored|scaled|mentored|organi[sz]ed|conducted|collaborated|coordinated|presented|engineered|established|generated|grew|won|published|maintained|resolved|streamlined|spearheaded|contributed|worked|taught|planned|ran|set up|prototyped|evaluated|modeled|modelled|secured|achieved|cut|boosted|initiated|founded|co-founded)\b/i;

const METRIC = /(\d+(\.\d+)?\s?(%|percent|x\b|k\b|m\b|ms\b|s\b|hrs?\b|hours?\b|users?\b|customers?\b|requests?\b|rps\b|qps\b|lpa\b))|([$₹€£]\s?\d)|\b\d{2,}\+?\s+(people|students|members|clients|teams|projects|tickets|tests|pages|records|rows|downloads|stars|commits)\b/i;

const MONTHS = "jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec";
const DATE_RANGE = new RegExp(
  `((?:(?:${MONTHS})[a-z]*\\.?\\s+)?(?:\\d{1,2}/)?(?:19|20)\\d{2})\\s*(?:-|–|—|to|until)\\s*((?:(?:${MONTHS})[a-z]*\\.?\\s+)?(?:\\d{1,2}/)?(?:19|20)\\d{2}|present|current|now|ongoing|date)`,
  "gi",
);

function parseDatePoint(s: string, now: Date, isEnd: boolean): Date | null {
  const t = s.trim().toLowerCase();
  if (/present|current|now|ongoing|date/.test(t)) return now;
  const year = t.match(/(19|20)\d{2}/);
  if (!year) return null;
  const y = Number(year[0]);
  const mName = t.match(new RegExp(MONTHS));
  const mNum = t.match(/(\d{1,2})\//);
  let month = isEnd ? 11 : 0;
  if (mName) month = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(mName[0].slice(0, 3));
  else if (mNum) month = Math.min(11, Math.max(0, Number(mNum[1]) - 1));
  else if (isEnd) month = 11;
  return new Date(Date.UTC(y, month, isEnd ? 28 : 1));
}

/** Merge overlapping date ranges and return total months. Ranges that end in the future or run backwards are ignored. */
export function monthsFromRanges(text: string, now: Date): number | null {
  const ranges: [number, number][] = [];
  DATE_RANGE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = DATE_RANGE.exec(text)) !== null) {
    const a = parseDatePoint(m[1] ?? "", now, false);
    const b = parseDatePoint(m[2] ?? "", now, true);
    if (!a || !b) continue;
    const end = Math.min(b.getTime(), now.getTime());
    if (end <= a.getTime()) continue;
    ranges.push([a.getTime(), end]);
  }
  if (ranges.length === 0) return null;
  ranges.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let [cs, ce] = ranges[0]!;
  for (const [s, e] of ranges.slice(1)) {
    if (s <= ce) ce = Math.max(ce, e);
    else {
      total += ce - cs;
      [cs, ce] = [s, e];
    }
  }
  total += ce - cs;
  return Math.round(total / (30.44 * 86_400_000));
}

/** Heuristic for text that came out of a PDF as letter soup ("J o h n   D o e") or mojibake. */
export function looksGarbled(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length < 20) return false;
  const single = tokens.filter((t) => t.length === 1 && /[a-zA-Z]/.test(t)).length / tokens.length;
  const weird = (text.match(/[�\u0000-\u0008\u000e-\u001f]/g) ?? []).length / text.length;
  const alpha = (text.match(/[a-zA-Z]/g) ?? []).length / text.length;
  return single > 0.35 || weird > 0.02 || alpha < 0.45;
}

function classifyHeading(line: string): SectionKind | null {
  const cleaned = line.replace(/[:\-–—_|•*#]+/g, " ").replace(/\s+/g, " ").trim();
  if (cleaned.length === 0 || cleaned.length > 45 || cleaned.split(" ").length > 5) return null;
  for (const [kind, re] of HEADINGS) if (re.test(cleaned)) return kind;
  return null;
}

export function parseResume(raw: string, now: Date = new Date()): ParsedResume {
  const text = normalizeWhitespace(raw ?? "");
  const warnings: ResumeWarning[] = [];
  const empty: ParsedResume = {
    status: "failed",
    warnings,
    lines: [],
    sections: [],
    skills: [],
    contact: { hasEmail: false, hasPhone: false, links: [] },
    experienceMonths: null,
    education: { degree: null, graduationYear: null },
    stats: { characters: text.length, words: 0, lines: 0, bulletsWithMetrics: 0, bullets: 0 },
  };
  if (text.length === 0) {
    warnings.push("empty");
    return empty;
  }
  if (looksGarbled(text)) {
    warnings.push("garbled_text");
    return empty;
  }

  const rawLines = splitLines(text);
  const lines: ResumeLine[] = [];
  const sections: ParsedResume["sections"] = [];
  let current: SectionKind = "header";
  let sawHeading = false;

  rawLines.forEach((rawLine, i) => {
    const heading = classifyHeading(rawLine);
    const id = `L${i + 1}`;
    if (heading) {
      current = heading;
      sawHeading = true;
      sections.push({ kind: heading, heading: rawLine, lineIds: [] });
      lines.push({ id, section: heading, text: rawLine, isHeading: true, hasMetric: false, hasActionVerb: false });
      return;
    }
    const body = rawLine.replace(/^[\s•●▪■◦‣·*\-–—>o]+(?=\s|\w)/, "").trim();
    if (!body) return;
    if (sections.length === 0) sections.push({ kind: "header", heading: "", lineIds: [] });
    sections[sections.length - 1]!.lineIds.push(id);
    lines.push({
      id,
      section: current,
      text: body,
      isHeading: false,
      hasMetric: METRIC.test(body),
      hasActionVerb: ACTION_VERBS.test(body),
    });
  });

  // Skills, with the lines that back them.
  const bySkill = new Map<string, SkillEvidence[]>();
  for (const line of lines) {
    if (line.isHeading) continue;
    const seen = new Set<string>();
    for (const hit of findSkills(line.text)) {
      if (seen.has(hit.skillId)) continue;
      seen.add(hit.skillId);
      const demonstrated = line.section === "experience" || line.section === "projects" || (line.section === "achievements" && line.hasActionVerb);
      const list = bySkill.get(hit.skillId) ?? [];
      list.push({ lineId: line.id, quote: truncate(line.text, 220), strength: demonstrated ? "demonstrated" : "listed" });
      bySkill.set(hit.skillId, list);
    }
  }
  const skills: ResumeSkill[] = [...bySkill.entries()]
    .map(([skillId, evidence]) => {
      const sorted = evidence.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === "demonstrated" ? -1 : 1)).slice(0, 4);
      return {
        skillId,
        name: skillById(skillId)?.name ?? skillId,
        strength: sorted[0]!.strength,
        evidence: sorted,
      };
    })
    .sort((a, b) => (a.strength === b.strength ? a.name.localeCompare(b.name) : a.strength === "demonstrated" ? -1 : 1));

  const expText = lines.filter((l) => l.section === "experience").map((l) => l.text).join("\n");
  const experienceMonths = expText ? monthsFromRanges(expText, now) : null;

  const eduText = lines.filter((l) => l.section === "education").map((l) => l.text).join("\n");
  const degree = eduText.match(/\b(ph\.?d|m\.?tech|m\.?s\.?c?|mba|m\.?e|mca|master'?s?(?: of [a-z ]+)?|b\.?tech|b\.?e|b\.?sc|bca|bba|b\.?com|b\.?a|bachelor'?s?(?: of [a-z ]+)?|diploma)\b/i);
  const years = [...eduText.matchAll(/\b(19|20)\d{2}\b/g)].map((m) => Number(m[0]));
  const education = { degree: degree ? degree[0] : null, graduationYear: years.length ? Math.max(...years) : null };

  const links = [...text.matchAll(/\b((?:https?:\/\/)?(?:www\.)?(?:linkedin\.com|github\.com|gitlab\.com|behance\.net|dribbble\.com)\/[^\s|,)]+)/gi)].map((m) => m[1]!);
  const contact = {
    hasEmail: /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(text),
    hasPhone: /(\+?\d[\d\s().-]{8,}\d)/.test(text),
    links: [...new Set(links)],
  };

  const bullets = lines.filter((l) => !l.isHeading && (l.section === "experience" || l.section === "projects"));
  const stats = {
    characters: text.length,
    words: text.split(/\s+/).length,
    lines: lines.length,
    bullets: bullets.length,
    bulletsWithMetrics: bullets.filter((b) => b.hasMetric).length,
  };

  if (text.length < 300) warnings.push("too_short");
  if (!sawHeading) warnings.push("no_sections_detected");
  if (!contact.hasEmail && !contact.hasPhone) warnings.push("no_contact_details");
  if (bullets.length === 0) warnings.push("no_experience_or_projects");
  if (skills.length === 0) warnings.push("no_skills_detected");
  if (expText && experienceMonths === null) warnings.push("no_dates_found");
  if (stats.words > 1400) warnings.push("very_long");

  const blocking: ResumeWarning[] = ["too_short", "no_sections_detected", "no_experience_or_projects", "no_skills_detected"];
  const status = warnings.some((w) => blocking.includes(w)) ? "needs_review" : "parsed";
  return { status, warnings, lines, sections, skills, contact, experienceMonths, education, stats };
}

export const WARNING_TEXT: Record<ResumeWarning, string> = {
  empty: "No text could be read from this file. If it is a scanned image, export a text-based PDF or paste the text instead.",
  too_short: "This resume is very short, so matches will be low-confidence.",
  garbled_text: "The extracted text looks corrupted (often a PDF with unusual fonts). Paste the resume as text instead.",
  no_sections_detected: "No standard section headings (Experience, Projects, Education, Skills) were found, so evidence could not be attributed to sections.",
  no_contact_details: "No email or phone number was found.",
  no_experience_or_projects: "No experience or project lines were found. Skills can only be marked as listed, not demonstrated.",
  no_skills_detected: "No recognised skills were found in the text.",
  no_dates_found: "No date ranges were readable in the experience section, so total experience is unknown.",
  very_long: "This resume is long. Most recruiters expect one page for early-career roles.",
};
