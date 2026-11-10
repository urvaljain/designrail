import { db, json } from "../db";
import type { JobRequirements } from "../jobs/requirements";
import { matchResumeToJob } from "../match/score";
import type { ParsedResume } from "../resume/parse";
import { skillById, type SkillCategory } from "../taxonomy";
import { truncate } from "../text";
import { loadUserContext, searchJobs } from "./jobs";

export interface GapRow {
  skillId: string;
  name: string;
  category: SkillCategory;
  status: "missing" | "related" | "listed";
  /** How many target roles ask for it, and how many of those as a must-have. */
  demand: number;
  mustHave: number;
  examples: { company: string; title: string; quote: string }[];
  priority: number;
}

export interface RoadmapStep {
  week: number;
  skillId: string;
  name: string;
  why: string;
  goal: string;
  tasks: string[];
  evidenceToProduce: string;
  hours: number;
}

export interface RoadmapContent {
  generatedAt: string;
  basis: { jobs: number; from: "saved_roles" | "top_matches"; resume: boolean };
  gaps: GapRow[];
  covered: { name: string; demand: number }[];
  steps: RoadmapStep[];
  notes: string[];
}

const PLAN: Record<SkillCategory, { hours: number; tasks: (s: string) => string[]; evidence: (s: string) => string }> = {
  language: { hours: 12, tasks: (s) => [`Work through the core syntax and standard library of ${s} with small exercises.`, `Rewrite one of your existing small projects, or one module of it, in ${s}.`, `Solve ten short problems in ${s} and time yourself.`], evidence: (s) => `A project line on your resume naming ${s} and what the code does.` },
  frontend: { hours: 12, tasks: (s) => [`Build one small, complete interface with ${s}: a list, a form with validation, and a loading and error state.`, `Make it keyboard-accessible and responsive at phone width.`, `Deploy it and write down one measurable fact about it (load time, Lighthouse score, number of screens).`], evidence: (s) => `A deployed project you can link, with a resume line that names ${s} and one result.` },
  backend: { hours: 14, tasks: (s) => [`Build a small service with ${s} that exposes three endpoints backed by a database.`, `Add input validation, error handling and five automated tests.`, `Measure one thing (response time or requests per second) before and after a change you make.`], evidence: (s) => `A repository with tests, and a resume line naming ${s} with the measurement.` },
  data: { hours: 10, tasks: (s) => [`Pick a public dataset and answer three specific questions with ${s}.`, `Write up the method and one finding in a page, including what you are unsure about.`, `Have someone else read it and fix whatever they could not follow.`], evidence: (s) => `A short write-up or notebook you can share, and a resume line naming ${s} and the finding.` },
  ml: { hours: 16, tasks: (s) => [`Train one model end to end using ${s} on a small public dataset.`, `Report a baseline, your result and how you validated it.`, `Write down one thing that did not work and why.`], evidence: (s) => `A notebook or repository with results, and a resume line naming ${s} and the metric you reached.` },
  cloud: { hours: 10, tasks: (s) => [`Take a project you already have and run it using ${s}.`, `Write the setup as a script or config file, not manual steps.`, `Break it on purpose once and note how you found and fixed the fault.`], evidence: (s) => `A working config in a repository, and a resume line naming ${s} and what it runs.` },
  foundations: { hours: 14, tasks: (s) => [`Review the core ideas of ${s} and write a one-page summary in your own words.`, `Practise fifteen questions, explaining each answer aloud.`, `Do one mock interview on Evident focused on ${s} and review the feedback.`], evidence: (s) => `Mock interview scores above 70 on ${s} questions.` },
  product: { hours: 8, tasks: (s) => [`Apply ${s} to a real product you use: write a one-page document.`, `Talk to three users or classmates to test one assumption in it.`, `Revise the document with what you learned and note what changed.`], evidence: (s) => `A one-page artefact you can share, and a resume line describing how you used ${s}.` },
  design: { hours: 10, tasks: (s) => [`Complete one small design exercise using ${s}, from problem statement to final screens.`, `Test it with three people and record what confused them.`, `Write a short case study: problem, process, outcome.`], evidence: (s) => `A portfolio case study that shows ${s} in use.` },
  business: { hours: 8, tasks: (s) => [`Do one small, real piece of work with ${s} for a club, a friend's business or your own project.`, `Track one number before and after.`, `Write three sentences on what you did and what changed.`], evidence: (s) => `A resume line naming ${s} with the before-and-after number.` },
  soft: { hours: 4, tasks: (s) => [`Write down two specific past situations that show ${s}.`, `Practise telling each in under two minutes: situation, what you did, result.`, `Use one in a mock interview on Evident and review the feedback.`], evidence: (s) => `Two rehearsed examples, and one resume line that shows ${s} through an action and a result.` },
};

