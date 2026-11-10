import { Prisma } from "@prisma/client";
import { db, json } from "../db";
import { freshness, type Freshness } from "../jobs/freshness";
import type { JobRequirements } from "../jobs/requirements";
import type { IntegrityFlag } from "../jobs/sanitize";
import { matchResumeToJob, type MatchResult } from "../match/score";
import type { ParsedResume } from "../resume/parse";
import { normalizeLocation } from "../jobs/dedupe";

export interface JobFilters {
  q?: string;
  level?: string;
  workMode?: string;
  location?: string;
  freshOnly?: boolean;
  hideFlagged?: boolean;
}

export interface JobCard {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: string;
  level: string;
  employmentType: string | null;
  salary: { min: number; max: number; currency: string; period: string } | null;
  salaryStatus: string;
  isSynthetic: boolean;
  sourceKind: string;
  sourceName: string;
  freshness: Freshness;
  flags: IntegrityFlag[];
  match: { score: number; verdict: MatchResult["verdict"]; confidence: MatchResult["confidence"] } | null;
  /** Plain-language reasons this listing is ranked where it is. */
  why: string[];
  rank: number;
}

interface Row {
  id: string;
  title: string;
  companyName: string;
  location: string | null;
  workMode: string;
  level: string;
  employmentType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  salaryStatus: string;
  isSynthetic: boolean;
  postedAt: Date | null;
  firstSeenAt: Date;
  lastVerifiedAt: Date | null;
  verifyStatus: string | null;
  status: string;
  requirements: unknown;
  integrityFlags: unknown;
  sourceKind: string;
  sourceName: string;
  textRank: number;
}

export interface UserContext {
  resume: ParsedResume | null;
  targetRoles: string[];
  locations: string[];
  remoteOk: boolean;
}

export async function loadUserContext(userId: string): Promise<UserContext> {
  const profile = await db.profile.findUnique({ where: { userId } });
  const resumeRow = profile?.activeResumeId
    ? await db.resume.findFirst({ where: { id: profile.activeResumeId, userId } })
    : await db.resume.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  return {
    resume: resumeRow && resumeRow.status !== "failed" ? (resumeRow.parsed as unknown as ParsedResume) : null,
    targetRoles: profile?.targetRoles ?? [],
    locations: profile?.locations ?? [],
    remoteOk: profile?.remoteOk ?? true,
  };
}

/**
 * Ranking blends four signals, each reported back to the user:
 *   text relevance (PostgreSQL full-text rank), evidence fit (resume vs requirements),
 *   freshness, and stated preferences. Listings with integrity flags are demoted, not hidden.
 */
export function rankJob(row: Pick<Row, "title" | "location" | "workMode" | "textRank" | "integrityFlags">, fresh: Freshness, match: MatchResult | null, ctx: UserContext | null, hasQuery: boolean, maxTextRank: number): { rank: number; why: string[] } {
  const why: string[] = [];
  const text = hasQuery && maxTextRank > 0 ? row.textRank / maxTextRank : 0;
  let score = 0;
  if (hasQuery) {
    score += 0.4 * text;
    if (text > 0.6) why.push("Closely matches your search");
  }
  if (match && match.verdict !== "unknown") {
    score += (hasQuery ? 0.3 : 0.55) * (match.score / 100);
    if (match.verdict === "apply") why.push(`Your resume shows evidence for ${match.strengths.length} of its requirements`);
    else if (match.verdict === "stretch") why.push("Partial fit: some must-haves have no evidence on your resume");
  }
  score += (hasQuery ? 0.15 : 0.25) * fresh.weight;
  if (fresh.state === "fresh") why.push(fresh.label);
  if (fresh.state === "stale") why.push("Older listing: may already be filled");

  if (ctx) {
    const title = row.title.toLowerCase();
    const role = ctx.targetRoles.find((r) => r.trim() && r.toLowerCase().split(/\s+/).every((w) => title.includes(w)));
    if (role) {
      score += 0.12;
      why.push(`Matches your target role "${role}"`);
    }
    const loc = normalizeLocation(row.location);
    const place = ctx.locations.find((l) => l.trim() && loc.includes(normalizeLocation(l)));
    if (place) {
      score += 0.06;
      why.push(`In ${place}`);
    } else if (ctx.remoteOk && row.workMode === "remote") {
      score += 0.04;
      why.push("Remote");
    }
  }
  const flags = (row.integrityFlags as IntegrityFlag[]) ?? [];
  const serious = flags.filter((f) => ["prompt_injection", "hidden_text", "contact_details_in_description", "level_experience_conflict", "work_mode_conflict"].includes(f.code)).length;
  if (serious > 0) {
    score *= 0.6;
    why.push(`Ranked lower: ${serious} integrity warning${serious > 1 ? "s" : ""}`);
  }
  return { rank: Math.round(score * 1000) / 1000, why: why.slice(0, 4) };
}

