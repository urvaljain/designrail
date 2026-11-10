import { findSkills } from "../taxonomy";
import { clamp, truncate } from "../text";
import type { Question } from "./bank";

export interface Evaluation {
  score: number;
  source: "llm" | "deterministic";
  dimensions: { name: string; score: number; note: string }[];
  /** Each strength quotes the part of the answer it rests on. */
  strengths: { point: string; quote: string }[];
  /** Each improvement quotes the answer, or is null when the problem is something missing. */
  improvements: { point: string; quote: string | null }[];
  coverage: { point: string; hit: boolean }[];
  flags: string[];
}

const NON_ANSWER = /^\s*(i\s+(do not|don't|dont)\s+know|no idea|not sure|idk|skip|pass|n\/?a|nothing)\b[\s.!]*$/i;
const SITUATION = /\b(when i|while i|during|at my|in my (internship|project|course|team|role|final year|second year|third year)|last (year|semester|summer|month)|our team|we were|i was (working|interning|leading|part)|the project was|for a (class|client|course|hackathon))\b/i;
const TASK = /\b(needed to|had to|goal was|was responsible|my (task|job|role) was|was asked|the challenge|the problem was|we wanted|deadline)\b/i;
const ACTION = /\bI\s+(?:then\s+|first\s+|also\s+)?(\w+ed|built|led|wrote|ran|made|took|set|chose|found|drew|spoke|began|did|gave|kept|taught|sat|went|broke|split|cut)\b/;
const RESULT = /\b(as a result|result(ed)?|led to|which (reduced|increased|improved|cut|saved)|reduced|increased|improved|saved|grew|shipped|launched|won|learned that|outcome|ended up|in the end|finally)\b|\d+\s?(%|percent|x\b|users|hours|days|ms|minutes|people)/i;
const METRIC = /\d+(\.\d+)?\s?(%|percent|x\b|k\b|ms\b|users?|customers?|hours?|days?|weeks?|minutes?|people|students|requests?|rows|tests?)/i;
const HEDGE = /\b(i (guess|think maybe|suppose)|kind of|sort of|probably|maybe|i'm not sure|not really sure)\b/gi;

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
}
function firstMatch(sents: string[], re: RegExp): string | null {
  const s = sents.find((x) => re.test(x));
  return s ? truncate(s, 180) : null;
}

/**
 * Rubric scoring. Deterministic by design: the same answer always gets the same score, the
 * score cannot be talked up by text inside the answer, and every comment points at a quote
 * from the answer or at something concretely absent from it.
 */
export function evaluateAnswer(q: Question, answerRaw: string): Evaluation {
  const answer = answerRaw.trim();
  const sents = sentences(answer);
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const strengths: Evaluation["strengths"] = [];
  const improvements: Evaluation["improvements"] = [];
  const dimensions: Evaluation["dimensions"] = [];
  const flags: string[] = [];

  if (wordCount < 6 || NON_ANSWER.test(answer)) {
    return {
      score: wordCount === 0 ? 0 : 5,
      source: "deterministic",
      dimensions: [{ name: "Substance", score: 0, note: "No substantive answer was given." }],
      strengths: [],
      improvements: [{ point: q.kind === "concept" ? "If you do not know, say what you do know and reason from there. Interviewers credit partial reasoning." : "Give a specific example, even a small one from coursework or a personal project.", quote: null }],
      coverage: (q.expects ?? []).map((e) => ({ point: e.point, hit: false })),
      flags: ["no_answer"],
    };
  }

  const lower = answer.toLowerCase();
  const lengthScore = wordCount < 25 ? 30 : wordCount < 50 ? 65 : wordCount <= 260 ? 100 : wordCount <= 400 ? 75 : 50;
  if (wordCount < 25) improvements.push({ point: `At ${wordCount} words this is too brief to show depth. Aim for 60 to 200 words.`, quote: null });
  if (wordCount > 400) improvements.push({ point: `At ${wordCount} words this would run long in an interview. Lead with the answer, then one example.`, quote: null });

  const metricQuote = firstMatch(sents, METRIC);
  const toolHits = [...new Set(findSkills(answer).map((h) => h.text))];
  const iCount = (answer.match(/\bI\b/g) ?? []).length;
  const weCount = (answer.match(/\bwe\b/gi) ?? []).length;
  let specificity = 20 + (metricQuote ? 35 : 0) + Math.min(30, toolHits.length * 10) + (iCount >= 2 ? 15 : 0);
  specificity = clamp(specificity, 0, 100);
  if (metricQuote) strengths.push({ point: "Gives a concrete, measurable detail.", quote: metricQuote });
  else improvements.push({ point: "No numbers or measurable outcome. Add one concrete figure if you have it (how many, how much, how long).", quote: null });
  if (weCount > iCount * 2 && weCount >= 3) improvements.push({ point: `You say "we" ${weCount} times and "I" ${iCount} times. Make your own contribution explicit.`, quote: firstMatch(sents, /\bwe\b/i) });
  const hedges = answer.match(HEDGE) ?? [];
  if (hedges.length >= 3) improvements.push({ point: `Hedging phrases ("${hedges[0]}") appear ${hedges.length} times and undercut otherwise sound points.`, quote: firstMatch(sents, HEDGE) });

  let coverage: Evaluation["coverage"] = [];
  let score: number;

  if (q.kind === "concept" && q.expects && q.expects.length > 0) {
    coverage = q.expects.map((e) => ({ point: e.point, hit: e.keywords.some((k) => lower.includes(k)) }));
    const hit = coverage.filter((c) => c.hit).length;
    const cov = (hit / coverage.length) * 100;
    dimensions.push({ name: "Coverage", score: Math.round(cov), note: `${hit} of ${coverage.length} expected points addressed.` });
    for (const c of coverage.filter((x) => !x.hit).slice(0, 3)) improvements.push({ point: `Not covered: ${c.point}.`, quote: null });
    for (const e of q.expects) {
      const kw = e.keywords.find((k) => lower.includes(k));
      if (kw) {
        const s = sents.find((x) => x.toLowerCase().includes(kw));
        if (s && strengths.length < 4) strengths.push({ point: `Covers: ${e.point}.`, quote: truncate(s, 180) });
      }
    }
    score = 0.65 * cov + 0.2 * specificity + 0.15 * lengthScore;
  } else {
    const s = firstMatch(sents, SITUATION) ?? firstMatch(sents, TASK);
    const a = firstMatch(sents, ACTION);
    const r = firstMatch(sents, RESULT);
    const structure = (s ? 30 : 0) + (a ? 40 : 0) + (r ? 30 : 0);
    dimensions.push({ name: "Structure", score: structure, note: `Situation ${s ? "present" : "missing"}, action ${a ? "present" : "missing"}, result ${r ? "present" : "missing"}.` });
    if (a) strengths.push({ point: "States what you personally did.", quote: a });
    else improvements.push({ point: "No sentence says what you personally did. Use \"I\" with a concrete action.", quote: null });
    if (r) strengths.push({ point: "States an outcome.", quote: r });
    else improvements.push({ point: "No outcome is stated. End with what happened as a result.", quote: null });
    if (!s) improvements.push({ point: "Set the scene in one sentence: where and when this happened.", quote: null });

    let relevance = 60;
    if (q.kind === "gap" || q.kind === "deep_dive") {
      const topic = q.competency.toLowerCase().split(/[\s/&]+/).filter((w) => w.length > 2);
      const onTopic = topic.some((w) => lower.includes(w)) || toolHits.length > 0;
      relevance = onTopic ? 100 : 30;
      if (!onTopic) {
        flags.push("off_topic");
        improvements.push({ point: `The answer never mentions ${q.competency}, which is what was asked about.`, quote: null });
      }
    }
    if (q.kind === "gap" && /\b(expert|mastered|years of experience|extensive experience|deep experience)\b/i.test(answer)) {
      flags.push("overclaim");
      improvements.push({ point: "This claims deep experience in a skill your resume does not show. In a real interview that invites follow-up questions you may not be able to answer. Describe honest, related experience instead.", quote: firstMatch(sents, /\b(expert|mastered|years of experience|extensive experience|deep experience)\b/i) });
      relevance = Math.min(relevance, 40);
    }
    dimensions.push({ name: "Relevance", score: relevance, note: relevance >= 60 ? "Addresses the question." : "Does not address what was asked." });
    score = 0.4 * structure + 0.3 * specificity + 0.15 * relevance + 0.15 * lengthScore;
  }
  dimensions.push({ name: "Specificity", score: specificity, note: `${metricQuote ? "Includes" : "No"} measurable detail; ${toolHits.length} named tool(s) or skill(s).` });
  dimensions.push({ name: "Length", score: lengthScore, note: `${wordCount} words.` });

  return { score: Math.round(clamp(score, 0, 100)), source: "deterministic", dimensions, strengths: strengths.slice(0, 4), improvements: improvements.slice(0, 5), coverage, flags };
}

/** Keep only model feedback whose quotes really are in the answer, and bound its score by the rubric. */
export function groundFeedback(answer: string, rubric: Evaluation, proposed: { score: number; strengths: { point: string; quote: string }[]; improvements: { point: string; quote: string | null }[] }): { evaluation: Evaluation | null; problems: string[] } {
  const hay = answer.replace(/\s+/g, " ").toLowerCase();
  const has = (q: string) => hay.includes(q.replace(/\s+/g, " ").toLowerCase().replace(/[.…]+$/, ""));
  const problems: string[] = [];
  const strengths = proposed.strengths.filter((s) => {
    const ok = s.quote.trim().length >= 8 && has(s.quote);
    if (!ok) problems.push(`strength "${truncate(s.point, 60)}" cited text that is not in the answer`);
    return ok;
  });
  const improvements = proposed.improvements.filter((s) => {
    const ok = s.quote === null || (s.quote.trim().length >= 4 && has(s.quote));
    if (!ok) problems.push(`improvement "${truncate(s.point, 60)}" cited text that is not in the answer`);
    return ok;
  });
  if (strengths.length + improvements.length === 0) return { evaluation: null, problems: [...problems, "no grounded feedback remained"] };
  const bounded = clamp(Math.round(proposed.score), rubric.score - 20, rubric.score + 20);
  if (bounded !== Math.round(proposed.score)) problems.push(`model score ${Math.round(proposed.score)} was outside the rubric band and was limited to ${bounded}`);
  return { evaluation: { ...rubric, source: "llm", score: clamp(bounded, 0, 100), strengths: strengths.slice(0, 4), improvements: improvements.slice(0, 5) }, problems };
}
