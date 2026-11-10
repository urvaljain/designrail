import type { Metadata } from "next";
import Link from "next/link";
import { startInterviewAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, EmptyState, Field, FlashMessages, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Interview practice" };

export default async function InterviewHome({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const [apps, sessions] = await Promise.all([
    db.application.findMany({ where: { userId: user.id, status: { in: ["saved", "applied", "screening", "interview"] } }, include: { job: { select: { id: true, title: true, companyName: true } } }, orderBy: { updatedAt: "desc" }, take: 30 }),
    db.interviewSession.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 20, include: { _count: { select: { turns: true } } } }),
  ]);
  return (
    <>
      <PageHeader title="Interview practice" lead="A written mock interview for a specific role. Questions come from that role's requirements and your resume, adapt to how you answer, and every piece of feedback quotes what you wrote." />
      <FlashMessages error={error} notice={notice} />
      <Card className="mb-8">
        <CardTitle>Start a session</CardTitle>
        <form action={startInterviewAction} className="mt-4 grid gap-4 md:grid-cols-[2fr_1fr_auto] md:items-end">
          <Field label="Role to practise for" htmlFor="jobId" hint={apps.length === 0 ? "Save a job to practise for it specifically." : undefined}>
            <Select id="jobId" name="jobId" defaultValue={apps[0]?.job.id ?? ""} aria-describedby={apps.length === 0 ? "jobId-hint" : undefined}>
              {apps.map((a) => (
                <option key={a.id} value={a.job.id}>{a.job.title} at {a.job.companyName}</option>
              ))}
              <option value="">General practice (no specific role)</option>
            </Select>
          </Field>
          <Field label="Length" htmlFor="length">
            <Select id="length" name="length" defaultValue="5">
              <option value="3">3 questions</option>
              <option value="5">5 questions</option>
              <option value="8">8 questions</option>
            </Select>
          </Field>
          <SubmitButton pendingLabel="Preparing questions…">Start</SubmitButton>
        </form>
      </Card>

      <h2 className="text-2xl font-semibold">Past sessions</h2>
      {sessions.length === 0 ? (
        <div className="mt-3"><EmptyState title="No sessions yet">Your completed sessions and scores will appear here.</EmptyState></div>
      ) : (
        <ul className="mt-3 space-y-3">
          {sessions.map((s) => {
            const overall = (s.summary as { overall?: number } | null)?.overall;
            return (
              <li key={s.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link href={`/app/interview/${s.id}`} className="font-semibold underline-offset-4 hover:underline">{s.title}</Link>
                    <p className="text-sm text-muted">{s.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} · {s._count.turns} question{s._count.turns === 1 ? "" : "s"}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof overall === "number" ? <Badge tone={overall >= 70 ? "good" : overall >= 50 ? "warn" : "bad"}>Score {overall}/100</Badge> : null}
                    <Badge tone={s.status === "completed" ? "neutral" : "accent"}>{s.status === "completed" ? "Completed" : "In progress"}</Badge>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
