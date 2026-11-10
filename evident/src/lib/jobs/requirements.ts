import { findSkills, skillById } from "../taxonomy";
import { splitLines, truncate } from "../text";
import type { IntegrityFlag } from "./sanitize";

export type Level = "intern" | "entry" | "mid" | "senior" | "unknown";
export type WorkMode = "remote" | "hybrid" | "onsite" | "unknown";

export interface Requirement {
  id: string;
  kind: "skill" | "education" | "other";
  skillId?: string;
  label: string;
  importance: "must" | "nice";
  /** The line of the posting this requirement was read from. */
  quote: string;
}

export interface JobRequirements {
  requirements: Requirement[];
  minYears: number | null;
  maxYears: number | null;
  level: Level;
  workMode: WorkMode;
  degree: string | null;
  conflicts: IntegrityFlag[];
  /** True when the posting had recognisable "requirements"-style sections. */
  structured: boolean;
}

type Zone = "must" | "nice" | "duties" | "about" | "none";

const ZONE_HEADINGS: [Zone, RegExp][] = [
  ["nice", /(nice[- ]to[- ]have|preferred|bonus|good to have|plus points|would be (a )?plus|desirable|extra credit|it'?s a plus|helpful (experience|to have)|what would be nice)/i],
  ["must", /(requirements?|qualifications?|what you('ll| will)? (need|bring)|who you are|you (have|should have|must have)|must[- ]haves?|skills (required|needed|we)|what we('re| are) looking for|about you|eligibility|minimum|basic qualifications?|you might be a fit)/i],
  ["duties", /(responsibilit|what you('ll| will) (do|be doing|work on|own)|the role|your role|day[- ]to[- ]day|in this role|key duties|overview|some examples of|you('ll| will) support)/i],
  ["about", /(about (us|the company|the team|[A-Z][a-z]+)|who we are|our (mission|story|values|stack)|benefits|perks|what we offer|compensation|salary range|why (join|you'll love)|equal opportunity|how to apply|how \w+ (will )?supports?|country hiring guidelines|privacy)/i],
];

function zoneOfHeading(line: string): Zone | null {
  const t = line.replace(/[*_#:]+/g, "").replace(/[\u2018\u2019]/g, "'").trim();
  if (t.length > 70 || t.split(/\s+/).length > 9 || /[.!]$/.test(t)) return null;
  for (const [zone, re] of ZONE_HEADINGS) if (re.test(t)) return zone;
  return null;
}

const NICE_CUE = /\b(preferred|nice to have|bonus|a plus|is a plus|ideally|good to have|desirable|advantage|optional|not required)\b/i;
const MUST_CUE = /\b(must|required|requires?|need|minimum|at least|proficien|strong|solid|hands[- ]on|experience (with|in|using|building)|expertise|knowledge of|understanding of|ability to|fluent)\b/i;

export function inferLevel(title: string, text: string): Level {
  const t = title.toLowerCase();
  if (/\b(intern(ship)?|trainee|apprentice|co-?op|summer analyst)\b/.test(t)) return "intern";
  if (/\b(senior|sr\.?|staff|principal|lead|head|director|vp|manager|architect|iii|iv)\b/.test(t)) return "senior";
  if (/\b(junior|jr\.?|graduate|new grad|entry[- ]level|fresher|associate|early career|campus)\b/.test(t) || /\b(i|1)$/.test(t)) return "entry";
  if (/\b(ii|2|mid[- ]level)\b/.test(t)) return "mid";
  if (/\b(fresh(er)?s? (are )?welcome|open to fresh(er)?s|new grad(uate)?s?|recent graduates?|entry[- ]level|no (prior )?experience (required|needed))\b/i.test(text)) return "entry";
  return "unknown";
}

export function inferWorkMode(location: string | null, text: string): { mode: WorkMode; conflict: boolean } {
  const hay = `${location ?? ""}\n${text}`.toLowerCase();
  const remote = /\b(fully remote|100% remote|remote[- ]first|work from (home|anywhere)|remote (role|position|job))\b/.test(hay) || /\bremote\b/.test((location ?? "").toLowerCase());
  const onsite = /\b(on-?site only|in[- ]office|work from (the |our )?office|(5|five) days (a|per) week in|no remote|not a remote|must (be able to )?relocate|on-?site (role|position))\b/.test(hay);
  const hybrid = /\bhybrid\b/.test(hay);
  if (remote && onsite) return { mode: "unknown", conflict: true };
  if (hybrid) return { mode: "hybrid", conflict: false };
  if (remote) return { mode: "remote", conflict: false };
  if (onsite || (location && location.trim().length > 0)) return { mode: onsite ? "onsite" : "unknown", conflict: false };
  return { mode: "unknown", conflict: false };
}

interface YearMention {
  min: number;
  max: number | null;
  quote: string;
}

function yearMentions(lines: string[]): YearMention[] {
  const out: YearMention[] = [];
  for (const line of lines) {
    const range = /(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})\+?\s*(?:years?|yrs?)/i.exec(line);
    if (range) {
      out.push({ min: Number(range[1]), max: Number(range[2]), quote: line });
      continue;
    }
    const single = /(\d{1,2})\+?\s*(?:years?|yrs?)(?!\s*old)/i.exec(line);
    if (single && /experience|exp\b|background|working|industry|professional/i.test(line)) {
      out.push({ min: Number(single[1]), max: null, quote: line });
      continue;
    }
    const months = /(\d{1,2})\+?\s*months?/i.exec(line);
    if (months && /experience|exp\b/i.test(line)) out.push({ min: Math.round((Number(months[1]) / 12) * 10) / 10, max: null, quote: line });
  }
  return out.filter((y) => y.min <= 30);
}

export function extractRequirements(title: string, description: string, location: string | null = null): JobRequirements {
  const lines = splitLines(description);
  const conflicts: IntegrityFlag[] = [];
  let zone: Zone = "none";
  let structured = false;

  const bySkill = new Map<string, Requirement>();
  const others: Requirement[] = [];
  const yearLines: string[] = [];
  let degree: string | null = null;

  for (const raw of lines) {
    const heading = zoneOfHeading(raw);
    if (heading) {
      zone = heading;
      if (heading === "must" || heading === "nice") structured = true;
      continue;
    }
    const line = raw.replace(/^[•●▪*\-–—\s]+/, "").trim();
    if (!line || zone === "about") continue;

    const importance: "must" | "nice" =
      zone === "nice" || NICE_CUE.test(line) ? "nice" : zone === "must" || MUST_CUE.test(line) ? "must" : "nice";

    if (zone !== "duties" || /\d\+?\s*(years?|yrs?|months?)/i.test(line)) yearLines.push(line);

    const deg = /\b(bachelor'?s?|b\.?tech|b\.?e\.?|b\.?sc|master'?s?|m\.?tech|mba|ph\.?d|degree in [a-z ,/&]+)\b/i.exec(line);
    if (deg && !degree) degree = truncate(line, 160);

    const hits = findSkills(line);
    const seen = new Set<string>();
    for (const hit of hits) {
      if (seen.has(hit.skillId)) continue;
      seen.add(hit.skillId);
      const existing = bySkill.get(hit.skillId);
      if (!existing) {
        bySkill.set(hit.skillId, {
          id: `skill:${hit.skillId}`,
          kind: "skill",
          skillId: hit.skillId,
          label: skillById(hit.skillId)?.name ?? hit.skillId,
          importance,
          quote: truncate(line, 240),
        });
      } else if (existing.importance === "nice" && importance === "must") {
        existing.importance = "must";
        existing.quote = truncate(line, 240);
      }
    }
    // Requirement lines with no recognisable skill are kept, labelled as unverifiable, rather than dropped.
    if (hits.length === 0 && (zone === "must" || zone === "nice") && line.length > 20 && line.length < 260 && !deg) {
      others.push({ id: `other:${others.length + 1}`, kind: "other", label: truncate(line, 140), importance, quote: truncate(line, 240) });
    }
  }

  const mentions = yearMentions(yearLines);
  const mins = mentions.map((m) => m.min);
  const minYears = mins.length ? Math.min(...mins) : null;
  const maxCandidates = mentions.map((m) => m.max).filter((x): x is number => x !== null);
  const maxYears = maxCandidates.length ? Math.max(...maxCandidates) : null;
  if (mins.length > 1 && Math.max(...mins) - Math.min(...mins) >= 3) {
    conflicts.push({
      code: "experience_inconsistent",
      detail: `The posting states different experience requirements (${[...new Set(mins)].sort((a, b) => a - b).join(" and ")}+ years). The lower figure is used; confirm with the employer.`,
    });
  }

  const level = inferLevel(title, description);
  if ((level === "intern" || level === "entry") && minYears !== null && minYears >= 3) {
    conflicts.push({
      code: "level_experience_conflict",
      detail: `The title or text presents this as ${level === "intern" ? "an internship" : "an entry-level role"}, but it also asks for ${minYears}+ years of experience.`,
    });
  }
  const wm = inferWorkMode(location, description);
  if (wm.conflict) conflicts.push({ code: "work_mode_conflict", detail: "The posting describes the role as both remote and on-site. Confirm the working arrangement before applying." });

  const requirements = [...bySkill.values(), ...others.slice(0, 8)];
  return { requirements, minYears, maxYears, level, workMode: wm.mode, degree, conflicts, structured };
}
