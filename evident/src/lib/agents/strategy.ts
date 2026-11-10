import { z } from "zod";
import { db } from "../db";
import { freshness } from "../jobs/freshness";
import type { JobRequirements } from "../jobs/requirements";
import type { IntegrityFlag } from "../jobs/sanitize";
import { matchResumeToJob, type MatchResult } from "../match/score";
import { loadUserContext, searchJobs } from "../services/jobs";
import { runAgent, tool, type AgentOutcome } from "./runtime";

export type Action = "apply_now" | "tailor_then_apply" | "follow_up" | "prepare_interview" | "review" | "archive";

export interface Recommendation {
  jobId: string;
  applicationId: string | null;
  title: string;
  companyName: string;
  action: Action;
  priority: number;
  /** Each reason names the fact it rests on. */
  reasons: string[];
  /** What the agent is unsure about, or null. */
  uncertainty: string | null;
}

export interface StrategyOutput {
  generatedAt: string;
  recommendations: Recommendation[];
  observations: string[];
  basis: { hasResume: boolean; applications: number; candidates: number };
}

export const ACTION_LABEL: Record<Action, string> = {
  apply_now: "Apply now",
  tailor_then_apply: "Tailor, then apply",
  follow_up: "Follow up",
  prepare_interview: "Prepare for the interview",
  review: "Worth a look",
  archive: "Archive",
};

interface Candidate {
  jobId: string;
  applicationId: string | null;
  status: string | null;
  title: string;
  companyName: string;
  jobStatus: string;
  match: MatchResult | null;
  fresh: ReturnType<typeof freshness>;
  flags: IntegrityFlag[];
  reminderDue: boolean;
}

/** Pure prioritisation. The same inputs always produce the same advice and the same reasons. */
export function prioritise(c: Candidate): Recommendation | null {
  const reasons: string[] = [];
  let action: Action;
  let priority = 0;
  const m = c.match;
  const fit = m && m.verdict !== "unknown" ? m.score : null;
  const serious = c.flags.filter((f) => ["prompt_injection", "hidden_text", "contact_details_in_description", "level_experience_conflict", "work_mode_conflict"].includes(f.code));

  if (c.status === "interview") {
    action = "prepare_interview";
    priority = 95;
    reasons.push("You have marked this application as being at the interview stage.");
    if (m && m.gaps.length > 0) reasons.push(`Expect questions on ${m.gaps.slice(0, 3).join(", ")}: the role asks for them and your resume does not show them.`);
  } else if (c.status === "applied" || c.status === "screening") {
    if (!c.reminderDue) return null;
    action = "follow_up";
    priority = 70;
    reasons.push("A follow-up reminder for this application is due.");
  } else if (c.status === "saved" && c.jobStatus === "closed") {
    action = "archive";
    priority = 40;
    reasons.push("The source no longer lists this role.");
  } else if (c.status === "saved" || c.status === null) {
    if (fit === null) {
      if (c.status === null) return null;
      action = "review";
      priority = 30;
      reasons.push(m ? "There is too little information in this listing for a fit assessment." : "Upload a resume to get a fit assessment for this role.");
    } else if (m!.verdict === "apply") {
      action = c.status === "saved" ? "apply_now" : "review";
      priority = 55 + fit * 0.3 + c.fresh.weight * 15;
      reasons.push(`Fit ${fit}/100: your resume shows evidence for ${m!.strengths.length} requirement(s)${m!.strengths.length ? ` (${m!.strengths.slice(0, 3).join(", ")})` : ""}.`);
    } else if (m!.verdict === "stretch") {
      action = c.status === "saved" ? "tailor_then_apply" : "review";
      priority = 35 + fit * 0.3 + c.fresh.weight * 10;
      reasons.push(`Fit ${fit}/100: partial match.`);
      if (m!.gaps.length) reasons.push(`No evidence on your resume for ${m!.gaps.slice(0, 3).join(", ")}.`);
    } else {
      if (c.status === null) return null;
      action = "archive";
      priority = 20;
      reasons.push(`Fit ${fit}/100: most must-have requirements have no evidence on your resume.`);
    }
    if (action !== "archive") {
      if (c.fresh.state === "fresh") reasons.push(`${c.fresh.label}. Early applications are more likely to be read.`);
      if (c.fresh.state === "stale") {
        reasons.push(`${c.fresh.label}. It may already be filled.`);
        priority -= 10;
      }
    }
  } else {
    return null;
  }

  if (serious.length > 0 && action !== "archive") {
    priority -= 20;
    reasons.push(`Integrity warning: ${serious[0]!.detail}`);
  }
  if (m?.experience.status === "below" && action !== "archive") reasons.push(`It asks for ${m.experience.requiredYears}+ years; your resume shows about ${m.experience.candidateYears}.`);

  let uncertainty: string | null = null;
  if (m && m.verdict !== "unknown" && m.confidence !== "high") uncertainty = `${m.confidence === "low" ? "Low" : "Medium"} confidence: ${m.cautions[0] ?? "the listing gives few checkable requirements."}`;
  if (c.fresh.basis === "first_seen" && c.status !== "interview") uncertainty = [uncertainty, "The source gives no posting date, so age is measured from when Evident first saw it."].filter(Boolean).join(" ");

  return { jobId: c.jobId, applicationId: c.applicationId, title: c.title, companyName: c.companyName, action, priority: Math.round(Math.max(0, Math.min(100, priority))), reasons, uncertainty };
}

