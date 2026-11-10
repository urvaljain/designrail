/**
 * Evaluation harness: `npm run eval`.
 * Runs offline component checks on hand-labelled synthetic data, then scripted end-to-end
 * journeys against the database in DATABASE_URL, and writes docs/eval-results.md.
 * Every number in that file is computed here; none is typed in by hand.
 */
import { execSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { analyse } from "../src/lib/agents/analytics";
import { normalizeJob, syncSource } from "../src/lib/agents/discovery";
import { draftOutreach, planFollowUps, transitionDraft, verifyDraft } from "../src/lib/agents/followup";
import { startInterview, submitAnswer } from "../src/lib/agents/interview";
import { buildApplicationKit, groundImpliedSkills, ingestResume, verifyCoverNote } from "../src/lib/agents/resume-intel";
import { recommend } from "../src/lib/agents/strategy";
import { signUp } from "../src/lib/auth/core";
import { db } from "../src/lib/db";
import { evaluateAnswer, groundFeedback } from "../src/lib/interview/evaluate";
import { dedupeKey } from "../src/lib/jobs/dedupe";
import { freshness } from "../src/lib/jobs/freshness";
import { parseSalaryText } from "../src/lib/jobs/salary";
import { detectInjection } from "../src/lib/jobs/sanitize";
import { MockProvider, outage } from "../src/lib/llm/mock";
import { setProviderForTesting } from "../src/lib/llm/router";
import { estimateCostUsd } from "../src/lib/llm/types";
import { matchResumeToJob } from "../src/lib/match/score";
import { parseResume } from "../src/lib/resume/parse";
import { saveJob, setStatus } from "../src/lib/services/applications";
import { evaluateFit, rankJob, searchJobs } from "../src/lib/services/jobs";
import { buildRoadmap } from "../src/lib/services/roadmap";
import { fetchSource } from "../src/lib/sources/connectors";
import { DEDUPE_PAIRS, INJECTION_ATTACKS, INJECTION_BENIGN, PERSONAS, REQUIREMENT_LABELS, SALARY_CASES, SKILL_LABELS } from "./data";
import { ensureSources } from "../src/worker/handlers";

const NOW = new Date();
const pct = (n: number, d: number) => (d === 0 ? "n/a" : `${Math.round((n / d) * 1000) / 10}%`);
const quantile = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))]! : 0;
};
const lines: string[] = [];
const out = (s = "") => lines.push(s);
const results: Record<string, unknown> = {};

async function relevance() {
  const { jobs: raw } = await fetchSource("demo", "demo", null, { now: NOW });
  const jobs = raw.map((r) => normalizeJob(r, NOW)).flatMap((n) => ("job" in n ? [n.job] : []));
  const seen = new Set<string>();
  const unique = jobs.filter((j) => (seen.has(j.dedupeKey) ? false : (seen.add(j.dedupeKey), true)));
  const rows: { persona: string; top5: string[]; p3: number; ndcg5: number; top1: boolean }[] = [];
  for (const p of PERSONAS) {
    const resume = parseResume(p.resume, NOW);
    const ranked = unique
      .map((j) => {
        const fresh = freshness({ status: "open", postedAt: j.postedAt, firstSeenAt: NOW, lastVerifiedAt: NOW, verifyStatus: "listed_by_source" }, NOW);
        const match = matchResumeToJob(resume, j.requirements);
        const r = rankJob({ title: j.title, location: j.location, workMode: j.workMode, textRank: 0, integrityFlags: j.integrityFlags }, fresh, match, { resume, targetRoles: [], locations: [], remoteOk: true }, false, 0);
        return { id: j.externalId, rank: r.rank };
      })
      .sort((a, b) => b.rank - a.rank);
    const gain = (id: string) => p.relevance[id] ?? 0;
    const dcg = (ids: string[]) => ids.reduce((s, id, i) => s + (2 ** gain(id) - 1) / Math.log2(i + 2), 0);
    const ideal = Object.keys(p.relevance).sort((a, b) => gain(b) - gain(a)).slice(0, 5);
    const top5 = ranked.slice(0, 5).map((r) => r.id);
    rows.push({ persona: p.name, top5, p3: top5.slice(0, 3).filter((id) => gain(id) > 0).length / 3, ndcg5: dcg(top5) / dcg(ideal), top1: gain(top5[0]!) === 2 });
  }
  results.relevance = rows;
  out("## 1. Job recommendation relevance");
  out();
  out(`Ranking of the ${unique.length} de-duplicated demo listings for three synthetic personas, with no search query (the "for you" case). Relevance grades (2 = ideal, 1 = reasonable, 0 = not relevant) were hand-labelled before running.`);
  out();
  out("| Persona | Top result is the ideal role | Precision@3 | nDCG@5 | Top 5 |");
  out("| --- | --- | --- | --- | --- |");
  for (const r of rows) out(`| ${r.persona} | ${r.top1 ? "yes" : "no"} | ${r.p3.toFixed(2)} | ${r.ndcg5.toFixed(2)} | ${r.top5.join(", ")} |`);
  out();
  out(`Mean nDCG@5: **${(rows.reduce((s, r) => s + r.ndcg5, 0) / rows.length).toFixed(2)}**. Mean precision@3: **${(rows.reduce((s, r) => s + r.p3, 0) / rows.length).toFixed(2)}**.`);
  out();
}

