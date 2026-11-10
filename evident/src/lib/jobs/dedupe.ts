import { sha256, words } from "../text";

const COMPANY_NOISE = /\b(inc|llc|ltd|limited|pvt|private|corp|corporation|co|company|gmbh|plc|technologies|technology|labs|group|holdings|india|global)\b\.?/g;

export function normalizeCompany(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9 ]+/g, " ").replace(COMPANY_NOISE, " ").replace(/\s+/g, " ").trim();
}

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(sr)\b\.?/g, "senior")
    .replace(/\b(jr)\b\.?/g, "junior")
    .replace(/\b(swe|sde)\b/g, "software engineer")
    .replace(/\b(m\/f\/d|f\/m\/d|remote|hybrid|on-?site|urgent(ly)?|hiring|immediate joiners?|\d{4} batch|req(uisition)? ?#?\d+)\b/g, " ")
    .replace(/[^a-z0-9+# ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeLocation(loc: string | null | undefined): string {
  if (!loc) return "";
  return loc
    .toLowerCase()
    .replace(/\bbangalore\b/g, "bengaluru")
    .replace(/\bgurgaon\b/g, "gurugram")
    .replace(/\bbombay\b/g, "mumbai")
    .replace(/\b(india|usa|united states|us|uk|united kingdom)\b/g, " ")
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Listings with the same key are the same opening reposted, whatever board they came from. */
export function dedupeKey(company: string, title: string, location: string | null | undefined): string {
  return sha256(`${normalizeCompany(company)}|${normalizeTitle(title)}|${normalizeLocation(location)}`).slice(0, 24);
}

export function contentHash(description: string): string {
  return sha256(words(description).join(" "));
}

function shingles(text: string, k = 3): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(" "));
  return out;
}

export function similarity(a: string, b: string): number {
  const sa = shingles(a);
  const sb = shingles(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export interface DedupeCandidate {
  id: string;
  companyName: string;
  title: string;
  location: string | null;
  description: string;
  firstSeenAt: Date;
  /** Lower is more authoritative (an employer's own ATS beats an aggregator). */
  sourcePriority: number;
}

/**
 * Group duplicate listings. Two listings are duplicates when their dedupe keys match, or when
 * company and title match and the descriptions are near-identical (location-variant reposts).
 * Returns a map from each duplicate's id to its canonical listing's id.
 */
export function findDuplicates(jobs: DedupeCandidate[], threshold = 0.82): Map<string, string> {
  const result = new Map<string, string>();
  const groups = new Map<string, DedupeCandidate[]>();
  for (const j of jobs) {
    const k = `${normalizeCompany(j.companyName)}|${normalizeTitle(j.title)}`;
    groups.set(k, [...(groups.get(k) ?? []), j]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.sourcePriority - b.sourcePriority || a.firstSeenAt.getTime() - b.firstSeenAt.getTime() || a.id.localeCompare(b.id));
    const canon: DedupeCandidate[] = [];
    for (const j of sorted) {
      const match = canon.find(
        (c) => normalizeLocation(c.location) === normalizeLocation(j.location) && (contentHash(c.description) === contentHash(j.description) || similarity(c.description, j.description) >= threshold),
      );
      if (match) result.set(j.id, match.id);
      else canon.push(j);
    }
  }
  return result;
}
