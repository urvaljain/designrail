import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { markAppliedAction, saveJobAction, startInterviewAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { FreshnessBadge, levelLabel, modeLabel, SalaryText, SOURCE_LABEL } from "@/components/job-bits";
import { MatchView } from "@/components/match-view";
import { Badge, ButtonLink, Card, CardTitle, DemoBadge, FlashMessages, Notice } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { freshness } from "@/lib/jobs/freshness";
import type { IntegrityFlag } from "@/lib/jobs/sanitize";
import { evaluateFit, getJob } from "@/lib/services/jobs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const job = await getJob((await params).id);
  return { title: job ? `${job.title} at ${job.companyName}` : "Job" };
}

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { error, notice } = await searchParams;
  const job = await getJob(id);
  if (!job) notFound();
  const [fit, application, canonical] = await Promise.all([
    evaluateFit(user.id, job.id),
    db.application.findUnique({ where: { userId_jobId: { userId: user.id, jobId: job.id } }, select: { id: true, status: true } }),
    job.duplicateOfId ? db.job.findUnique({ where: { id: job.duplicateOfId }, select: { id: true, title: true } }) : null,
  ]);
  const f = freshness(job);
  const flags = (job.integrityFlags as unknown as IntegrityFlag[]) ?? [];
  const salary = job.salaryStatus === "employer_stated" && job.salaryMin !== null && job.salaryMax !== null ? { min: job.salaryMin, max: job.salaryMax, currency: job.salaryCurrency ?? "", period: job.salaryPeriod ?? "year" } : null;
  const closed = job.status === "closed";

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/app/jobs" className="text-accent-ink underline underline-offset-4">← All jobs</Link>
      </nav>
      <FlashMessages error={error} notice={notice} />

      <header className="mb-6">
        <div className="flex flex-wrap gap-2">
          <FreshnessBadge f={f} />
          {job.isSynthetic ? <DemoBadge /> : null}
          {application ? <Badge tone="accent">In your tracker: {application.status}</Badge> : null}
        </div>
        <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{job.title}</h1>
        <p className="mt-1 text-lg text-muted">
          {job.companyName} · {job.location ?? "Location not stated"}
        </p>
        <p className="mt-2 text-sm">
          {levelLabel(job.level)} · {modeLabel(job.workMode)}
          {job.employmentType ? ` · ${job.employmentType}` : ""} · <SalaryText salary={salary} status={job.salaryStatus} />
        </p>
      </header>

      {job.isSynthetic ? (
        <Notice tone="info" className="mb-5" title="This is demo data">
          The company and role are fictional and exist so you can explore the product. The application link goes to a placeholder page.
        </Notice>
      ) : null}
      {closed ? (
        <Notice tone="bad" className="mb-5" title="This listing has closed">
          {job.closedReason === "apply_link_dead" ? "Its application link no longer works." : "The source no longer lists it."} It is kept here so your tracker stays accurate.
        </Notice>
      ) : null}
      {canonical ? (
        <Notice tone="warn" className="mb-5" title="This is a repost">
          The same role is already listed. <Link className="font-semibold underline underline-offset-4" href={`/app/jobs/${canonical.id}`}>View the original listing</Link>.
        </Notice>
      ) : null}
      {flags.length > 0 ? (
        <Notice tone="warn" className="mb-5" title={`${flags.length} integrity ${flags.length === 1 ? "warning" : "warnings"} on this listing`}>
          <ul className="list-disc space-y-1 pl-5">
            {flags.map((fl) => (
              <li key={fl.code + fl.detail}>{fl.detail}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {!closed ? (
          <ButtonLink href={job.applyUrl} external>
            Apply on the employer&apos;s site
          </ButtonLink>
        ) : null}
        {!application ? (
          <form action={saveJobAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="secondary" pendingLabel="Saving…">Save to tracker</SubmitButton>
          </form>
        ) : (
          <ButtonLink href={`/app/applications/${application.id}`} variant="secondary">Open in tracker</ButtonLink>
        )}
        {!application || application.status === "saved" ? (
          <form action={markAppliedAction}>
            <input type="hidden" name="jobId" value={job.id} />
            <SubmitButton variant="secondary" pendingLabel="Updating…">I have applied</SubmitButton>
          </form>
        ) : null}
        <form action={startInterviewAction}>
          <input type="hidden" name="jobId" value={job.id} />
          <input type="hidden" name="length" value="5" />
          <SubmitButton variant="secondary" pendingLabel="Preparing questions…">Practise this interview</SubmitButton>
        </form>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-5">
          {fit ? (
            <MatchView match={fit.match} />
          ) : (
            <Card>
              <CardTitle>Your fit</CardTitle>
              <p className="mt-2 text-muted">
                Add your resume to see which of this role&apos;s requirements it supports, line by line. <Link href="/app/resume" className="font-semibold text-accent-ink underline underline-offset-4">Add resume</Link>
              </p>
            </Card>
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardTitle>Source and verification</CardTitle>
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="font-semibold">Source</dt><dd>{SOURCE_LABEL[job.source.kind] ?? job.source.kind}{job.source.name ? `: ${job.source.name}` : ""}</dd></div>
              <div><dt className="font-semibold">Age</dt><dd>{f.label}{f.basis === "first_seen" ? " (the source gives no posting date)" : ""}</dd></div>
              <div><dt className="font-semibold">Last verified</dt><dd>{f.verifiedLabel}</dd></div>
              <div><dt className="font-semibold">Pay</dt><dd><SalaryText salary={salary} status={job.salaryStatus} />. Evident never estimates pay.</dd></div>
              <div><dt className="font-semibold">Application link</dt><dd className="break-all font-mono text-xs">{job.applyUrl}</dd></div>
            </dl>
          </Card>
          <Card>
            <CardTitle>Description</CardTitle>
            <p className="mt-1 text-xs text-muted">Shown as provided by the source, with hidden text removed.</p>
            <div className="mt-3 max-h-[32rem] overflow-y-auto whitespace-pre-line text-sm" tabIndex={0} role="region" aria-label="Job description">
              {job.description || "The source provided no description."}
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