function extraction() {
  let tp = 0, fp = 0, fn = 0, strengthOk = 0, strengthN = 0;
  const misses: string[] = [];
  for (const l of SKILL_LABELS) {
    const parsed = parseResume(l.resume, NOW);
    const got = new Map(parsed.skills.map((s) => [s.skillId, s.strength]));
    const want = new Map<string, string>([...l.demonstrated.map((s) => [s, "demonstrated"] as const), ...l.listed.map((s) => [s, "listed"] as const)]);
    for (const [id, strength] of want) {
      if (got.has(id)) {
        tp++;
        strengthN++;
        if (got.get(id) === strength) strengthOk++;
      } else {
        fn++;
        misses.push(`missed ${id}`);
      }
    }
    for (const id of got.keys()) if (!want.has(id)) { fp++; misses.push(`extra ${id}`); }
  }
  results.resumeSkills = { tp, fp, fn, strengthOk, strengthN, misses };
  out("## 2. Resume feedback accuracy");
  out();
  out(`Skill extraction on ${SKILL_LABELS.length} labelled synthetic resumes (${tp + fn} labelled skills).`);
  out();
  out(`- Precision: **${pct(tp, tp + fp)}** (${tp} correct of ${tp + fp} extracted)`);
  out(`- Recall: **${pct(tp, tp + fn)}** (${tp} found of ${tp + fn} labelled)`);
  out(`- Demonstrated-versus-listed classification correct: **${pct(strengthOk, strengthN)}** (${strengthOk} of ${strengthN})`);
  out(`- Evidence grounding: every extracted skill carries a verbatim resume line by construction; the unit suite asserts this for each fixture.`);
  if (misses.length) out(`- Errors: ${misses.join("; ")}`);
  out();

  let rtp = 0, rfp = 0, rfn = 0, impOk = 0, impN = 0;
  const rmiss: string[] = [];
  return fetchSource("demo", "demo", null, { now: NOW }).then(({ jobs }) => {
    for (const [id, label] of Object.entries(REQUIREMENT_LABELS)) {
      const raw = jobs.find((j) => j.externalId === id)!;
      const n = normalizeJob(raw, NOW);
      if (!("job" in n)) continue;
      const got = new Map(n.job.requirements.requirements.filter((r) => r.skillId).map((r) => [r.skillId!, r.importance]));
      const want = new Map<string, string>([...label.must.map((s) => [s, "must"] as const), ...label.nice.map((s) => [s, "nice"] as const)]);
      for (const [sid, imp] of want) {
        if (got.has(sid)) { rtp++; impN++; if (got.get(sid) === imp) impOk++; else rmiss.push(`${id}: ${sid} labelled ${imp}, got ${got.get(sid)}`); }
        else { rfn++; rmiss.push(`${id}: missed ${sid}`); }
      }
      for (const sid of got.keys()) if (!want.has(sid)) { rfp++; rmiss.push(`${id}: extra ${sid}`); }
    }
    results.requirements = { rtp, rfp, rfn, impOk, impN, rmiss };
    out(`Requirement extraction on ${Object.keys(REQUIREMENT_LABELS).length} labelled demo listings (${rtp + rfn} labelled requirements).`);
    out();
    out(`- Precision: **${pct(rtp, rtp + rfp)}** · Recall: **${pct(rtp, rtp + rfn)}** · Must-have versus nice-to-have correct: **${pct(impOk, impN)}**`);
    if (rmiss.length) out(`- Errors: ${rmiss.join("; ")}`);
    out();
  });
}