/**
 * Skill-gap analysis across the roles a user is actually targeting, and a week-by-week plan
 * to close the gaps that matter most. Demand counts come from real listings in the database.
 */
export async function buildRoadmap(userId: string, now: Date = new Date()): Promise<RoadmapContent> {
  const ctx = await loadUserContext(userId);
  const notes: string[] = [];
  let jobs = (await db.application.findMany({ where: { userId, status: { in: ["saved", "applied", "screening", "interview"] } }, include: { job: true } })).map((a) => a.job);
  let from: RoadmapContent["basis"]["from"] = "saved_roles";
  if (jobs.length < 3) {
    const top = await searchJobs({}, userId, { now, limit: 12 });
    const extra = await db.job.findMany({ where: { id: { in: top.jobs.map((j) => j.id) } } });
    jobs = [...new Map([...jobs, ...extra].map((j) => [j.id, j])).values()];
    from = "top_matches";
    notes.push("You have fewer than three saved roles, so this analysis also uses the open roles ranked highest for you. Save the roles you care about to make it specific.");
  }
  const resume: ParsedResume | null = ctx.resume;
  if (!resume) notes.push("No readable resume on file. Every required skill is shown as a gap until you add one.");

  const agg = new Map<string, GapRow & { statuses: string[] }>();
  const covered = new Map<string, number>();
  for (const job of jobs) {
    const reqs = job.requirements as unknown as JobRequirements;
    const items = resume
      ? matchResumeToJob(resume, reqs).items
      : reqs.requirements.map((r) => ({ requirement: r, status: "missing" as const }));
    for (const item of items) {
      const sid = item.requirement.skillId;
      if (!sid) continue;
      const skill = skillById(sid);
      if (!skill) continue;
      if (item.status === "demonstrated") {
        covered.set(skill.name, (covered.get(skill.name) ?? 0) + 1);
        continue;
      }
      if (item.status === "unverifiable") continue;
      const row = agg.get(sid) ?? { skillId: sid, name: skill.name, category: skill.category, status: "missing" as const, demand: 0, mustHave: 0, examples: [], priority: 0, statuses: [] };
      row.demand++;
      if (item.requirement.importance === "must") row.mustHave++;
      row.statuses.push(item.status);
      if (row.examples.length < 2) row.examples.push({ company: job.companyName, title: job.title, quote: truncate(item.requirement.quote, 140) });
      agg.set(sid, row);
    }
  }
  const severity = { missing: 1, related: 0.6, listed: 0.4 } as const;
  const gaps: GapRow[] = [...agg.values()]
    .map(({ statuses, ...row }) => {
      const status = statuses.includes("missing") ? "missing" : statuses.includes("related") ? "related" : "listed";
      return { ...row, status: status as GapRow["status"], priority: Math.round((row.mustHave * 3 + (row.demand - row.mustHave)) * severity[status as keyof typeof severity] * 10) / 10 };
    })
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  const steps: RoadmapStep[] = [];
  let week = 1;
  let hoursThisWeek = 0;
  for (const g of gaps.slice(0, 6)) {
    const plan = PLAN[g.category];
    if (hoursThisWeek > 0 && hoursThisWeek + plan.hours > 16) {
      week++;
      hoursThisWeek = 0;
    }
    hoursThisWeek += plan.hours;
    const why = `${g.demand} of your ${jobs.length} target roles ask for ${g.name}${g.mustHave ? `, ${g.mustHave} as a must-have` : ""}. ${g.status === "listed" ? "Your resume lists it but shows no use of it." : g.status === "related" ? "Your resume shows a related skill, not this one." : "Your resume does not mention it."}`;
    steps.push({
      week,
      skillId: g.skillId,
      name: g.name,
      why,
      goal: g.status === "listed" ? `Turn ${g.name} from a listed skill into a demonstrated one.` : `Get to working knowledge of ${g.name} and produce proof.`,
      tasks: plan.tasks(g.name),
      evidenceToProduce: plan.evidence(g.name),
      hours: g.status === "listed" ? Math.ceil(plan.hours / 2) : plan.hours,
    });
  }
  if (gaps.length === 0 && jobs.length > 0) notes.push("No skill gaps were found against your target roles. Use interview practice to pressure-test the skills you already show.");
  notes.push("Hours are rough planning estimates, not measurements. Evident does not recommend specific paid courses.");

  const content: RoadmapContent = {
    generatedAt: now.toISOString(),
    basis: { jobs: jobs.length, from, resume: Boolean(resume) },
    gaps: gaps.slice(0, 15),
    covered: [...covered.entries()].map(([name, demand]) => ({ name, demand })).sort((a, b) => b.demand - a.demand).slice(0, 10),
    steps,
    notes,
  };
  await db.roadmap.upsert({ where: { userId_scope: { userId, scope: "portfolio" } }, create: { userId, scope: "portfolio", content: json(content) }, update: { content: json(content), createdAt: now } });
  return content;
}
