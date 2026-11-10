import { z } from "zod";
import type { WorkMode } from "../jobs/requirements";
import { DEMO_JOBS } from "./demo-jobs";

/** A posting exactly as a source gave it. Nothing here is trusted yet. */
export interface RawJob {
  externalId: string;
  title: string;
  companyName: string;
  location: string | null;
  descriptionRaw: string;
  applyUrl: string;
  postedAt: Date | null;
  employmentType?: string | null;
  workMode?: WorkMode;
  salary?: { min: number | null; max: number | null; currency: string | null; period: string | null } | null;
}

export class SourceError extends Error {
  constructor(
    message: string,
    public retryable: boolean,
  ) {
    super(message);
    this.name = "SourceError";
  }
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const SOURCE_KINDS = ["greenhouse", "lever", "ashby", "demo"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

const UA = "EvidentJobSync/0.1 (public job-board API client)";

async function getJson(url: string, fetchImpl: FetchLike): Promise<unknown> {
  let res: Response;
  try {
    res = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": UA }, signal: AbortSignal.timeout(20_000) });
  } catch (err) {
    throw new SourceError(`network error: ${err instanceof Error ? err.message : String(err)}`, true);
  }
  if (res.status === 404) throw new SourceError("board not found (404)", false);
  if (res.status === 429 || res.status >= 500) throw new SourceError(`source returned ${res.status}`, true);
  if (!res.ok) throw new SourceError(`source returned ${res.status}`, false);
  try {
    return await res.json();
  } catch {
    throw new SourceError("source returned invalid JSON", true);
  }
}

function date(v: unknown): Date | null {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function titleCase(slug: string): string {
  return slug.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Entries that fail validation are skipped and counted, never guessed at. */
function parseEach<T>(items: unknown[], schema: z.ZodType<T>): { ok: T[]; skipped: number } {
  const ok: T[] = [];
  let skipped = 0;
  for (const item of items) {
    const r = schema.safeParse(item);
    if (r.success) ok.push(r.data);
    else skipped++;
  }
  return { ok, skipped };
}

export interface FetchResult {
  jobs: RawJob[];
  skipped: number;
}

// ── Greenhouse job board API (public, unauthenticated, documented for this use) ──
const GreenhouseJob = z.object({
  id: z.union([z.number(), z.string()]),
  title: z.string().min(1),
  absolute_url: z.string().min(1),
  content: z.string().optional().default(""),
  location: z.object({ name: z.string().nullish() }).nullish(),
  updated_at: z.string().nullish(),
  first_published: z.string().nullish(),
});

async function greenhouse(slug: string, name: string | null, fetchImpl: FetchLike): Promise<FetchResult> {
  const base = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}`;
  const body = z.object({ jobs: z.array(z.unknown()) }).safeParse(await getJson(`${base}/jobs?content=true`, fetchImpl));
  if (!body.success) throw new SourceError("unexpected response shape", false);
  let company = name;
  if (!company) {
    try {
      const board = z.object({ name: z.string().min(1) }).safeParse(await getJson(base, fetchImpl));
      company = board.success ? board.data.name : null;
    } catch {
      company = null;
    }
  }
  const { ok, skipped } = parseEach(body.data.jobs, GreenhouseJob);
  return {
    skipped,
    jobs: ok.map((j) => ({
      externalId: String(j.id),
      title: j.title,
      companyName: company ?? titleCase(slug),
      location: j.location?.name ?? null,
      descriptionRaw: j.content,
      applyUrl: j.absolute_url,
      // `updated_at` changes on any edit, so it is not a posting date. Only `first_published` is used.
      postedAt: date(j.first_published),
    })),
  };
}

// ── Lever postings API ──
const LeverJob = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  hostedUrl: z.string().min(1),
  applyUrl: z.string().nullish(),
  createdAt: z.number().nullish(),
  description: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  additional: z.string().nullish(),
  lists: z.array(z.object({ text: z.string().nullish(), content: z.string().nullish() })).nullish(),
  categories: z.object({ location: z.string().nullish(), commitment: z.string().nullish() }).nullish(),
  workplaceType: z.string().nullish(),
  salaryRange: z.object({ min: z.number().nullish(), max: z.number().nullish(), currency: z.string().nullish(), interval: z.string().nullish() }).nullish(),
});

async function lever(slug: string, name: string | null, fetchImpl: FetchLike): Promise<FetchResult> {
  const data = z.array(z.unknown()).safeParse(await getJson(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`, fetchImpl));
  if (!data.success) throw new SourceError("unexpected response shape", false);
  const { ok, skipped } = parseEach(data.data, LeverJob);
  return {
    skipped,
    jobs: ok.map((j) => {
      const lists = (j.lists ?? []).map((l) => `<h3>${l.text ?? ""}</h3><ul>${l.content ?? ""}</ul>`).join("\n");
      const wt = (j.workplaceType ?? "").toLowerCase();
      return {
        externalId: j.id,
        title: j.text,
        companyName: name ?? titleCase(slug),
        location: j.categories?.location ?? null,
        descriptionRaw: [j.description ?? j.descriptionPlain ?? "", lists, j.additional ?? ""].join("\n"),
        applyUrl: j.hostedUrl,
        postedAt: date(j.createdAt),
        employmentType: j.categories?.commitment ?? null,
        workMode: wt === "remote" ? "remote" : wt === "hybrid" ? "hybrid" : wt === "on-site" || wt === "onsite" ? "onsite" : undefined,
        salary: j.salaryRange ? { min: j.salaryRange.min ?? null, max: j.salaryRange.max ?? null, currency: j.salaryRange.currency ?? null, period: j.salaryRange.interval ?? null } : null,
      };
    }),
  };
}

// ── Ashby public job posting API ──
const AshbyJob = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  jobUrl: z.string().min(1),
  location: z.string().nullish(),
  employmentType: z.string().nullish(),
  isRemote: z.boolean().nullish(),
  isListed: z.boolean().nullish(),
  descriptionHtml: z.string().nullish(),
  descriptionPlain: z.string().nullish(),
  publishedAt: z.string().nullish(),
  compensation: z
    .object({ summaryComponents: z.array(z.object({ compensationType: z.string().nullish(), interval: z.string().nullish(), currencyCode: z.string().nullish(), minValue: z.number().nullish(), maxValue: z.number().nullish() })).nullish() })
    .nullish(),
});

