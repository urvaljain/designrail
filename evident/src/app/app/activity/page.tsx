import type { Metadata } from "next";
import { Badge, Card, EmptyState, PageHeader, Stat } from "@/components/ui";
import { aiAllowance } from "@/lib/agents/runtime";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { getProvider } from "@/lib/llm/router";

export const metadata: Metadata = { title: "Agent activity" };

const AGENT: Record<string, string> = { job_discovery: "Job Discovery", resume_intelligence: "Resume Intelligence", application_strategy: "Application Strategy", interview_coach: "Interview Coach", career_analytics: "Career Analytics", follow_up: "Follow-Up" };

export default async function ActivityPage() {
  const user = await requireUser();
  const [runs, allowance, totals] = await Promise.all([
    db.agentRun.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 40, include: { steps: { orderBy: { index: "asc" } } } }),
    aiAllowance(user.id),
    db.agentRun.aggregate({ where: { userId: user.id }, _count: true, _sum: { costUsd: true } }),
  ]);
  const provider = getProvider();

  return (
    <>
      <PageHeader title="Agent activity" lead="A complete log of what Evident's agents did on your behalf: which tools they called, what came back, and where a model was or was not involved." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Agent runs" value={totals._count} />
        <Stat label="Model in use" value={provider ? "On" : "Off"} note={provider ? `${provider.name}: ${provider.model}` : "Built-in rules only. No model is configured."} />
        <Stat label="Model-backed runs this month" value={`${allowance.used}/${allowance.limit}`} />
        <Stat label="Estimated model cost" value={`$${(totals._sum.costUsd ?? 0).toFixed(4)}`} note="Estimated from token counts" />
      </div>

      <h2 className="mt-8 text-2xl font-semibold">Recent runs</h2>
      {runs.length === 0 ? (
        <div className="mt-3"><EmptyState title="No activity yet">Agent runs appear here as you use the product.</EmptyState></div>
      ) : (
        <ul className="mt-3 space-y-3">
          {runs.map((r) => (
            <li key={r.id}>
              <Card>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{AGENT[r.agent] ?? r.agent}</span>
                  <Badge tone={r.status === "ok" ? "good" : r.status === "degraded" ? "warn" : "bad"}>{r.status === "ok" ? "Completed" : r.status === "degraded" ? "Completed with fallback" : "Failed"}</Badge>
                  <Badge>{r.provider === "deterministic" ? "Rules only" : `Model: ${r.model ?? r.provider}`}</Badge>
                  <span className="text-sm text-muted">{r.trigger.replace(/_/g, " ")} · <time dateTime={r.createdAt.toISOString()}>{r.createdAt.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time> · {r.latencyMs} ms</span>
                </div>
                {r.notes.length > 0 ? (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-warn">
                    {r.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                ) : null}
                {r.error ? <p className="mt-2 text-sm text-bad">Error: {r.error}</p> : null}
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer font-medium text-accent-ink">{r.steps.length} tool {r.steps.length === 1 ? "call" : "calls"}</summary>
                  <ol className="mt-2 space-y-2">
                    {r.steps.map((s) => (
                      <li key={s.id} className="rounded-control bg-sunken p-3">
                        <p className="font-mono text-xs"><span className="font-semibold">{s.tool}</span> · {s.status} · {s.latencyMs} ms</p>
                        <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-muted" tabIndex={0}>in: {JSON.stringify(s.input)}{"\n"}out: {s.error ?? JSON.stringify(s.output)}</pre>
                      </li>
                    ))}
                  </ol>
                </details>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
