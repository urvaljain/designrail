import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/auth/core";
import { clientKey, getUser } from "@/lib/auth/server";
import { searchJobs } from "@/lib/services/jobs";

export const dynamic = "force-dynamic";

const Query = z.object({
  q: z.string().max(200).optional(),
  level: z.enum(["any", "intern", "entry", "mid", "senior"]).optional(),
  workMode: z.enum(["any", "remote", "hybrid", "onsite"]).optional(),
  location: z.string().max(80).optional(),
  fresh: z.enum(["true", "false"]).optional(),
});

/** Public, read-only job search. Signed-in callers also get their evidence-based fit per listing. */
export async function GET(req: Request) {
  if (!(await rateLimit(`api:jobs:${await clientKey()}`, 120, 60))) return NextResponse.json({ error: "rate_limited" }, { status: 429, headers: { "retry-after": "60" } });
  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "invalid_query", issues: parsed.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })) }, { status: 400 });
  const user = await getUser();
  const { q, level, workMode, location, fresh } = parsed.data;
  const result = await searchJobs({ q, level, workMode, location, freshOnly: fresh === "true" }, user?.id ?? null, { limit: 50 });
  return NextResponse.json({
    total: result.total,
    personalized: result.personalized,
    jobs: result.jobs.map((j) => ({ id: j.id, title: j.title, company: j.companyName, location: j.location, level: j.level, workMode: j.workMode, salary: j.salary, salaryStatus: j.salaryStatus, synthetic: j.isSynthetic, source: j.sourceKind, freshness: { state: j.freshness.state, label: j.freshness.label, basis: j.freshness.basis, verified: j.freshness.verifiedLabel }, integrityFlags: j.flags.map((f) => f.code), match: j.match, why: j.why })),
  });
}
