import type { Metadata } from "next";
import Link from "next/link";
import { DemoBadge, Badge, Button, Card, EmptyState, Field, Input, Notice, PageHeader, Select } from "@/components/ui";
import { FitBadge, FreshnessBadge, levelLabel, modeLabel, SalaryText } from "@/components/job-bits";
import { requireUser } from "@/lib/auth/server";
import { searchJobs, sourceStats } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Jobs" };

type SP = { q?: string; level?: string; workMode?: string; location?: string; fresh?: string; clean?: string };

export default async function JobsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = { q: sp.q, level: sp.level, workMode: sp.workMode, location: sp.location, freshOnly: sp.fresh === "on", hideFlagged: sp.clean === "on" };
  const [{ jobs, total, personalized }, stats] = await Promise.all([searchJobs(filters, user.id), sourceStats()]);
  const synthetic = stats.sources.filter((s) => s.enabled && s.isSynthetic).length;
  const live = stats.sources.filter((s) => s.enabled && !s.isSynthetic).length;

  return (
    <>
      <PageHeader title="Jobs" lead="Open roles from employers' own job boards. Search is free, and applying always happens on the employer's site." />

      <form method="get" role="search" aria-label="Search jobs" className="mb-5 rounded-card border border-line bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
          <Field label="Role, skill or company" htmlFor="q">
            <Input id="q" name="q" type="search" defaultValue={sp.q ?? ""} placeholder="e.g. backend engineer, SQL" maxLength={200} />
          </Field>
          <Field label="Location" htmlFor="location">
            <Input id="location" name="location" defaultValue={sp.location ?? ""} placeholder="e.g. Pune" maxLength={80} />
          </Field>
          <Field label="Level" htmlFor="level">
            <Select id="level" name="level" defaultValue={sp.level ?? "any"}>
              <option value="any">Any level</option>
              <option value="intern">Internship</option>
              <option value="entry">Entry level</option>
              <option value="mid">Mid level</option>
              <option value="senior">Senior</option>
            </Select>
          </Field>
          <Field label="Work mode" htmlFor="workMode">
            <Select id="workMode" name="workMode" defaultValue={sp.workMode ?? "any"}>
              <option value="any">Any</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
              <option value="onsite">On-site</option>
            </Select>
          </Field>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="fresh" defaultChecked={sp.fresh === "on"} className="h-5 w-5 accent-accent" /> Posted in the last 3 weeks
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input type="checkbox" name="clean" defaultChecked={sp.clean === "on"} className="h-5 w-5 accent-accent" /> Hide listings with integrity warnings
          </label>
          <Button type="submit" className="ml-auto">Search</Button>
        </div>
      </form>

      <p className="mb-4 text-sm text-muted" role="status">
        {total} open {total === 1 ? "role" : "roles"}
        {total > jobs.length ? `, showing the top ${jobs.length}` : ""}. {stats.duplicates} duplicate {stats.duplicates === 1 ? "repost is" : "reposts are"} hidden. Sources: {live} employer {live === 1 ? "board" : "boards"}
        {synthetic ? " and the synthetic demo board" : ""}. {personalized ? "Ranked using your resume evidence, freshness and preferences." : "Ranked by relevance and freshness."}
      </p>
      {!personalized ? (
        <Notice tone="info" className="mb-4">
          <Link href="/app/resume" className="font-semibold underline underline-offset-4">Add your resume</Link> to see an evidence-based fit for every role.
        </Notice>
      ) : null}

      {jobs.length === 0 ? (
        <EmptyState title="No roles match">Try fewer filters or a broader search term. If no sources have been synced yet, run the job sync (see the deployment guide).</EmptyState>
      ) : (
        <ul className="space-y-3">
          {jobs.map((j) => (
            <li key={j.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="font-sans text-lg font-semibold">
                      <Link href={`/app/jobs/${j.id}`} className="underline-offset-4 hover:underline">{j.title}</Link>
                    </h2>
                    <p className="text-sm text-muted">
                      {j.companyName} · {j.location ?? "Location not stated"} · {levelLabel(j.level)} · {modeLabel(j.workMode)}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {j.match ? <FitBadge match={j.match} /> : null}
                    <FreshnessBadge f={j.freshness} />
                    {j.isSynthetic ? <DemoBadge /> : null}
                    {j.flags.length > 0 ? <Badge tone="warn">{j.flags.length} warning{j.flags.length > 1 ? "s" : ""}</Badge> : null}
                  </div>
                </div>
                <p className="mt-2 text-sm"><SalaryText salary={j.salary} status={j.salaryStatus} /></p>
                {j.why.length > 0 ? (
                  <p className="mt-2 text-sm text-muted">
                    <span className="font-semibold text-ink">Why it is here: </span>
                    {j.why.join(" · ")}
                  </p>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
