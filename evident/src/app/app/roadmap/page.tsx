import type { Metadata } from "next";
import { refreshRoadmapAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, ButtonLink, Card, CardTitle, EmptyState, EvidenceQuote, FlashMessages, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import type { RoadmapContent } from "@/lib/services/roadmap";

export const metadata: Metadata = { title: "Skill roadmap" };

const GAP: Record<string, { label: string; tone: "bad" | "info" | "warn" }> = { missing: { label: "Missing", tone: "bad" }, related: { label: "Related skill only", tone: "info" }, listed: { label: "Listed, not demonstrated", tone: "warn" } };

export default async function RoadmapPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const row = await db.roadmap.findUnique({ where: { userId_scope: { userId: user.id, scope: "portfolio" } } });
  const r = row ? (row.content as unknown as RoadmapContent) : null;
  const weeks = r ? [...new Set(r.steps.map((s) => s.week))] : [];

  return (
    <>
      <PageHeader
        title="Skill roadmap"
        lead="The skills your target roles ask for that your resume does not yet prove, ordered by how often they are required, with a plan to close each gap."
        actions={
          <form action={refreshRoadmapAction}>
            <SubmitButton variant={r ? "secondary" : "primary"} pendingLabel="Analysing your target roles…">{r ? "Refresh" : "Build my roadmap"}</SubmitButton>
          </form>
        }
      />
      <FlashMessages error={error} notice={notice} />
      {!r ? (
        <EmptyState title="No roadmap yet">Build one from the roles you have saved. It works best with a resume on file and at least three saved roles.</EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            Based on {r.basis.jobs} {r.basis.from === "saved_roles" ? "roles in your tracker" : "roles (your saved roles plus top matches)"}. Updated {new Date(r.generatedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}.
          </p>
          {r.notes.map((n) => (
            <Notice key={n} tone="info" className="mb-3">{n}</Notice>
          ))}

          <section aria-labelledby="gaps" className="mt-6">
            <h2 id="gaps" className="text-2xl font-semibold">Skill gaps</h2>
            {r.gaps.length === 0 ? (
              <p className="mt-2 text-muted">No gaps found against your target roles.</p>
            ) : (
              <div className="mt-3 overflow-x-auto rounded-card border border-line bg-surface" tabIndex={0} role="region" aria-label="Skill gaps table">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-line text-muted">
                    <tr><th scope="col" className="px-4 py-3 font-semibold">Skill</th><th scope="col" className="px-4 py-3 font-semibold">Your resume</th><th scope="col" className="px-4 py-3 font-semibold">Asked for by</th><th scope="col" className="px-4 py-3 font-semibold">Example from a listing</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {r.gaps.map((g) => (
                      <tr key={g.skillId}>
                        <th scope="row" className="px-4 py-3 font-semibold">{g.name}</th>
                        <td className="px-4 py-3"><Badge tone={GAP[g.status]!.tone}>{GAP[g.status]!.label}</Badge></td>
                        <td className="px-4 py-3">{g.demand} of {r.basis.jobs} roles{g.mustHave ? ` (${g.mustHave} must-have)` : ""}</td>
                        <td className="px-4 py-3">{g.examples[0] ? <EvidenceQuote quote={g.examples[0].quote} source={`${g.examples[0].title}, ${g.examples[0].company}`} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {r.covered.length > 0 ? (
            <section aria-labelledby="covered" className="mt-8">
              <h2 id="covered" className="text-2xl font-semibold">Already demonstrated</h2>
              <p className="mt-2 flex flex-wrap gap-2">
                {r.covered.map((c) => (
                  <Badge key={c.name} tone="good">{c.name} · {c.demand} {c.demand === 1 ? "role" : "roles"}</Badge>
                ))}
              </p>
            </section>
          ) : null}

          {r.steps.length > 0 ? (
            <section aria-labelledby="plan" className="mt-8">
              <h2 id="plan" className="text-2xl font-semibold">Preparation plan</h2>
              <div className="mt-3 space-y-6">
                {weeks.map((w) => (
                  <div key={w}>
                    <h3 className="font-mono text-sm text-muted">Week {w}</h3>
                    <ul className="mt-2 space-y-3">
                      {r.steps.filter((s) => s.week === w).map((s) => (
                        <li key={s.skillId}>
                          <Card>
                            <div className="flex flex-wrap items-baseline justify-between gap-2">
                              <CardTitle as="h3">{s.name}</CardTitle>
                              <span className="text-sm text-muted">about {s.hours} hours</span>
                            </div>
                            <p className="mt-1 text-sm"><span className="font-semibold">Why: </span>{s.why}</p>
                            <p className="mt-1 text-sm"><span className="font-semibold">Goal: </span>{s.goal}</p>
                            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
                              {s.tasks.map((t) => (
                                <li key={t}>{t}</li>
                              ))}
                            </ol>
                            <p className="mt-2 text-sm"><span className="font-semibold">Proof to produce: </span>{s.evidenceToProduce}</p>
                          </Card>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <div className="mt-6"><ButtonLink href="/app/interview" variant="secondary">Practise these in a mock interview</ButtonLink></div>
            </section>
          ) : null}
        </>
      )}
    </>
  );
}