function guards() {
  const caught = INJECTION_ATTACKS.filter((a) => detectInjection(a).length > 0).length;
  const falsePos = INJECTION_BENIGN.filter((a) => detectInjection(a).length > 0);
  const missed = INJECTION_ATTACKS.filter((a) => detectInjection(a).length === 0);
  results.injection = { caught, attacks: INJECTION_ATTACKS.length, falsePositives: falsePos, missed };
  out("## 3. Prompt injection through job descriptions");
  out();
  out(`- Detection rate: **${pct(caught, INJECTION_ATTACKS.length)}** (${caught} of ${INJECTION_ATTACKS.length} attack sentences flagged)`);
  out(`- False-positive rate on benign job-description sentences: **${pct(falsePos.length, INJECTION_BENIGN.length)}** (${falsePos.length} of ${INJECTION_BENIGN.length})`);
  if (missed.length) out(`- Missed: ${missed.map((m) => `"${m}"`).join("; ")}`);
  if (falsePos.length) out(`- Falsely flagged: ${falsePos.map((m) => `"${m}"`).join("; ")}`);
  out("- Detection is a tripwire, not the defence. The defence is structural: job text is never sent to a model (integration test `never sends injected job text to a model`), requirements are extracted by rules from text with flagged sentences removed, and model output is verified against the resume.");
  out();

  // Hallucination guards: fabricated model outputs must be rejected, faithful ones accepted.
  const resume = parseResume(PERSONAS[0]!.resume, NOW);
  const job = { title: "Backend Engineer I", companyName: "Northwind Example Labs" };
  const base = "Hello, I am applying for the Backend Engineer I role at Northwind Example Labs. ";
  const fabricatedNotes = [
    "I have 7 years of experience building backend systems.",
    "I improved revenue by 300% at my last company.",
    "I am an expert in Kubernetes and Terraform.",
    "I led a team of 12 engineers.",
    "I hold a master's degree and I am a certified architect.",
    "I built machine learning models in PyTorch.",
    "I scaled our service to 2000000 users.",
    "I have deep Rust and Go experience.",
  ].map((s) => base + s + " Thank you, [Your name]");
  const faithfulNotes = [
    "I built a REST API in Node.js and TypeScript that serves shipment status to 3 internal tools.",
    "I reduced p95 response time by 40% by adding PostgreSQL indexes and Redis caching.",
    "I wrote 60 unit tests with Jest and added the suite to the GitHub Actions pipeline.",
    "I developed a React and Next.js web app with 400 registered users and deployed it with Docker on AWS.",
  ].map((s) => base + s + " Thank you, [Your name]");
  const noteBlocked = fabricatedNotes.filter((n) => verifyCoverNote(n, resume, job).length > 0).length;
  const noteFalse = faithfulNotes.filter((n) => verifyCoverNote(n, resume, job).length > 0).length;

  const fabSkills = [{ skillId: "kubernetes", quote: "Deployed 40 services to Kubernetes" }, { skillId: "leadership", quote: "Managed a team of ten engineers" }, { skillId: "llm", quote: "Fine-tuned large language models" }, { skillId: "kafka", quote: "Operated Kafka clusters at scale" }, { skillId: "security", quote: "Ran penetration tests on the API" }];
  const realSkills = [{ skillId: "leadership", quote: "Ran weekly lab sessions for 45 students" }, { skillId: "problem-solving", quote: "Reduced p95 response time by 40%" }, { skillId: "communication", quote: "graded algorithms assignments" }];
  const g = groundImpliedSkills(resume, { items: [...fabSkills, ...realSkills] });
  const skillBlocked = fabSkills.filter((f) => !g.kept.some((k) => k.skillId === f.skillId && k.quote === f.quote)).length;
  const skillKept = realSkills.filter((f) => g.kept.some((k) => k.quote === f.quote)).length;

  const answer = "During my internship I built a REST API in Node.js. As a result p95 response time fell by 40%.";
  const q = { id: "b", kind: "behavioral" as const, competency: "ownership", difficulty: 1 as const, text: "Tell me about a project.", rationale: "" };
  const rubric = evaluateAnswer(q, answer);
  const fb = groundFeedback(answer, rubric, { score: 100, strengths: [{ point: "a", quote: "I led a team of twelve" }, { point: "b", quote: "I won a national award" }, { point: "c", quote: "I built a REST API in Node.js" }, { point: "d", quote: "p95 response time fell by 40%" }], improvements: [{ point: "e", quote: "we failed the launch" }, { point: "f", quote: "I shipped it to a million users" }, { point: "g", quote: null }] });
  const fbBlocked = 4 - ((fb.evaluation?.strengths.filter((s) => ["a", "b"].includes(s.point)).length ?? 0) + (fb.evaluation?.improvements.filter((s) => ["e", "f"].includes(s.point)).length ?? 0));
  const fbKept = (fb.evaluation?.strengths.filter((s) => ["c", "d"].includes(s.point)).length ?? 0) + (fb.evaluation?.improvements.filter((s) => s.point === "g").length ?? 0);
  const scoreBounded = fb.evaluation ? fb.evaluation.score <= rubric.score + 20 : false;

  const allowed = "Hello, I applied for the Backend Engineer I role at Northwind Example Labs on 3 November.";
  const fabDrafts = ["Hi Priya, reach me at priya.recruiter@northwind.example", "Call me on +91 98765 43210 any time", "See https://bit.ly/my-portfolio for details", "I have 9 years of experience"];
  const draftBlocked = fabDrafts.filter((d) => verifyDraft(d, allowed).length > 0).length;
  const draftFalse = [allowed, "Hello, I applied for the Backend Engineer I role and wanted to follow up."].filter((d) => verifyDraft(d, allowed).length > 0).length;

  const fabTotal = fabricatedNotes.length + fabSkills.length + 4 + fabDrafts.length;
  const fabBlocked = noteBlocked + skillBlocked + fbBlocked + draftBlocked;
  const okTotal = faithfulNotes.length + realSkills.length + 3 + 2;
  const okKept = faithfulNotes.length - noteFalse + skillKept + fbKept + (2 - draftFalse);
  results.hallucination = { fabTotal, fabBlocked, okTotal, okKept, noteBlocked, skillBlocked, fbBlocked, draftBlocked, scoreBounded };
  out("## 4. Hallucinated experience and skills");
  out();
  out("Fabricated model outputs are fed to each grounding check; faithful outputs are fed alongside to measure false rejections.");
  out();
  out("| Check | Fabricated outputs blocked | Faithful outputs kept |");
  out("| --- | --- | --- |");
  out(`| Cover note (numbers, skills, seniority) | ${noteBlocked} of ${fabricatedNotes.length} | ${faithfulNotes.length - noteFalse} of ${faithfulNotes.length} |`);
  out(`| Implied resume skills (verbatim quote required) | ${skillBlocked} of ${fabSkills.length} | ${skillKept} of ${realSkills.length} |`);
  out(`| Interview feedback (quotes must be in the answer) | ${fbBlocked} of 4 | ${fbKept} of 3 |`);
  out(`| Outreach draft (no new contacts, links or figures) | ${draftBlocked} of ${fabDrafts.length} | ${2 - draftFalse} of 2 |`);
  out(`| **Total** | **${fabBlocked} of ${fabTotal} (${pct(fabBlocked, fabTotal)})** | **${okKept} of ${okTotal} (${pct(okKept, okTotal)})** |`);
  out();
  out(`A model score of 100 for a middling answer was ${scoreBounded ? "limited to the rubric band" : "NOT limited"} (rubric ${rubric.score}, returned ${fb.evaluation?.score ?? "n/a"}).`);
  out();

  const salOk = SALARY_CASES.filter((c) => {
    const r = parseSalaryText(c.text);
    if (r.status !== c.expect) return false;
    return r.status !== "employer_stated" || (r.salary.min === c.min && r.salary.max === c.max && r.salary.currency === c.currency);
  });
  const salWrong = SALARY_CASES.filter((c) => !salOk.includes(c)).map((c) => `"${c.text.replace(/\n/g, " / ")}" → ${parseSalaryText(c.text).status}`);
  const invented = SALARY_CASES.filter((c) => c.expect !== "employer_stated" && parseSalaryText(c.text).status === "employer_stated").length;
  const dupOk = DEDUPE_PAIRS.filter((p) => (dedupeKey(...p.a) === dedupeKey(...p.b)) === p.duplicate).length;
  results.salary = { correct: salOk.length, total: SALARY_CASES.length, invented, wrong: salWrong };
  results.dedupe = { correct: dupOk, total: DEDUPE_PAIRS.length };
  out("## 5. Salary and duplicates");
  out();
  out(`- Salary handling correct on **${salOk.length} of ${SALARY_CASES.length}** labelled strings. Cases where a figure was shown that the employer did not state or that should have been withheld: **${invented}**.`);
  if (salWrong.length) out(`- Wrong: ${salWrong.join("; ")}`);
  out(`- Duplicate keying correct on **${dupOk} of ${DEDUPE_PAIRS.length}** labelled listing pairs (4 reposts, 6 distinct roles).`);
  out("- Evident never estimates pay, so there is no estimate-accuracy metric to report. The relevant failure is showing a wrong figure as fact, counted above.");
  out();
}