export async function searchJobs(filters: JobFilters, userId: string | null, opts: { now?: Date; limit?: number } = {}): Promise<{ jobs: JobCard[]; total: number; personalized: boolean }> {
  const now = opts.now ?? new Date();
  const q = (filters.q ?? "").trim().slice(0, 200);
  const hasQuery = q.length > 0;
  const conds: Prisma.Sql[] = [Prisma.sql`j."status" = 'open'`, Prisma.sql`j."duplicateOfId" IS NULL`];
  if (hasQuery) conds.push(Prisma.sql`j."searchVector" @@ websearch_to_tsquery('english', ${q})`);
  if (filters.level && filters.level !== "any") conds.push(Prisma.sql`j."level" = ${filters.level}`);
  if (filters.workMode && filters.workMode !== "any") conds.push(Prisma.sql`j."workMode" = ${filters.workMode}`);
  if (filters.location?.trim()) conds.push(Prisma.sql`j."location" ILIKE ${"%" + filters.location.trim().replace(/[%_\\]/g, "\\$&") + "%"}`);
  if (filters.freshOnly) conds.push(Prisma.sql`COALESCE(j."postedAt", j."firstSeenAt") >= ${new Date(now.getTime() - 21 * 86_400_000)}`);
  if (filters.hideFlagged) conds.push(Prisma.sql`j."integrityFlags" = '[]'::jsonb`);

  const rank = hasQuery ? Prisma.sql`ts_rank_cd(j."searchVector", websearch_to_tsquery('english', ${q}))` : Prisma.sql`0`;
  const rows = await db.$queryRaw<Row[]>(Prisma.sql`
    SELECT j."id", j."title", j."companyName", j."location", j."workMode", j."level", j."employmentType",
           j."salaryMin", j."salaryMax", j."salaryCurrency", j."salaryPeriod", j."salaryStatus", j."isSynthetic",
           j."postedAt", j."firstSeenAt", j."lastVerifiedAt", j."verifyStatus", j."status", j."requirements", j."integrityFlags",
           s."kind" AS "sourceKind", s."name" AS "sourceName", ${rank}::float8 AS "textRank"
    FROM "Job" j JOIN "Source" s ON s."id" = j."sourceId"
    WHERE ${Prisma.join(conds, " AND ")}
    ORDER BY "textRank" DESC, COALESCE(j."postedAt", j."firstSeenAt") DESC
    LIMIT 300`);

  const ctx = userId ? await loadUserContext(userId) : null;
  const maxText = Math.max(0, ...rows.map((r) => r.textRank));
  const cards: JobCard[] = rows.map((r) => {
    const fresh = freshness(r, now);
    const match = ctx?.resume ? matchResumeToJob(ctx.resume, r.requirements as JobRequirements) : null;
    const { rank: score, why } = rankJob(r, fresh, match, ctx, hasQuery, maxText);
    return {
      id: r.id,
      title: r.title,
      companyName: r.companyName,
      location: r.location,
      workMode: r.workMode,
      level: r.level,
      employmentType: r.employmentType,
      salary: r.salaryStatus === "employer_stated" && r.salaryMin !== null && r.salaryMax !== null ? { min: r.salaryMin, max: r.salaryMax, currency: r.salaryCurrency ?? "", period: r.salaryPeriod ?? "year" } : null,
      salaryStatus: r.salaryStatus,
      isSynthetic: r.isSynthetic,
      sourceKind: r.sourceKind,
      sourceName: r.sourceName,
      freshness: fresh,
      flags: (r.integrityFlags as IntegrityFlag[]) ?? [],
      match: match ? { score: match.score, verdict: match.verdict, confidence: match.confidence } : null,
      why,
      rank: score,
    };
  });
  cards.sort((a, b) => b.rank - a.rank || a.freshness.ageDays - b.freshness.ageDays);
  return { jobs: cards.slice(0, opts.limit ?? 60), total: cards.length, personalized: Boolean(ctx?.resume) };
}

export async function getJob(id: string) {
  return db.job.findUnique({ where: { id }, include: { source: true } });
}

/** Compute and store the evidence match for one job. Returns null when the user has no usable resume. */
export async function evaluateFit(userId: string, jobId: string): Promise<{ match: MatchResult; resumeId: string } | null> {
  const profile = await db.profile.findUnique({ where: { userId } });
  const resume = profile?.activeResumeId
    ? await db.resume.findFirst({ where: { id: profile.activeResumeId, userId } })
    : await db.resume.findFirst({ where: { userId }, orderBy: { createdAt: "desc" } });
  if (!resume) return null;
  const job = await db.job.findUnique({ where: { id: jobId }, select: { requirements: true } });
  if (!job) return null;
  const match = matchResumeToJob(resume.parsed as unknown as ParsedResume, job.requirements as unknown as JobRequirements);
  await db.jobMatch.upsert({
    where: { userId_jobId_resumeId: { userId, jobId, resumeId: resume.id } },
    create: { userId, jobId, resumeId: resume.id, score: match.score, verdict: match.verdict, confidence: match.confidence, breakdown: json(match) },
    update: { score: match.score, verdict: match.verdict, confidence: match.confidence, breakdown: json(match), computedAt: new Date() },
  });
  return { match, resumeId: resume.id };
}

export async function sourceStats() {
  const [sources, open, duplicates, verifiedRecently] = await Promise.all([
    db.source.findMany({ orderBy: { name: "asc" } }),
    db.job.count({ where: { status: "open", duplicateOfId: null } }),
    db.job.count({ where: { status: "open", duplicateOfId: { not: null } } }),
    db.job.count({ where: { status: "open", duplicateOfId: null, lastVerifiedAt: { gte: new Date(Date.now() - 72 * 3_600_000) } } }),
  ]);
  return { sources, open, duplicates, verifiedRecently };
}
