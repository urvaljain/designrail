import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buildKitAction, draftOutreachAction, draftTransitionAction, reminderAction, removeApplicationAction, setStatusAction, startInterviewAction, updateNotesAction } from "@/app/actions";
import { CopyButton, SubmitButton } from "@/components/client";
import { MatchView } from "@/components/match-view";
import { Badge, ButtonLink, Card, CardTitle, DemoBadge, EvidenceQuote, Field, FlashMessages, Input, Notice, Select, Textarea } from "@/components/ui";
import type { Grounding } from "@/lib/agents/followup";
import type { ApplicationKit } from "@/lib/agents/resume-intel";
import { requireUser } from "@/lib/auth/server";
import { getApplication, NotFoundError, STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/services/applications";
import { evaluateFit } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Application" };

const DRAFT_STATUS: Record<string, { label: string; tone: "neutral" | "good" | "accent" | "warn" }> = {
  draft: { label: "Draft: not approved", tone: "warn" },
  approved: { label: "Approved by you", tone: "accent" },
  sent_by_user: { label: "Sent by you", tone: "good" },
  discarded: { label: "Discarded", tone: "neutral" },
};

export default async function ApplicationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { error, notice } = await searchParams;
  let app;
  try {
    app = await getApplication(user.id, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }
  const fit = await evaluateFit(user.id, app.jobId);
  const kit = app.kit as unknown as ApplicationKit | null;
  const pending = app.reminders.filter((r) => r.status === "pending");
  const drafts = app.drafts.filter((d) => d.status !== "discarded");

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm">
        <Link href="/app/applications" className="text-accent-ink underline underline-offset-4">← All applications</Link>
      </nav>
      <FlashMessages error={error} notice={notice} />

      <header className="mb-6">
        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">{STATUS_LABEL[app.status as AppStatus] ?? app.status}</Badge>
          {app.job.isSynthetic ? <DemoBadge /> : null}
          {app.job.status === "closed" ? <Badge tone="bad">Listing closed</Badge> : null}
        </div>
        <h1 className="mt-3 text-3xl font-semibold">{app.job.title}</h1>
        <p className="mt-1 text-lg text-muted">{app.job.companyName} · {app.job.location ?? "Location not stated"}</p>
        <div className="mt-4 flex flex-wrap items-end gap-2">
          <form action={setStatusAction} className="flex items-end gap-2">
            <input type="hidden" name="applicationId" value={app.id} />
            <input type="hidden" name="returnTo" value={`/app/applications/${app.id}`} />
            <Field label="Stage" htmlFor="status">
              <Select id="status" name="status" defaultValue={app.status}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                ))}
              </Select>
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Saving…">Update stage</SubmitButton>
          </form>
          <ButtonLink href={`/app/jobs/${app.jobId}`} variant="secondary">View listing</ButtonLink>
          {app.job.status !== "closed" ? <ButtonLink href={app.job.applyUrl} external>Apply on the employer&apos;s site</ButtonLink> : null}
        </div>
      </header>

      {pending.length > 0 ? (
        <section aria-labelledby="reminders" className="mb-6">
          <h2 id="reminders" className="text-xl font-semibold">Reminders</h2>
          <ul className="mt-2 space-y-2">
            {pending.map((r) => (
              <li key={r.id}>
                <Card className="flex flex-wrap items-start justify-between gap-3">
                  <div className="max-w-2xl">
                    <p className="font-semibold">{r.message}</p>
                    <p className="mt-1 text-sm text-muted">{r.rationale}</p>
                    <p className="mt-1 text-sm">Due {r.dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}</p>
                  </div>
                  <form action={reminderAction} className="flex gap-2">
                    <input type="hidden" name="reminderId" value={r.id} />
                    <input type="hidden" name="returnTo" value={`/app/applications/${app.id}`} />
                    <SubmitButton name="status" value="done" variant="secondary">Done</SubmitButton>
                    <SubmitButton name="status" value="dismissed" variant="ghost">Dismiss</SubmitButton>
                  </form>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="space-y-6">
        <section id="kit" aria-labelledby="kit-h">
          <Card>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="max-w-2xl">
                <CardTitle id="kit-h">Application kit</CardTitle>
                <p className="mt-1 text-sm text-muted">Which of your resume lines to lead with, which to strengthen, and a cover note assembled only from what your resume already says.</p>
              </div>
              <form action={buildKitAction}>
                <input type="hidden" name="applicationId" value={app.id} />
                <SubmitButton variant={kit ? "secondary" : "primary"} pendingLabel="Preparing…">{kit ? "Rebuild kit" : "Prepare my application"}</SubmitButton>
              </form>
            </div>
            {kit ? (
              <div className="mt-5 space-y-6">
                {kit.leadWith.length > 0 ? (
                  <div>
                    <h3 className="font-semibold">Lead with these lines</h3>
                    <ul className="mt-2 space-y-3">
                      {kit.leadWith.map((l) => (
                        <li key={l.lineId + l.requirement}>
                          <p className="text-sm">Supports <span className="font-semibold">{l.requirement}</span></p>
                          <EvidenceQuote quote={l.quote} source={`Your resume, line ${l.lineId.replace("L", "")}`} />
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <Notice tone="warn">None of your resume lines demonstrates a requirement of this role. Read the gaps below before applying.</Notice>
                )}
                {kit.strengthen.length > 0 ? (
                  <div>
                    <h3 className="font-semibold">Strengthen these lines</h3>
                    <ul className="mt-2 space-y-3">
                      {kit.strengthen.map((l) => (
                        <li key={l.lineId}>
                          <EvidenceQuote quote={l.quote} source={`Your resume, line ${l.lineId.replace("L", "")}`} />
                          <p className="mt-1 text-sm">{l.suggestion}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {kit.listedOnly.length > 0 || kit.gaps.length > 0 ? (
                  <div>
                    <h3 className="font-semibold">Gaps to handle honestly</h3>
                    <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm">
                      {kit.listedOnly.map((l) => (
                        <li key={l.skill}>{l.suggestion}</li>
                      ))}
                      {kit.gaps.map((g) => (
                        <li key={g.requirement}>{g.advice}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div>
                  <h3 className="font-semibold">Cover note</h3>
                  <p className="mt-1 text-sm text-muted">{kit.coverNoteChecks.join(" ")}</p>
                  <pre className="mt-2 whitespace-pre-wrap rounded-control bg-sunken p-4 font-sans text-sm" tabIndex={0}>{kit.coverNote}</pre>
                  <div className="mt-2"><CopyButton text={kit.coverNote} label="Copy cover note" /></div>
                </div>
              </div>
            ) : null}
          </Card>
        </section>

        {fit ? <MatchView match={fit.match} /> : <Notice tone="info"><Link href="/app/resume" className="font-semibold underline underline-offset-4">Add your resume</Link> to see your fit for this role and unlock the application kit.</Notice>}

        <section id="outreach" aria-labelledby="outreach-h">
          <Card>
            <CardTitle id="outreach-h">Outreach</CardTitle>
            <p className="mt-1 text-sm text-muted">Evident drafts; you decide. Nothing is sent from here, and a draft cannot be marked as sent until you approve it. Recipient details are only ever what you type in.</p>
            <form action={draftOutreachAction} className="mt-4 grid gap-3 md:grid-cols-4">
              <input type="hidden" name="applicationId" value={app.id} />
              <Field label="Message type" htmlFor="purpose">
                <Select id="purpose" name="purpose" defaultValue={app.status === "interview" ? "thank_you" : app.status === "saved" ? "intro" : "follow_up"}>
                  <option value="follow_up">Follow-up on application</option>
                  <option value="thank_you">Thank-you after interview</option>
                  <option value="intro">Introduction to recruiter</option>
                </Select>
              </Field>
              <Field label="Channel" htmlFor="channel">
                <Select id="channel" name="channel" defaultValue="email">
                  <option value="email">Email</option>
                  <option value="linkedin">LinkedIn message</option>
                </Select>
              </Field>
              <Field label="Recipient name (optional)" htmlFor="recipientName">
                <Input id="recipientName" name="recipientName" maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Their role (optional)" htmlFor="recipientTitle">
                <Input id="recipientTitle" name="recipientTitle" maxLength={80} autoComplete="off" />
              </Field>
              <div className="md:col-span-4"><SubmitButton variant="secondary" pendingLabel="Drafting…">Draft a message</SubmitButton></div>
            </form>

            {drafts.length > 0 ? (
              <ul className="mt-6 space-y-5">
                {drafts.map((d) => {
                  const g = d.grounding as unknown as Grounding;
                  const st = DRAFT_STATUS[d.status] ?? DRAFT_STATUS.draft!;
                  return (
                    <li key={d.id} className="rounded-card border border-line p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={st.tone}>{st.label}</Badge>
                        <span className="text-sm text-muted">{d.purpose.replace("_", " ")} · {d.channel}{d.recipientName ? ` · to ${d.recipientName}` : ""}</span>
                      </div>
                      {d.status === "draft" ? (
                        <form action={draftTransitionAction} className="mt-3 space-y-3">
                          <input type="hidden" name="applicationId" value={app.id} />
                          <input type="hidden" name="draftId" value={d.id} />
                          {d.subject !== null ? (
                            <Field label="Subject" htmlFor={`subject-${d.id}`}><Input id={`subject-${d.id}`} name="subject" defaultValue={d.subject} maxLength={200} /></Field>
                          ) : null}
                          <Field label="Message" htmlFor={`body-${d.id}`}><Textarea id={`body-${d.id}`} name="body" defaultValue={d.body} rows={9} maxLength={4000} /></Field>
                          <div className="flex flex-wrap gap-2">
                            <SubmitButton name="to" value="approved" pendingLabel="Saving…">Approve this message</SubmitButton>
                            <SubmitButton name="to" value="draft" variant="secondary" pendingLabel="Saving…">Save edits</SubmitButton>
                            <SubmitButton name="to" value="discarded" variant="ghost" pendingLabel="Discarding…">Discard</SubmitButton>
                          </div>
                        </form>
                      ) : (
                        <>
                          {d.subject ? <p className="mt-3 text-sm"><span className="font-semibold">Subject:</span> {d.subject}</p> : null}
                          <pre className="mt-2 whitespace-pre-wrap rounded-control bg-sunken p-4 font-sans text-sm" tabIndex={0}>{d.body}</pre>
                          {d.status === "approved" ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                              <CopyButton text={d.body} label="Copy message" />
                              {d.channel === "email" ? <a className="inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 text-sm font-semibold hover:bg-sunken" href={`mailto:?subject=${encodeURIComponent(d.subject ?? "")}&body=${encodeURIComponent(d.body)}`}>Open in my email app</a> : null}
                              <form action={draftTransitionAction} className="flex gap-2">
                                <input type="hidden" name="applicationId" value={app.id} />
                                <input type="hidden" name="draftId" value={d.id} />
                                <SubmitButton name="to" value="sent_by_user" variant="secondary" pendingLabel="Saving…">I sent it</SubmitButton>
                                <SubmitButton name="to" value="draft" variant="ghost" pendingLabel="Saving…">Edit again</SubmitButton>
                              </form>
                            </div>
                          ) : null}
                        </>
                      )}
                      <details className="mt-3 text-sm">
                        <summary className="cursor-pointer font-semibold">What this draft is based on</summary>
                        <ul className="mt-2 list-disc space-y-1 pl-5">
                          {g.facts.map((f) => (
                            <li key={f.fact}>{f.fact} <span className="text-muted">({f.source})</span></li>
                          ))}
                        </ul>
                        {g.unknowns.length > 0 ? (
                          <>
                            <p className="mt-2 font-semibold">Not known, left for you to fill in</p>
                            <ul className="mt-1 list-disc space-y-1 pl-5">
                              {g.unknowns.map((u) => (
                                <li key={u}>{u}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        <p className="mt-2 text-muted">{g.source === "llm" ? "Wording polished by a model, then checked against these facts." : "Written from a template using only these facts."}</p>
                      </details>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </Card>
        </section>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardTitle>Notes</CardTitle>
            <form action={updateNotesAction} className="mt-3 space-y-3">
              <input type="hidden" name="applicationId" value={app.id} />
              <Field label="Private notes" htmlFor="notes"><Textarea id="notes" name="notes" defaultValue={app.notes ?? ""} rows={5} maxLength={5000} /></Field>
              <SubmitButton variant="secondary" pendingLabel="Saving…">Save notes</SubmitButton>
            </form>
          </Card>
          <Card>
            <CardTitle>Timeline</CardTitle>
            <ol className="mt-3 space-y-2 text-sm">
              {app.events.map((e) => (
                <li key={e.id} className="flex gap-3">
                  <time className="w-24 shrink-0 text-muted" dateTime={e.at.toISOString()}>{e.at.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</time>
                  <span>{e.type === "status_changed" ? `Moved from ${STATUS_LABEL[e.fromStatus as AppStatus] ?? e.fromStatus} to ${STATUS_LABEL[e.toStatus as AppStatus] ?? e.toStatus}` : e.type === "created" ? "Saved to tracker" : (e.note ?? e.type)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-wrap gap-2">
          <form action={startInterviewAction}>
            <input type="hidden" name="jobId" value={app.jobId} />
            <input type="hidden" name="length" value="5" />
            <SubmitButton pendingLabel="Preparing questions…">Practise this interview</SubmitButton>
          </form>
          <form action={removeApplicationAction}>
            <input type="hidden" name="applicationId" value={app.id} />
            <SubmitButton variant="danger" pendingLabel="Removing…">Remove from tracker</SubmitButton>
          </form>
        </div>
      </div>
    </>
  );
}