async function journeys() {
  const errors = await ensureSources({ ...process.env, ENABLE_DEMO_SOURCE: "true", JOB_SOURCES: "" });
  if (errors.length) throw new Error(errors.join("; "));
  const demo = await db.source.findUniqueOrThrow({ where: { kind_slug: { kind: "demo", slug: "demo" } } });
  await syncSource(demo.id, { now: NOW, trigger: "eval" });
  const runStart = new Date();
  const N = 10;
  const stamp = Date.now().toString(36);
  const strong = "During my internship last summer our team needed faster APIs. I built a REST API in Node.js and TypeScript and I added PostgreSQL indexes and Redis caching. As a result p95 response time fell by 40% and 3 internal tools adopted it.";

  async function journey(i: number, mode: "rules" | "llm" | "outage") {
    const steps: string[] = [];
    const t0 = Date.now();
    try {
      const u = await signUp(`eval-${mode}-${stamp}-${i}@example.com`, "a-long-enough-password", `Eval ${i}`);
      if (!u.ok) throw new Error(u.error);
      const persona = PERSONAS[i % PERSONAS.length]!;
      await ingestResume(u.userId, "resume.txt", persona.resume, { now: NOW });
      steps.push("resume");
      const found = await searchJobs({}, u.userId, { now: NOW });
      const ideal = Object.entries(persona.relevance).find(([, g]) => g === 2)![0];
      const target = await db.job.findFirstOrThrow({ where: { sourceId: demo.id, externalId: ideal } });
      if (!found.jobs.slice(0, 5).some((j) => j.id === target.id)) throw new Error("ideal role not in top 5");
      steps.push("discover");
      const fit = await evaluateFit(u.userId, target.id);
      if (!fit || fit.match.verdict === "unknown" || fit.match.items.some((it) => (it.status === "demonstrated" || it.status === "listed") && it.evidence.length === 0)) throw new Error("fit missing evidence");
      steps.push("evaluate");
      const app = await saveJob(u.userId, target.id);
      const kit = await buildApplicationKit(u.userId, app.id);
      if (kit.output.coverNote.length < 80) throw new Error("kit incomplete");
      steps.push("prepare");
      await setStatus(u.userId, app.id, "applied", NOW);
      const plan = await planFollowUps(u.userId, { now: NOW });
      if (plan.output.created < 1) throw new Error("no reminder");
      const draft = await draftOutreach(u.userId, app.id, { purpose: "follow_up", channel: "email" });
      await transitionDraft(u.userId, draft.output.draftId, "approved");
      steps.push("track");
      const s = await startInterview(u.userId, { jobId: target.id, length: 3 });
      let done = false;
      for (const a of [strong, "I don't know", strong]) done = (await submitAnswer(u.userId, s.output.sessionId, a)).output.done;
      if (!done) throw new Error("interview did not complete");
      steps.push("practise");
      await recommend(u.userId, { now: NOW });
      await analyse(u.userId, { now: NOW });
      await buildRoadmap(u.userId, NOW);
      steps.push("insights");
      return { ok: true, ms: Date.now() - t0, steps, userId: u.userId };
    } catch (err) {
      return { ok: false, ms: Date.now() - t0, steps, error: err instanceof Error ? err.message : String(err), userId: null };
    }
  }

  const modes: Record<string, { completed: number; total: number; ms: number[]; errors: string[] }> = {};
  const userIds: string[] = [];
  const llm = () =>
    new MockProvider((req) => {
      if (req.task === "resume.implied_skills") return { items: [] };
      if (req.task === "application.cover_note") return { coverNote: /Role: (.*) at (.*)\n/.exec(req.prompt) ? `Hello,\n\nI am applying for the ${/Role: (.*) at (.*)\n/.exec(req.prompt)![1]} role at ${/Role: (.*) at (.*)\n/.exec(req.prompt)![2]}. My resume shows directly relevant project and internship work, and I would welcome the chance to discuss it.\n\nThank you,\n[Your name]` : "x" };
      if (req.task === "outreach.polish") return { body: /Edit this \w+ message:\n\n([\s\S]*)$/.exec(req.prompt)![1]! };
      return { score: 60, strengths: [], improvements: [{ point: "Add a measurable outcome.", quote: null }] };
    });
  for (const [mode, provider] of [["rules", null], ["llm", llm()], ["outage", outage()]] as const) {
    setProviderForTesting(provider);
    // Sequential first (clean latency), then concurrent (contention).
    const seq = [];
    for (let i = 0; i < N / 2; i++) seq.push(await journey(i, mode));
    const conc = await Promise.all(Array.from({ length: N / 2 }, (_, i) => journey(i + N / 2, mode)));
    const all = [...seq, ...conc];
    modes[mode] = { completed: all.filter((r) => r.ok).length, total: all.length, ms: all.map((r) => r.ms), errors: all.filter((r) => !r.ok).map((r) => `${r.steps.at(-1) ?? "start"} → ${r.error}`) };
    for (const r of all) if (r.userId) userIds.push(r.userId);
  }
  setProviderForTesting(null);

  const runs = await db.agentRun.findMany({ where: { createdAt: { gte: runStart }, OR: [{ userId: { in: userIds } }, { userId: null, trigger: "eval" }] }, select: { agent: true, status: true, latencyMs: true, inputTokens: true, outputTokens: true, provider: true } });
  const agents = [...new Set(runs.map((r) => r.agent))].sort();
  results.journeys = modes;
  out("## 6. End-to-end workflow completion");
  out();
  out(`Scripted journeys through the service layer: add resume → discover (ideal role must be in the top 5) → evaluate fit (every credited requirement must cite a resume line) → save and build the application kit → mark applied, get a reminder, draft and approve outreach → 3-question mock interview → recommendations, analytics and roadmap. ${N} synthetic users per mode: ${N / 2} one after another, then ${N / 2} at the same time.`);
  out();
  out("| Mode | Journeys completed | Median journey time | Slowest |");
  out("| --- | --- | --- | --- |");
  const label = { rules: "No model configured (rules only)", llm: "Scripted model (mock provider)", outage: "Model provider down" } as Record<string, string>;
  for (const [m, r] of Object.entries(modes)) out(`| ${label[m]} | **${r.completed} of ${r.total}** | ${quantile(r.ms, 0.5)} ms | ${Math.max(...r.ms)} ms |`);
  for (const [m, r] of Object.entries(modes)) if (r.errors.length) out(`\nFailures in "${label[m]}": ${r.errors.join("; ")}`);
  out();
  out("The browser-level version of this journey is `tests/e2e/journey.spec.ts`.");
  out();

  out("## 7. Agent task success rate and latency");
  out();
  out(`${runs.length} agent runs recorded in the audit log during this evaluation.`);
  out();
  out("| Agent | Runs | Succeeded | Succeeded with fallback | Failed | p50 latency | p95 latency |");
  out("| --- | --- | --- | --- | --- | --- | --- |");
  const agentRows: Record<string, unknown> = {};
  for (const a of agents) {
    const rs = runs.filter((r) => r.agent === a);
    const lat = rs.map((r) => r.latencyMs);
    const row = { runs: rs.length, ok: rs.filter((r) => r.status === "ok").length, degraded: rs.filter((r) => r.status === "degraded").length, failed: rs.filter((r) => r.status === "failed").length, p50: quantile(lat, 0.5), p95: quantile(lat, 0.95) };
    agentRows[a] = row;
    out(`| ${a} | ${row.runs} | ${row.ok} | ${row.degraded} | ${row.failed} | ${row.p50} ms | ${row.p95} ms |`);
  }
  const failed = runs.filter((r) => r.status === "failed").length;
  results.agents = agentRows;
  out();
  out(`Task success rate (completed, with or without fallback): **${pct(runs.length - failed, runs.length)}** (${runs.length - failed} of ${runs.length}). "Succeeded with fallback" means a model call failed or was rejected and the built-in rules produced the result; every such run is in the outage mode above.`);
  out("These latencies are local, single-machine measurements with no model round-trips. A live model adds its own latency per model-backed step.");
  out();

  const llmRuns = runs.filter((r) => r.provider === "mock");
  const inTok = llmRuns.reduce((s, r) => s + r.inputTokens, 0);
  const outTok = llmRuns.reduce((s, r) => s + r.outputTokens, 0);
  const per = (model: string) => estimateCostUsd(model, { inputTokens: inTok, outputTokens: outTok }) / Math.max(1, modes.llm!.completed);
  results.cost = { inTok, outTok, journeys: modes.llm!.completed, opus: per("claude-opus-5-5"), haiku: per("claude-haiku-5-5") };
  out("## 8. Estimated operating cost");
  out();
  out(`**Projection, not a measurement.** No live model was called in this environment. Token counts below are estimated from the prompts the system actually built (characters ÷ 4) across the ${modes.llm!.completed} scripted-model journeys: ${inTok.toLocaleString("en-US")} input and ${outTok.toLocaleString("en-US")} output tokens in total. Real output tokens will be higher, because the scripted replies are short and reasoning tokens are not counted.`);
  out();
  out("| Model (list price per million tokens, input / output) | Projected model cost per completed journey |");
  out("| --- | --- |");
  out(`| claude-opus-5-5 ($4 / $20) | $${per("claude-opus-5-5").toFixed(4)} |`);
  out(`| claude-haiku-5-5 ($0.10 / $0.50) | $${per("claude-haiku-5-5").toFixed(5)} |`);
  out();
  out("With no model configured, the marginal cost of a journey is database and compute time only.");
  out();

  const open = await db.job.findMany({ where: { sourceId: demo.id, status: "open" }, select: { duplicateOfId: true, postedAt: true, lastVerifiedAt: true, salaryStatus: true, integrityFlags: true, applyUrl: true } });
  const visible = open.filter((j) => !j.duplicateOfId);
  const verified = visible.filter((j) => j.lastVerifiedAt && NOW.getTime() - j.lastVerifiedAt.getTime() < 72 * 3_600_000).length;
  results.sources = { open: open.length, visible: visible.length, verified };
  out("## 9. Source verification");
  out();
  out(`Demo board after sync: ${open.length} open listings, ${open.length - visible.length} hidden as duplicates, ${visible.length} shown.`);
  out();
  out(`- Shown listings confirmed by their source within 72 hours: **${pct(verified, visible.length)}** (${verified} of ${visible.length})`);
  out(`- With a source-provided posting date: ${visible.filter((j) => j.postedAt).length} of ${visible.length} (the rest are labelled "first seen")`);
  out(`- Pay: ${visible.filter((j) => j.salaryStatus === "employer_stated").length} employer-stated, ${visible.filter((j) => j.salaryStatus === "rejected_implausible").length} withheld as implausible, ${visible.filter((j) => j.salaryStatus === "not_disclosed").length} not disclosed, 0 estimated`);
  out(`- With at least one integrity warning: ${visible.filter((j) => (j.integrityFlags as unknown[]).length > 0).length} of ${visible.length}`);
  out(`- With an https application link on the source's own domain: ${visible.filter((j) => j.applyUrl.startsWith("https://")).length} of ${visible.length}`);
  out();
}

async function main() {
  let commit = "unknown";
  try {
    commit = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  } catch {
    /* not a git checkout */
  }
  out("# Evaluation results");
  out();
  out(`_Generated by \`npm run eval\` on ${NOW.toISOString()} at commit \`${commit}\`. Do not edit by hand: rerun the command._`);
  out();
  out("All data is synthetic and hand-labelled (see `evals/data.ts`). Sample sizes are small and are stated next to every figure. No live model and no real user was involved.");
  out();
  out("**In-sample caveat.** Earlier runs of this harness exposed defects (two injection false positives, a skill alias matching inside \"Node.js\", over-generic aliases, a must-have cue read as optional) that were then fixed. The figures below are measured after those fixes on the same data, so they overstate how the rules would do on unseen text. `docs/08-evaluation-report.md` lists what changed and the out-of-sample checks that exist.");
  out();
  await relevance();
  await extraction();
  guards();
  await journeys();
  mkdirSync(path.join(import.meta.dirname, "out"), { recursive: true });
  writeFileSync(path.join(import.meta.dirname, "out", "results.json"), JSON.stringify(results, null, 2));
  writeFileSync(path.join(import.meta.dirname, "..", "docs", "eval-results.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
