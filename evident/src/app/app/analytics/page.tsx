import type { Metadata } from "next";
import { Badge, Card, CardTitle, Notice, PageHeader, Stat } from "@/components/ui";
import { analyse, MIN_SAMPLE, type Rate } from "@/lib/agents/analytics";
import { requireUser } from "@/lib/auth/server";

export const metadata: Metadata = { title: "Analytics" };

const pct = (r: Rate) => (r.percent === null ? "—" : `${r.percent}%`);
const frac = (r: Rate) => `${r.numerator} of ${r.denominator}${r.percent === null ? ` (needs ${MIN_SAMPLE} to show a rate)` : ""}`;
const VERDICT: Record<string, string> = { apply: "Strong fit", stretch: "Stretch", skip: "Weak fit" };

export default async function AnalyticsPage() {
  const user = await requireUser();
  const { output: a } = await analyse(user.id);
  const maxWeek = Math.max(1, ...a.weekly.map((w) => w.applied));
  const maxFunnel = Math.max(1, ...a.funnel.map((f) => f.count));

  return (
    <>
      <PageHeader title="Analytics" lead="What your applications are doing. Counts are always shown; percentages only once there is enough data for them to mean something." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Applications" value={a.totals.applied} note={`${a.totals.saved} more saved`} />
        <Stat label="Response rate" value={pct(a.responseRate)} note={frac(a.responseRate)} />
        <Stat label="Interview rate" value={pct(a.interviewRate)} note={frac(a.interviewRate)} />
        <Stat label="Median days to a response" value={a.medianDaysToResponse ?? "—"} note={a.medianDaysToResponse === null ? "Needs 3 responses" : undefined} />
      </div>

      <section aria-labelledby="insights" className="mt-8">
        <h2 id="insights" className="text-2xl font-semibold">What the data says</h2>
        <ul className="mt-3 space-y-3">
          {a.insights.map((i) => (
            <li key={i.title}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={i.strength === "observed" ? "good" : i.strength === "tentative" ? "warn" : "neutral"}>{i.strength === "observed" ? "Observed" : i.strength === "tentative" ? "Tentative" : "Not enough data"}</Badge>
                  <h3 className="font-semibold">{i.title}</h3>
                </div>
                <p className="mt-1 text-sm text-muted">{i.detail}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Funnel</CardTitle>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Applications reaching each stage</caption>
            <tbody>
              {a.funnel.map((f) => (
                <tr key={f.stage}>
                  <th scope="row" className="w-24 py-1.5 pr-3 text-left font-medium">{f.stage}</th>
                  <td className="py-1.5"><div className="h-5 rounded bg-accent" style={{ width: `${Math.max(2, (f.count / maxFunnel) * 100)}%` }} aria-hidden="true" /></td>
                  <td className="w-10 py-1.5 pl-3 text-right tabular-nums">{f.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>Applications per week</CardTitle>
          <table className="mt-3 w-full text-sm">
            <caption className="sr-only">Applications sent in each of the last eight weeks</caption>
            <tbody>
              {a.weekly.map((w) => (
                <tr key={w.weekStart}>
                  <th scope="row" className="w-24 py-1 pr-3 text-left font-mono text-xs font-normal text-muted">{w.weekStart.slice(5)}</th>
                  <td className="py-1"><div className="h-4 rounded bg-accent" style={{ width: `${w.applied === 0 ? 0 : Math.max(3, (w.applied / maxWeek) * 100)}%` }} aria-hidden="true" /></td>
                  <td className="w-10 py-1 pl-3 text-right tabular-nums">{w.applied}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>Responses by fit</CardTitle>
          <p className="mt-1 text-sm text-muted">Fit is the evidence-based verdict stored when you saved or viewed the role.</p>
          <table className="mt-3 w-full text-left text-sm">
            <thead className="text-muted"><tr><th scope="col" className="py-1.5 font-semibold">Fit</th><th scope="col" className="py-1.5 font-semibold">Applied</th><th scope="col" className="py-1.5 font-semibold">Responded</th></tr></thead>
            <tbody className="divide-y divide-line">
              {a.byFit.map((b) => (
                <tr key={b.verdict}><th scope="row" className="py-1.5 font-medium">{VERDICT[b.verdict]}</th><td className="py-1.5 tabular-nums">{b.applied}</td><td className="py-1.5 tabular-nums">{b.responded}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardTitle>Interview practice</CardTitle>
          {a.practice.sessions === 0 ? (
            <p className="mt-2 text-sm text-muted">No completed sessions yet.</p>
          ) : (
            <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
              <div><dt className="text-muted">Sessions</dt><dd className="display text-2xl font-semibold">{a.practice.sessions}</dd></div>
              <div><dt className="text-muted">Average</dt><dd className="display text-2xl font-semibold">{a.practice.averageScore}</dd></div>
              <div><dt className="text-muted">Latest</dt><dd className="display text-2xl font-semibold">{a.practice.latestScore}</dd></div>
            </dl>
          )}
        </Card>
      </div>
      <Notice tone="info" className="mt-6">These figures come only from what you record in your tracker. Comparisons are associations in a small personal sample, not proof of cause.</Notice>
    </>
  );
}
