import { z } from "zod";
import { db } from "../db";
import { daysBetween } from "../text";
import { runAgent, tool, type AgentOutcome } from "./runtime";

export interface Rate {
  numerator: number;
  denominator: number;
  /** null when the denominator is too small to report a percentage honestly. */
  percent: number | null;
}

export interface Insight {
  title: string;
  detail: string;
  /** "observed" = a plain count. "tentative" = a comparison on a small sample. "insufficient" = not enough data to say. */
  strength: "observed" | "tentative" | "insufficient";
}

export interface AnalyticsOutput {
  generatedAt: string;
  totals: { tracked: number; saved: number; applied: number; responded: number; interviews: number; offers: number; rejected: number };
  funnel: { stage: string; count: number }[];
  responseRate: Rate;
  interviewRate: Rate;
  medianDaysToResponse: number | null;
  weekly: { weekStart: string; applied: number }[];
  byFit: { verdict: string; applied: number; responded: number }[];
  byTiming: { bucket: string; applied: number; responded: number }[];
  practice: { sessions: number; averageScore: number | null; latestScore: number | null };
  insights: Insight[];
}

export const MIN_SAMPLE = 5;

export function rate(n: number, d: number): Rate {
  return { numerator: n, denominator: d, percent: d >= MIN_SAMPLE ? Math.round((n / d) * 100) : null };
}

interface AppRow {
  status: string;
  appliedAt: Date | null;
  createdAt: Date;
  events: { toStatus: string | null; at: Date }[];
  verdict: string | null;
  jobPostedAt: Date | null;
}

const RESPONSE_STATES = ["screening", "interview", "offer", "rejected"];

/** Pure computation over a user's application history. */
export function computeAnalytics(apps: AppRow[], practiceScores: number[], now: Date): AnalyticsOutput {
  const reached = (a: AppRow, s: string) => a.status === s || a.events.some((e) => e.toStatus === s);
  const applied = apps.filter((a) => a.appliedAt !== null || RESPONSE_STATES.some((s) => reached(a, s)) || reached(a, "applied"));
  const responded = applied.filter((a) => RESPONSE_STATES.some((s) => reached(a, s)));
  const interviews = applied.filter((a) => reached(a, "interview") || reached(a, "offer"));
  const offers = applied.filter((a) => reached(a, "offer"));
  const rejected = applied.filter((a) => reached(a, "rejected"));

  const responseDays = responded
    .map((a) => {
      const first = a.events.filter((e) => e.toStatus && RESPONSE_STATES.includes(e.toStatus)).sort((x, y) => x.at.getTime() - y.at.getTime())[0];
      return first && a.appliedAt ? daysBetween(a.appliedAt, first.at) : null;
    })
    .filter((d): d is number => d !== null && d >= 0)
    .sort((x, y) => x - y);
  const median = responseDays.length >= 3 ? Math.round(responseDays[Math.floor(responseDays.length / 2)]! * 10) / 10 : null;

  const weekly: AnalyticsOutput["weekly"] = [];
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  for (let i = 7; i >= 0; i--) {
    const start = new Date(monday.getTime() - i * 7 * 86_400_000);
    const end = new Date(start.getTime() + 7 * 86_400_000);
    weekly.push({ weekStart: start.toISOString().slice(0, 10), applied: applied.filter((a) => a.appliedAt && a.appliedAt >= start && a.appliedAt < end).length });
  }

  const byFit = ["apply", "stretch", "skip"].map((v) => {
    const group = applied.filter((a) => a.verdict === v);
    return { verdict: v, applied: group.length, responded: group.filter((a) => responded.includes(a)).length };
  });
  const early = applied.filter((a) => a.appliedAt && a.jobPostedAt && daysBetween(a.jobPostedAt, a.appliedAt) <= 7);
  const late = applied.filter((a) => a.appliedAt && a.jobPostedAt && daysBetween(a.jobPostedAt, a.appliedAt) > 7);
  const byTiming = [
    { bucket: "Applied within 7 days of posting", applied: early.length, responded: early.filter((a) => responded.includes(a)).length },
    { bucket: "Applied later", applied: late.length, responded: late.filter((a) => responded.includes(a)).length },
  ];

  const insights: Insight[] = [];
  const responseRate = rate(responded.length, applied.length);
  if (applied.length === 0) {
    insights.push({ title: "No applications recorded yet", detail: "Mark roles as applied in the tracker and this page will start measuring your funnel.", strength: "insufficient" });
  } else if (responseRate.percent === null) {
    insights.push({ title: "Too early for rates", detail: `You have ${applied.length} recorded application${applied.length === 1 ? "" : "s"}. Percentages are shown from ${MIN_SAMPLE} onward, because a rate from fewer is noise.`, strength: "insufficient" });
  } else {
    insights.push({ title: `${responded.length} of ${applied.length} applications got a response`, detail: `That is ${responseRate.percent}%. A response is any recorded move to screening, interview, offer or rejection.`, strength: "observed" });
  }

  const strong = byFit.find((b) => b.verdict === "apply")!;
  const rest = byFit.filter((b) => b.verdict !== "apply").reduce((acc, b) => ({ applied: acc.applied + b.applied, responded: acc.responded + b.responded }), { applied: 0, responded: 0 });
  if (strong.applied >= MIN_SAMPLE && rest.applied >= MIN_SAMPLE) {
    const a = strong.responded / strong.applied;
    const b = rest.responded / rest.applied;
    if (Math.abs(a - b) >= 0.15) {
      insights.push({
        title: a > b ? "Strong-fit roles respond more often for you" : "Fit has not predicted responses for you so far",
        detail: `Strong fit: ${strong.responded} of ${strong.applied} responded. Other roles: ${rest.responded} of ${rest.applied}. These are small samples and show association only, not cause.`,
        strength: "tentative",
      });
    }
  } else if (applied.length >= MIN_SAMPLE) {
    insights.push({ title: "Not enough data to compare by fit", detail: `A comparison needs at least ${MIN_SAMPLE} applications in each group (strong fit: ${strong.applied}, others: ${rest.applied}).`, strength: "insufficient" });
  }
  if (early.length >= MIN_SAMPLE && late.length >= MIN_SAMPLE) {
    const a = byTiming[0]!.responded / early.length;
    const b = byTiming[1]!.responded / late.length;
    if (Math.abs(a - b) >= 0.15) insights.push({ title: a > b ? "Your early applications do better" : "Applying early has not helped you so far", detail: `Within 7 days of posting: ${byTiming[0]!.responded} of ${early.length} responded. Later: ${byTiming[1]!.responded} of ${late.length}. Small samples; association only.`, strength: "tentative" });
  }
  const last4 = weekly.slice(-4).map((w) => w.applied);
  if (applied.length >= 3 && last4.every((n) => n === 0)) insights.push({ title: "No applications in the last four weeks", detail: "Your pipeline has gone quiet. A steady weekly number tends to work better than bursts.", strength: "observed" });
  const stale = apps.filter((a) => a.status === "saved" && daysBetween(a.createdAt, now) > 14).length;
  if (stale >= 3) insights.push({ title: `${stale} saved roles are more than two weeks old`, detail: "Decide on each: apply or archive. Old saved roles are often already filled.", strength: "observed" });
  if (applied.length >= MIN_SAMPLE && interviews.length === 0 && responded.length >= 3) insights.push({ title: "Responses are not turning into interviews", detail: `${responded.length} responses and no interviews recorded. The resume audit and application kit are the places to look next.`, strength: "tentative" });

  const practice = { sessions: practiceScores.length, averageScore: practiceScores.length ? Math.round(practiceScores.reduce((a, b) => a + b, 0) / practiceScores.length) : null, latestScore: practiceScores.length ? practiceScores[practiceScores.length - 1]! : null };

  return {
    generatedAt: now.toISOString(),
    totals: { tracked: apps.length, saved: apps.filter((a) => a.status === "saved").length, applied: applied.length, responded: responded.length, interviews: interviews.length, offers: offers.length, rejected: rejected.length },
    funnel: [
      { stage: "Applied", count: applied.length },
      { stage: "Response", count: responded.length },
      { stage: "Interview", count: interviews.length },
      { stage: "Offer", count: offers.length },
    ],
    responseRate,
    interviewRate: rate(interviews.length, applied.length),
    medianDaysToResponse: median,
    weekly,
    byFit,
    byTiming,
    practice,
    insights,
  };
}

