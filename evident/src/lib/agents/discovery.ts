import { z } from "zod";
import { db, json } from "../db";
import { contentHash, dedupeKey, findDuplicates, normalizeCompany } from "../jobs/dedupe";
import { extractRequirements, type JobRequirements, type WorkMode } from "../jobs/requirements";
import { fromStructured, parseSalaryText, type SalaryResult } from "../jobs/salary";
import { cleanDescription, type IntegrityFlag } from "../jobs/sanitize";
import { fetchSource, SOURCE_KINDS, SourceError, type FetchLike, type RawJob, type SourceKind } from "../sources/connectors";
import { runAgent, tool, type AgentOutcome } from "./runtime";

export interface NormalizedJob {
  externalId: string;
  companyName: string;
  title: string;
  location: string | null;
  workMode: WorkMode;
  employmentType: string | null;
  level: string;
  description: string;
  requirements: JobRequirements;
  applyUrl: string;
  salary: SalaryResult;
  postedAt: Date | null;
  contentHash: string;
  dedupeKey: string;
  integrityFlags: IntegrityFlag[];
}

/** Pure normalisation of one raw posting. Returns a reason instead of a job when it must be dropped. */
export function normalizeJob(raw: RawJob, now: Date): { job: NormalizedJob } | { dropped: string } {
  const title = raw.title.trim().slice(0, 200);
  const companyName = raw.companyName.trim().slice(0, 120);
  if (!title || !companyName) return { dropped: "missing title or company" };

  let url: URL;
  try {
    url = new URL(raw.applyUrl);
  } catch {
    return { dropped: "invalid apply URL" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return { dropped: "apply URL is not a web link" };

  const clean = cleanDescription(raw.descriptionRaw ?? "");
  const flags: IntegrityFlag[] = [...clean.flags];
  if (url.protocol === "http:") flags.push({ code: "apply_link_not_https", detail: "The application link is not encrypted (http)." });

  // Requirements are extracted from the neutralised text, so injected instructions never become "requirements".
  const requirements = extractRequirements(title, clean.modelText, raw.location);
  flags.push(...requirements.conflicts);

  let salary: SalaryResult = raw.salary ? fromStructured(raw.salary.min, raw.salary.max, raw.salary.currency, raw.salary.period) : { status: "not_disclosed" };
  if (salary.status === "not_disclosed") salary = parseSalaryText(clean.text);
  if (salary.status === "rejected_implausible") flags.push({ code: "salary_implausible", detail: `The stated pay ("${salary.raw}") failed a plausibility check (${salary.reason}) and is not shown.` });

  // A posting date in the future or absurdly old is a data error; treat it as unknown.
  let postedAt = raw.postedAt;
  if (postedAt && (postedAt.getTime() > now.getTime() + 86_400_000 || postedAt.getTime() < now.getTime() - 3 * 365 * 86_400_000)) postedAt = null;

  return {
    job: {
      externalId: raw.externalId,
      companyName,
      title,
      location: raw.location?.trim().slice(0, 160) || null,
      workMode: raw.workMode ?? requirements.workMode,
      employmentType: raw.employmentType?.trim().slice(0, 60) || null,
      level: requirements.level,
      description: clean.text.slice(0, 40_000),
      requirements,
      applyUrl: url.toString(),
      salary,
      postedAt,
      contentHash: contentHash(clean.text),
      dedupeKey: dedupeKey(companyName, title, raw.location),
      integrityFlags: flags,
    },
  };
}

export interface SyncReport {
  sourceId: string;
  fetched: number;
  skippedMalformed: number;
  dropped: number;
  created: number;
  updated: number;
  closed: number;
  duplicates: number;
  flagged: number;
  closeSkipped: boolean;
}

const SOURCE_PRIORITY: Record<string, number> = { greenhouse: 1, lever: 1, ashby: 1, demo: 1 };

/** Recompute duplicate links among open listings of the given companies. */
export async function relinkDuplicates(companyNames: string[]): Promise<number> {
  if (companyNames.length === 0) return 0;
  // Duplicates are matched on normalised company names ("Acme" and "Acme Pvt Ltd" are one employer),
  // so candidates are selected by normalised name across every source, not by exact spelling.
  const touched = new Set(companyNames.map(normalizeCompany));
  const light = await db.job.findMany({ where: { status: "open" }, select: { id: true, companyName: true } });
  const ids = light.filter((r) => touched.has(normalizeCompany(r.companyName))).map((r) => r.id);
  const rows = await db.job.findMany({
    where: { id: { in: ids } },
    select: { id: true, companyName: true, title: true, location: true, description: true, firstSeenAt: true, duplicateOfId: true, source: { select: { kind: true } } },
  });
  const dups = findDuplicates(rows.map((r) => ({ id: r.id, companyName: r.companyName, title: r.title, location: r.location, description: r.description, firstSeenAt: r.firstSeenAt, sourcePriority: SOURCE_PRIORITY[r.source.kind] ?? 2 })));
  let changed = 0;
  for (const r of rows) {
    const target = dups.get(r.id) ?? null;
    if (target !== r.duplicateOfId) {
      await db.job.update({ where: { id: r.id }, data: { duplicateOfId: target } });
      changed++;
    }
  }
  return dups.size;
}

/**
 * Job Discovery Agent, ingestion mode. Pulls one permitted source, normalises and verifies each
 * posting, closes postings the source no longer lists, and links duplicates.
 */
export async function syncSource(sourceId: string, opts: { fetchImpl?: FetchLike; now?: Date; trigger?: string; excludeExternalIds?: string[] } = {}): Promise<AgentOutcome<SyncReport>> {
  const now = opts.now ?? new Date();
  const source = await db.source.findUniqueOrThrow({ where: { id: sourceId } });

  const fetchTool = tool({
    name: "fetch_source",
    description: "Fetch current postings from a permitted public job-board API.",
    input: z.object({ kind: z.enum(SOURCE_KINDS), slug: z.string().min(1), name: z.string().nullable() }),
    run: async (i) => {
      const res = await fetchSource(i.kind as SourceKind, i.slug, i.name, { fetchImpl: opts.fetchImpl, now });
      return opts.excludeExternalIds ? { ...res, jobs: res.jobs.filter((j) => !opts.excludeExternalIds!.includes(j.externalId)) } : res;
    },
  });
  const upsertTool = tool({
    name: "upsert_jobs",
    description: "Write normalised postings. Existing rows are matched on (source, externalId).",
    input: z.object({ count: z.number().int().nonnegative() }),
    run: async () => {
      let created = 0;
      let updated = 0;
      for (const j of normalized) {
        const sal = j.salary.status === "employer_stated" ? j.salary.salary : null;
        const data = {
          companyName: j.companyName,
          title: j.title,
          location: j.location,
          workMode: j.workMode,
          employmentType: j.employmentType,
          level: j.level,
          description: j.description,
          requirements: json(j.requirements),
          applyUrl: j.applyUrl,
          salaryMin: sal?.min ?? null,
          salaryMax: sal?.max ?? null,
          salaryCurrency: sal?.currency ?? null,
          salaryPeriod: sal?.period ?? null,
          salaryStatus: j.salary.status,
          postedAt: j.postedAt,
          lastSeenAt: now,
          lastVerifiedAt: now,
          verifyStatus: "listed_by_source",
          status: "open",
          closedReason: null,
          contentHash: j.contentHash,
          dedupeKey: j.dedupeKey,
          integrityFlags: json(j.integrityFlags),
        };
        const existing = await db.job.findUnique({ where: { sourceId_externalId: { sourceId, externalId: j.externalId } }, select: { id: true } });
        if (existing) {
          await db.job.update({ where: { id: existing.id }, data });
          updated++;
        } else {
          await db.job.create({ data: { ...data, sourceId, externalId: j.externalId, firstSeenAt: now, isSynthetic: source.isSynthetic } });
          created++;
        }
      }
      return { created, updated };
    },
  });
  const closeTool = tool({
    name: "close_unlisted",
    description: "Mark postings the source no longer lists as closed.",
    input: z.object({ before: z.date() }),
    run: async (i) => {
      const res = await db.job.updateMany({ where: { sourceId, status: "open", lastSeenAt: { lt: i.before } }, data: { status: "closed", closedReason: "no_longer_listed" } });
      return { closed: res.count };
    },
  });
  const dedupeTool = tool({
    name: "link_duplicates",
    description: "Link reposted listings to one canonical listing.",
    input: z.object({ companies: z.array(z.string()) }),
    run: async (i) => ({ duplicates: await relinkDuplicates(i.companies) }),
  });

  let normalized: NormalizedJob[] = [];

  try {
    const outcome = await runAgent<SyncReport>({ agent: "job_discovery", userId: null, trigger: opts.trigger ?? "schedule", input: { sourceId, kind: source.kind, slug: source.slug } }, async (run) => {
      const fetched = await run.call(fetchTool, { kind: source.kind as SourceKind, slug: source.slug, name: source.name || null });

      let dropped = 0;
      const seen = new Set<string>();
      for (const raw of fetched.jobs) {
        if (seen.has(raw.externalId)) {
          dropped++;
          continue;
        }
        seen.add(raw.externalId);
        const n = normalizeJob(raw, now);
        if ("dropped" in n) dropped++;
        else normalized.push(n.job);
      }
      if (fetched.skipped > 0) run.note(`${fetched.skipped} posting(s) from the source failed validation and were skipped.`);
      if (dropped > 0) run.note(`${dropped} posting(s) were dropped during normalisation (duplicate ids, missing fields or invalid links).`);

      const { created, updated } = await run.call(upsertTool, { count: normalized.length });

      // An empty or sharply smaller response is more likely a source fault than a hiring freeze.
      const previouslyOpen = await db.job.count({ where: { sourceId, status: "open" } });
      const stillOpen = normalized.length;
      const closeSkipped = previouslyOpen > 5 && stillOpen < previouslyOpen * 0.3;
      let closed = 0;
      if (closeSkipped) {
        run.note(`The source returned ${stillOpen} postings against ${previouslyOpen} open ones. Closing was skipped because this looks like a source fault, not real closures.`);
        run.degraded = true;
      } else {
        closed = (await run.call(closeTool, { before: now })).closed;
      }

      const { duplicates } = await run.call(dedupeTool, { companies: [...new Set(normalized.map((j) => j.companyName))] });
      const flagged = normalized.filter((j) => j.integrityFlags.length > 0).length;
      return { sourceId, fetched: fetched.jobs.length, skippedMalformed: fetched.skipped, dropped, created, updated, closed, duplicates, flagged, closeSkipped };
    });
    await db.source.update({ where: { id: sourceId }, data: { lastSyncAt: now, lastSyncStatus: outcome.status, lastSyncError: null } });
    return outcome;
  } catch (err) {
    await db.source.update({ where: { id: sourceId }, data: { lastSyncAt: now, lastSyncStatus: "failed", lastSyncError: (err instanceof Error ? err.message : String(err)).slice(0, 500) } });
    throw err;
  } finally {
    normalized = [];
  }
}

export function isRetryable(err: unknown): boolean {
  return !(err instanceof SourceError) || err.retryable;
}

/**
 * Check that apply links still resolve. A hard 404/410 closes the listing; anything ambiguous
 * (timeouts, 403 bot walls, 5xx) is recorded as "could not be checked" and never closes it.
 */
export async function verifyApplyLinks(opts: { fetchImpl?: FetchLike; now?: Date; limit?: number } = {}): Promise<AgentOutcome<{ checked: number; ok: number; dead: number; unreachable: number }>> {
  const now = opts.now ?? new Date();
  const f = opts.fetchImpl ?? (fetch as FetchLike);
  const checkTool = tool({
    name: "check_link",
    description: "Request an application URL and report its HTTP status.",
    input: z.object({ url: z.string().url() }),
    run: async (i) => {
      try {
        const res = await f(i.url, { method: "GET", redirect: "follow", signal: AbortSignal.timeout(10_000), headers: { "user-agent": "EvidentLinkCheck/0.1" } });
        return { status: res.status };
      } catch {
        return { status: 0 };
      }
    },
  });
  return runAgent({ agent: "job_discovery", userId: null, trigger: "verify_links", input: { limit: opts.limit ?? 25 } }, async (run) => {
    const jobs = await db.job.findMany({ where: { status: "open", isSynthetic: false }, orderBy: { lastVerifiedAt: { sort: "asc", nulls: "first" } }, take: opts.limit ?? 25, select: { id: true, applyUrl: true } });
    let ok = 0;
    let dead = 0;
    let unreachable = 0;
    for (const j of jobs) {
      const { status } = await run.call(checkTool, { url: j.applyUrl });
      if (status === 404 || status === 410) {
        dead++;
        await db.job.update({ where: { id: j.id }, data: { status: "closed", closedReason: "apply_link_dead", verifyStatus: "link_dead", lastVerifiedAt: now } });
      } else if (status >= 200 && status < 400) {
        ok++;
        await db.job.update({ where: { id: j.id }, data: { verifyStatus: "link_ok", lastVerifiedAt: now } });
      } else {
        unreachable++;
        await db.job.update({ where: { id: j.id }, data: { verifyStatus: "link_unreachable" } });
      }
    }
    return { checked: jobs.length, ok, dead, unreachable };
  });
}
