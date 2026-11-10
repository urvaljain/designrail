import type { Metadata } from "next";
import Link from "next/link";
import { reminderAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, CardTitle, FlashMessages, Notice, PageHeader, Stat } from "@/components/ui";
import { ACTION_LABEL, recommend } from "@/lib/agents/strategy";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { dueReminders } from "@/lib/services/applications";

export const metadata: Metadata = { title: "Today" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const [strategy, reminders, counts, resume, profile, interviews] = await Promise.all([
    recommend(user.id).catch(() => null),
    dueReminders(user.id),
    db.application.groupBy({ by: ["status"], where: { userId: user.id }, _count: true }),
    db.resume.findFirst({ where: { userId: user.id, status: { not: "failed" } }, select: { id: true } }),
    db.profile.findUnique({ where: { userId: user.id } }),
    db.interviewSession.count({ where: { userId: user.id } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const tracked = counts.reduce((n, c) => n + c._count, 0);
  const setup = [
    { done: Boolean(resume), label: "Add your resume", href: "/app/resume", why: "Fit assessments and interview questions are built from it." },
    { done: (profile?.targetRoles.length ?? 0) > 0, label: "Set your target roles", href: "/app/settings", why: "Ranking uses them, and tells you when it does." },
    { done: tracked > 0, label: "Save a job you would apply to", href: "/app/jobs", why: "Saving starts tracking and reminders." },
    { done: interviews > 0, label: "Run one mock interview", href: "/app/interview", why: "Five questions, about ten minutes." },
  ];
  const remaining = setup.filter((s) => !s.done);

  return (
    <>
      <PageHeader title={user.name ? `Today, ${user.name.split(" ")[0]}` : "Today"} lead="What deserves your attention, and why." />
      <FlashMessages error={error} notice={notice} />

      {remaining.length > 0 ? (
        <Card className="mb-6">
          <CardTitle>Get set up ({setup.length - remaining.length} of {setup.length} done)</CardTitle>
          <ol className="mt-3 space-y-2">
            {setup.map((s) => (
              <li key={s.label} className="flex flex-wrap items-baseline gap-x-3">
                <Badge tone={s.done ? "good" : "neutral"}>{s.done ? "Done" : "To do"}</Badge>
                {s.done ? <span className="text-muted">{s.label}</span> : <Link href={s.href} className="font-semibold text-accent-ink underline underline-offset-4">{s.label}</Link>}
                {!s.done ? <span className="text-sm text-muted">{s.why}</span> : null}
              </li>
            ))}
          </ol>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Saved" value={count("saved")} />
        <Stat label="Applied" value={count("applied") + count("screening")} />
        <Stat label="Interviewing" value={count("interview")} />
        <Stat label="Offers" value={count("offer")} />
      </div>

      <section aria-labelledby="next" className="mt-8">
        <h2 id="next" className="text-2xl font-semibold">Recommended next steps</h2>
        <p className="mt-1 text-sm text-muted">
          From the Application Strategy agent. Each item lists the facts it rests on. <Link href="/app/activity" className="underline underline-offset-4">See how it was produced</Link>.
        </p>
        {!strategy ? (
          <Notice tone="warn" className="mt-4">Recommendations could not be generated just now. Your data is unaffected; reload to try again.</Notice>
        ) : (
          <>
            {strategy.output.observations.map((o) => (
              <Notice key={o} tone="info" className="mt-4">{o}</Notice>
            ))}
            <ol className="mt-4 space-y-3">
              {strategy.output.recommendations.map((r) => (
                <li key={r.jobId}>
                  <Card>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <Badge tone={r.action === "archive" ? "neutral" : r.action === "review" ? "info" : "accent"}>{ACTION_LABEL[r.action]}</Badge>
                        <h3 className="mt-2 text-lg font-semibold">
                          <Link href={r.applicationId ? `/app/applications/${r.applicationId}` : `/app/jobs/${r.jobId}`} className="underline-offset-4 hover:underline">
                            {r.title}
                          </Link>
                        </h3>
                        <p className="text-sm text-muted">{r.companyName}</p>
                      </div>
                      <p className="text-sm text-muted">Priority {r.priority}/100</p>
                    </div>
                    <p className="mt-3 text-sm font-semibold">Why</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {r.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    {r.uncertainty ? <p className="mt-2 text-sm text-warn">{r.uncertainty}</p> : null}
                  </Card>
                </li>
              ))}
            </ol>
          </>
        )}
      </section>

      <section aria-labelledby="reminders" className="mt-8">
        <h2 id="reminders" className="text-2xl font-semibold">Reminders</h2>
        {reminders.length === 0 ? (
          <p className="mt-2 text-muted">Nothing due in the next three days.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {reminders.map((r) => (
              <li key={r.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="max-w-2xl">
                      <Link href={`/app/applications/${r.applicationId}`} className="font-semibold underline-offset-4 hover:underline">{r.message}</Link>
                      <p className="mt-1 text-sm text-muted">{r.rationale}</p>
                      <p className="mt-1 text-sm">
                        <Badge tone={r.dueAt <= new Date() ? "warn" : "neutral"}>{r.dueAt <= new Date() ? "Due" : `Due ${r.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}</Badge>
                      </p>
                    </div>
                    <form action={reminderAction} className="flex gap-2">
                      <input type="hidden" name="reminderId" value={r.id} />
                      <input type="hidden" name="returnTo" value="/app" />
                      <SubmitButton name="status" value="done" variant="secondary">Done</SubmitButton>
                      <SubmitButton name="status" value="dismissed" variant="ghost">Dismiss</SubmitButton>
                    </form>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8">
        <ButtonLink href="/app/jobs">Find jobs</ButtonLink>
      </div>
    </>
  );
}
