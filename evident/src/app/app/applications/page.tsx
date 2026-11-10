import type { Metadata } from "next";
import Link from "next/link";
import { setStatusAction, togglePinAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, DemoBadge, EmptyState, FlashMessages, PageHeader, Select } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { listApplications, STATUSES, STATUS_LABEL, type AppStatus } from "@/lib/services/applications";

export const metadata: Metadata = { title: "Applications" };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const apps = await listApplications(user.id);
  const groups = STATUSES.map((s) => ({ status: s, items: apps.filter((a) => a.status === s) })).filter((g) => g.items.length > 0);

  return (
    <>
      <PageHeader title="Applications" lead="Every role you have saved or applied to, by stage. Reminders appear when something is due." actions={<ButtonLink href="/app/jobs" variant="secondary">Find more jobs</ButtonLink>} />
      <FlashMessages error={error} notice={notice} />
      {apps.length === 0 ? (
        <EmptyState title="Nothing tracked yet" action={<ButtonLink href="/app/jobs">Find jobs</ButtonLink>}>
          Save a job to start tracking it. Saving and tracking are free and unlimited.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.status} aria-labelledby={`stage-${g.status}`}>
              <h2 id={`stage-${g.status}`} className="text-xl font-semibold">
                {STATUS_LABEL[g.status as AppStatus]} <span className="font-sans text-base font-normal text-muted">({g.items.length})</span>
              </h2>
              <ul className="mt-3 grid gap-3 md:grid-cols-2">
                {g.items.map((a) => (
                  <li key={a.id}>
                    <Card className="h-full">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="font-semibold">
                            <Link href={`/app/applications/${a.id}`} className="underline-offset-4 hover:underline">{a.job.title}</Link>
                          </h3>
                          <p className="text-sm text-muted">{a.job.companyName} · {a.job.location ?? "Location not stated"}</p>
                        </div>
                        <form action={togglePinAction}>
                          <input type="hidden" name="applicationId" value={a.id} />
                          <button className="min-h-11 min-w-11 rounded-control text-sm font-medium text-accent-ink hover:bg-sunken" aria-pressed={a.pinned}>
                            {a.pinned ? "Unpin" : "Pin"}
                            <span className="sr-only"> {a.job.title}</span>
                          </button>
                        </form>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {a.pinned ? <Badge tone="accent">Pinned</Badge> : null}
                        {a.job.isSynthetic ? <DemoBadge /> : null}
                        {a.job.status === "closed" ? <Badge tone="bad">Listing closed</Badge> : null}
                        {a.appliedAt ? <Badge>Applied {a.appliedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</Badge> : null}
                      </div>
                      {a.reminders[0] ? <p className="mt-2 text-sm text-warn">Reminder: {a.reminders[0].message} ({a.reminders[0].dueAt <= new Date() ? "due now" : `due ${a.reminders[0].dueAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`})</p> : null}
                      <form action={setStatusAction} className="mt-3 flex items-end gap-2">
                        <input type="hidden" name="applicationId" value={a.id} />
                        <input type="hidden" name="returnTo" value="/app/applications" />
                        <div className="flex-1">
                          <label htmlFor={`status-${a.id}`} className="sr-only">Stage for {a.job.title}</label>
                          <Select id={`status-${a.id}`} name="status" defaultValue={a.status}>
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                            ))}
                          </Select>
                        </div>
                        <SubmitButton variant="secondary" pendingLabel="Saving…">Update<span className="sr-only"> stage for {a.job.title}</span></SubmitButton>
                      </form>
                    </Card>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