/** Application Strategy Agent: what to do next across saved roles and new matches, with reasons. */
export async function recommend(userId: string, opts: { now?: Date; trigger?: string } = {}): Promise<AgentOutcome<StrategyOutput>> {
  const now = opts.now ?? new Date();
  const loadApps = tool({
    name: "load_pipeline",
    description: "Load the user's active applications, their jobs and pending reminders.",
    input: z.object({ userId: z.string() }),
    run: async () => db.application.findMany({ where: { userId, status: { in: ["saved", "applied", "screening", "interview"] } }, include: { job: true, reminders: { where: { status: "pending", dueAt: { lte: now } }, take: 1 } } }),
  });
  const discover = tool({
    name: "discover_matches",
    description: "Find open, unsaved listings ranked for this user.",
    input: z.object({ limit: z.number().int().min(1).max(50) }),
    run: async (i) => (await searchJobs({}, userId, { now, limit: i.limit })).jobs,
  });

  return runAgent({ agent: "application_strategy", userId, trigger: opts.trigger ?? "dashboard", input: {} }, async (run) => {
    const ctx = await loadUserContext(userId);
    const apps = await run.call(loadApps, { userId });
    const candidates: Candidate[] = apps.map((a) => ({
      jobId: a.jobId,
      applicationId: a.id,
      status: a.status,
      title: a.job.title,
      companyName: a.job.companyName,
      jobStatus: a.job.status,
      match: ctx.resume ? matchResumeToJob(ctx.resume, a.job.requirements as unknown as JobRequirements) : null,
      fresh: freshness(a.job, now),
      flags: (a.job.integrityFlags as unknown as IntegrityFlag[]) ?? [],
      reminderDue: a.reminders.length > 0,
    }));

    const saved = new Set(apps.map((a) => a.jobId));
    const allApps = await db.application.findMany({ where: { userId }, select: { jobId: true, status: true } });
    for (const a of allApps) saved.add(a.jobId);
    if (ctx.resume) {
      const found = await run.call(discover, { limit: 25 });
      const jobs = await db.job.findMany({ where: { id: { in: found.filter((f) => !saved.has(f.id)).slice(0, 12).map((f) => f.id) } } });
      for (const j of jobs) {
        candidates.push({ jobId: j.id, applicationId: null, status: null, title: j.title, companyName: j.companyName, jobStatus: j.status, match: matchResumeToJob(ctx.resume, j.requirements as unknown as JobRequirements), fresh: freshness(j, now), flags: (j.integrityFlags as unknown as IntegrityFlag[]) ?? [], reminderDue: false });
      }
    } else {
      run.note("No readable resume on file, so fit could not be assessed and no new roles were suggested.");
    }

    const recommendations = candidates.map(prioritise).filter((r): r is Recommendation => r !== null).sort((a, b) => b.priority - a.priority).slice(0, 10);

    const observations: string[] = [];
    if (!ctx.resume) observations.push("Add a resume to get fit assessments. Without one, recommendations rest only on freshness and your saved roles.");
    const applied = allApps.filter((a) => a.status !== "saved").length;
    const savedOnly = allApps.filter((a) => a.status === "saved").length;
    if (savedOnly >= 5 && applied === 0) observations.push(`You have saved ${savedOnly} roles and applied to none. Pick the top two below and apply this week.`);
    const weak = candidates.filter((c) => c.status === "applied" && c.match?.verdict === "skip").length;
    if (weak >= 3) observations.push(`${weak} of your open applications are weak fits by resume evidence. Narrowing to roles where your evidence is strong may raise your response rate.`);
    if (recommendations.length === 0) observations.push("Nothing needs your attention right now. Search for roles to build your pipeline.");

    return { generatedAt: now.toISOString(), recommendations, observations, basis: { hasResume: Boolean(ctx.resume), applications: allApps.length, candidates: candidates.length } };
  });
}
