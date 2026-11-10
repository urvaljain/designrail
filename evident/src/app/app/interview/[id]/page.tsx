import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { submitAnswerAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, CardTitle, EvidenceQuote, Field, FlashMessages, Meter, Notice, Textarea } from "@/components/ui";
import { getInterview, type SessionPlan, type SessionSummary } from "@/lib/agents/interview";
import { requireUser } from "@/lib/auth/server";
import type { Question } from "@/lib/interview/bank";
import type { Evaluation } from "@/lib/interview/evaluate";
import { NotFoundError } from "@/lib/services/applications";

export const metadata: Metadata = { title: "Mock interview" };

const KIND: Record<string, string> = { motivation: "Motivation", behavioral: "Behavioural", concept: "Technical", deep_dive: "Resume deep-dive", gap: "Gap probe" };
const tone = (n: number) => (n >= 70 ? "good" : n >= 50 ? "warn" : "bad") as "good" | "warn" | "bad";

function Feedback({ ev }: { ev: Evaluation }) {
  return (
    <div className="mt-4 rounded-control bg-sunken p-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="display text-2xl font-semibold tabular-nums">{ev.score}<span className="font-sans text-sm font-normal text-muted"> / 100</span></p>
        <div className="w-40"><Meter value={ev.score} label="Answer score" tone={tone(ev.score)} /></div>
        <span className="text-xs text-muted">{ev.source === "llm" ? "Coach feedback, checked against your answer and bounded by the rubric" : "Scored by the built-in rubric"}</span>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {ev.dimensions.map((d) => (
          <div key={d.name} className="flex gap-2"><dt className="font-semibold">{d.name} {d.score}:</dt><dd className="text-muted">{d.note}</dd></div>
        ))}
      </dl>
      {ev.strengths.length > 0 ? (
        <>
          <h4 className="mt-4 font-semibold">What worked</h4>
          <ul className="mt-1 space-y-2">
            {ev.strengths.map((s) => (
              <li key={s.point + s.quote} className="text-sm"><p>{s.point}</p><EvidenceQuote quote={s.quote} source="Your answer" /></li>
            ))}
          </ul>
        </>
      ) : null}
      {ev.improvements.length > 0 ? (
        <>
          <h4 className="mt-4 font-semibold">What to improve</h4>
          <ul className="mt-1 space-y-2">
            {ev.improvements.map((s) => (
              <li key={s.point} className="text-sm"><p>{s.point}</p>{s.quote ? <EvidenceQuote quote={s.quote} source="Your answer" /> : null}</li>
            ))}
          </ul>
        </>
      ) : null}
      {ev.coverage.length > 0 ? (
        <>
          <h4 className="mt-4 font-semibold">Expected points</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {ev.coverage.map((c) => (
              <li key={c.point}><Badge tone={c.hit ? "good" : "neutral"}>{c.hit ? "Covered" : "Not covered"}</Badge> {c.point}</li>
            ))}
          </ul>
        </>
      ) : null}
    </div>
  );
}

export default async function InterviewSessionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { error } = await searchParams;
  let session;
  try {
    session = await getInterview(user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const plan = session.plan as unknown as SessionPlan;
  const summary = session.summary as unknown as SessionSummary | null;
  const open = session.turns.find((t) => t.answer === null);
  const answered = session.turns.filter((t) => t.answer !== null);

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/app/interview" className="text-accent-ink underline underline-offset-4">← Interview practice</Link>
      </nav>
      <header className="mb-5">
        <h1 className="text-3xl font-semibold">Mock interview</h1>
        <p className="mt-1 text-lg text-muted">{session.title}</p>
        <p className="mt-2 text-sm" role="status">{session.status === "completed" ? `Completed: ${answered.length} questions answered.` : `Question ${answered.length + 1} of ${plan.length}.`}</p>
      </header>
      <FlashMessages error={error} />

      <details className="mb-6 rounded-card border border-line bg-surface px-4 py-3 text-sm">
        <summary className="cursor-pointer font-semibold">How this session was put together</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {plan.basis.map((b) => (
            <li key={b}>{b}</li>
          ))}
          <li>Difficulty moves up after a strong answer and down after a weak one.</li>
        </ul>
      </details>

      {summary ? (
        <Card className="mb-6">
          <CardTitle>Session summary</CardTitle>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <p className="display text-4xl font-semibold tabular-nums">{summary.overall}<span className="font-sans text-base font-normal text-muted"> / 100</span></p>
            <div className="w-56"><Meter value={summary.overall} label="Overall session score" tone={tone(summary.overall)} /></div>
          </div>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {summary.byCompetency.map((c, i) => (
              <li key={c.competency + i} className="flex items-center justify-between gap-3 rounded-control bg-sunken px-3 py-2">
                <span>{c.competency} <span className="text-muted">({KIND[c.kind] ?? c.kind})</span></span>
                <Badge tone={tone(c.score)}>{c.score}</Badge>
              </li>
            ))}
          </ul>
          <h3 className="mt-5 font-semibold">What to do next</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {summary.nextSteps.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <ButtonLink href="/app/roadmap" variant="secondary">Open skill roadmap</ButtonLink>
            <ButtonLink href="/app/interview">Practise again</ButtonLink>
          </div>
        </Card>
      ) : null}

      <ol className="space-y-5">
        {session.turns.map((t, i) => {
          const q = t.question as unknown as Question & { adaptReason?: string };
          const ev = t.evaluation as unknown as Evaluation | null;
          const isOpen = open?.id === t.id;
          const isLatest = !isOpen && i === answered.length - 1;
          return (
            <li key={t.id} id={isLatest ? "latest" : undefined} className="scroll-mt-4">
              <Card className={isOpen ? "border-accent" : undefined}>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">Question {t.index + 1}</Badge>
                  <Badge>{KIND[q.kind] ?? q.kind}</Badge>
                  <Badge>Difficulty {q.difficulty} of 3</Badge>
                </div>
                <h2 className="mt-3 font-sans text-lg font-semibold">{q.text}</h2>
                <p className="mt-2 text-sm text-muted"><span className="font-semibold text-ink">Why this question: </span>{q.rationale}{q.adaptReason && t.index > 0 ? ` ${q.adaptReason}` : ""}</p>
                {isOpen ? (
                  <form action={submitAnswerAction} className="mt-4 space-y-3">
                    <input type="hidden" name="sessionId" value={session.id} />
                    <Field label="Your answer" htmlFor="answer" hint="Write as you would speak. 60 to 200 words is a good length.">
                      <Textarea id="answer" name="answer" rows={8} maxLength={6000} required aria-describedby="answer-hint" />
                    </Field>
                    <SubmitButton pendingLabel="Reviewing your answer…">Submit answer</SubmitButton>
                  </form>
                ) : (
                  <>
                    <h3 className="mt-4 text-sm font-semibold">Your answer</h3>
                    <p className="mt-1 whitespace-pre-line text-sm">{t.answer}</p>
                    {ev ? <Feedback ev={ev} /> : null}
                  </>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
      {session.status === "active" && !open ? <Notice tone="warn" className="mt-5">This session has no open question. Start a new one.</Notice> : null}
    </>
  );
}