async function ashby(slug: string, name: string | null, fetchImpl: FetchLike): Promise<FetchResult> {
  const body = z.object({ jobs: z.array(z.unknown()) }).safeParse(await getJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`, fetchImpl));
  if (!body.success) throw new SourceError("unexpected response shape", false);
  const { ok, skipped } = parseEach(body.data.jobs, AshbyJob);
  return {
    skipped,
    jobs: ok
      .filter((j) => j.isListed !== false)
      .map((j) => {
        const pay = (j.compensation?.summaryComponents ?? []).find((c) => (c.compensationType ?? "").toLowerCase() === "salary");
        return {
          externalId: j.id,
          title: j.title,
          companyName: name ?? titleCase(slug),
          location: j.location ?? null,
          descriptionRaw: j.descriptionHtml ?? j.descriptionPlain ?? "",
          applyUrl: j.jobUrl,
          postedAt: date(j.publishedAt),
          employmentType: j.employmentType ?? null,
          workMode: j.isRemote ? "remote" : undefined,
          salary: pay ? { min: pay.minValue ?? null, max: pay.maxValue ?? null, currency: pay.currencyCode ?? null, period: pay.interval ?? null } : null,
        };
      }),
  };
}

// ── Synthetic demo board: fictional companies, clearly labelled everywhere it is shown ──
function demo(now: Date): FetchResult {
  return {
    skipped: 0,
    jobs: DEMO_JOBS.map((j) => ({
      externalId: j.id,
      title: j.title,
      companyName: j.company,
      location: j.location,
      descriptionRaw: j.description,
      applyUrl: `https://example.com/demo-careers/${j.id}`,
      postedAt: j.postedDaysAgo === null ? null : new Date(now.getTime() - j.postedDaysAgo * 86_400_000),
      employmentType: j.employmentType ?? null,
      salary: j.salary ?? null,
    })),
  };
}

export async function fetchSource(kind: SourceKind, slug: string, name: string | null, opts: { fetchImpl?: FetchLike; now?: Date } = {}): Promise<FetchResult> {
  const f = opts.fetchImpl ?? (fetch as FetchLike);
  switch (kind) {
    case "greenhouse":
      return greenhouse(slug, name, f);
    case "lever":
      return lever(slug, name, f);
    case "ashby":
      return ashby(slug, name, f);
    case "demo":
      return demo(opts.now ?? new Date());
  }
}

/** Parse JOB_SOURCES ("greenhouse:acme:Acme Inc,lever:globex"). Invalid entries are reported, not ignored silently. */
export function parseSourceConfig(value: string | undefined): { sources: { kind: SourceKind; slug: string; name: string | null }[]; errors: string[] } {
  const sources: { kind: SourceKind; slug: string; name: string | null }[] = [];
  const errors: string[] = [];
  for (const entry of (value ?? "").split(",").map((s) => s.trim()).filter(Boolean)) {
    const [kind, slug, ...rest] = entry.split(":");
    if (!kind || !slug || !(SOURCE_KINDS as readonly string[]).includes(kind) || kind === "demo" || !/^[a-zA-Z0-9._-]+$/.test(slug)) {
      errors.push(`invalid source entry "${entry}"`);
      continue;
    }
    sources.push({ kind: kind as SourceKind, slug, name: rest.length ? rest.join(":").trim() : null });
  }
  return { sources, errors };
}