/** Career Analytics Agent: measure outcomes and say only what the sample size supports. */
export async function analyse(userId: string, opts: { now?: Date } = {}): Promise<AgentOutcome<AnalyticsOutput>> {
  const now = opts.now ?? new Date();
  const load = tool({
    name: "load_outcomes",
    description: "Load applications, their status history and stored fit verdicts.",
    input: z.object({ userId: z.string() }),
    run: async () => {
      const [apps, matches, sessions] = await Promise.all([
        db.application.findMany({ where: { userId }, include: { events: { select: { toStatus: true, at: true } }, job: { select: { postedAt: true } } } }),
        db.jobMatch.findMany({ where: { userId }, select: { jobId: true, verdict: true, computedAt: true }, orderBy: { computedAt: "asc" } }),
        db.interviewSession.findMany({ where: { userId, status: "completed" }, select: { summary: true }, orderBy: { completedAt: "asc" } }),
      ]);
      const verdictByJob = new Map(matches.map((m) => [m.jobId, m.verdict]));
      return {
        apps: apps.map((a) => ({ status: a.status, appliedAt: a.appliedAt, createdAt: a.createdAt, events: a.events, verdict: verdictByJob.get(a.jobId) ?? null, jobPostedAt: a.job.postedAt })),
        scores: sessions.map((s) => (s.summary as { overall?: number } | null)?.overall).filter((n): n is number => typeof n === "number"),
      };
    },
  });
  return runAgent({ agent: "career_analytics", userId, trigger: "analytics_view", input: {} }, async (run) => {
    const { apps, scores } = await run.call(load, { userId });
    const out = computeAnalytics(apps, scores, now);
    if (out.responseRate.percent === null) run.note(`Rates withheld: ${out.totals.applied} application(s) is below the minimum sample of ${MIN_SAMPLE}.`);
    return out;
  });
}
