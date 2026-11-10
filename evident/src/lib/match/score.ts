import type { JobRequirements, Requirement } from "../jobs/requirements";
import type { ParsedResume, SkillEvidence } from "../resume/parse";
import { sameFamily, skillById } from "../taxonomy";

export type ItemStatus = "demonstrated" | "listed" | "related" | "missing" | "unverifiable";

export interface MatchItem {
  requirement: Requirement;
  status: ItemStatus;
  /** Resume lines that support the status. Empty for "missing" and "unverifiable". */
  evidence: SkillEvidence[];
  note: string;
}

export interface MatchResult {
  score: number;
  verdict: "apply" | "stretch" | "skip" | "unknown";
  confidence: "high" | "medium" | "low";
  items: MatchItem[];
  experience: { requiredYears: number | null; candidateYears: number | null; status: "meets" | "below" | "unknown" | "not_required" };
  strengths: string[];
  gaps: string[];
  cautions: string[];
  explanation: string[];
}

const CREDIT: Record<ItemStatus, number> = { demonstrated: 1, listed: 0.6, related: 0.35, missing: 0, unverifiable: 0 };
const WEIGHT = { must: 3, nice: 1 } as const;

function assess(req: Requirement, resume: ParsedResume): MatchItem {
  if (req.kind !== "skill" || !req.skillId) {
    return { requirement: req, status: "unverifiable", evidence: [], note: "Not something a resume scan can confirm. Check it yourself." };
  }
  const own = resume.skills.find((s) => s.skillId === req.skillId);
  if (own) {
    return own.strength === "demonstrated"
      ? { requirement: req, status: "demonstrated", evidence: own.evidence.slice(0, 2), note: "Shown in your experience or projects." }
      : { requirement: req, status: "listed", evidence: own.evidence.slice(0, 2), note: "Named on your resume, but no experience or project line shows you using it." };
  }
  const related = resume.skills.find((s) => sameFamily(s.skillId, req.skillId!));
  if (related) {
    return {
      requirement: req,
      status: "related",
      evidence: related.evidence.slice(0, 1),
      note: `Not on your resume. You do show ${related.name}, which is a comparable ${skillById(req.skillId)?.category ?? "skill"}.`,
    };
  }
  return { requirement: req, status: "missing", evidence: [], note: "No mention found on your resume." };
}

export function matchResumeToJob(resume: ParsedResume, reqs: JobRequirements): MatchResult {
  const cautions: string[] = [];
  const items = reqs.requirements.map((r) => assess(r, resume));
  const scorable = items.filter((i) => i.status !== "unverifiable");

  let earned = 0;
  let possible = 0;
  for (const item of scorable) {
    const w = WEIGHT[item.requirement.importance];
    earned += w * CREDIT[item.status];
    possible += w;
  }
  let score = possible > 0 ? (earned / possible) * 100 : 0;

  // Experience: only penalise when both sides are actually known.
  const candidateYears = resume.experienceMonths === null ? null : Math.round((resume.experienceMonths / 12) * 10) / 10;
  let expStatus: MatchResult["experience"]["status"] = "not_required";
  if (reqs.minYears !== null && reqs.minYears > 0) {
    if (candidateYears === null) {
      expStatus = "unknown";
      cautions.push(`The role asks for ${reqs.minYears}+ years of experience. Your resume has no readable date ranges, so this could not be checked.`);
    } else if (candidateYears + 0.25 >= reqs.minYears) {
      expStatus = "meets";
    } else {
      expStatus = "below";
      const ratio = candidateYears / reqs.minYears;
      score *= 0.55 + 0.45 * ratio;
    }
  }
  score = Math.round(Math.max(0, Math.min(100, score)));

  const musts = scorable.filter((i) => i.requirement.importance === "must");
  const mustsMissing = musts.filter((i) => i.status === "missing");
  const strengths = items.filter((i) => i.status === "demonstrated").map((i) => i.requirement.label);
  const gaps = [...mustsMissing, ...scorable.filter((i) => i.requirement.importance === "nice" && i.status === "missing")].map((i) => i.requirement.label);

  for (const c of reqs.conflicts) cautions.push(c.detail);
  if (resume.status !== "parsed") cautions.push("Your resume did not parse cleanly, so some evidence may have been missed.");
  if (!reqs.structured) cautions.push("This posting has no clear requirements section. Requirements were inferred from the full text and may be incomplete.");

  let confidence: MatchResult["confidence"] = "high";
  if (scorable.length < 3 || resume.status === "failed") confidence = "low";
  else if (scorable.length < 6 || !reqs.structured || resume.status !== "parsed" || reqs.conflicts.length > 0 || expStatus === "unknown") confidence = "medium";

  let verdict: MatchResult["verdict"];
  if (scorable.length < 3 || resume.status === "failed") verdict = "unknown";
  else if (score >= 70 && mustsMissing.length <= Math.max(1, Math.floor(musts.length * 0.25)) && expStatus !== "below") verdict = "apply";
  else if (score >= 45) verdict = "stretch";
  else verdict = "skip";

  const explanation: string[] = [];
  if (verdict === "unknown") {
    explanation.push(
      resume.status === "failed"
        ? "Your resume could not be read, so no fit assessment was made."
        : `Only ${scorable.length} checkable requirement(s) were found in this posting. That is too few for a reliable verdict.`,
    );
  } else {
    const count = (s: ItemStatus) => scorable.filter((i) => i.status === s).length;
    explanation.push(
      `${count("demonstrated")} of ${scorable.length} checkable requirements are demonstrated in your experience or projects, ${count("listed")} are listed only, ${count("related")} are covered by a related skill, and ${count("missing")} are missing.`,
    );
    if (musts.length > 0) explanation.push(`${musts.length - mustsMissing.length} of ${musts.length} must-have requirements have some evidence on your resume.`);
    if (expStatus === "below") explanation.push(`The role asks for ${reqs.minYears}+ years; your resume shows about ${candidateYears}. The score was reduced for this.`);
    if (expStatus === "meets") explanation.push(`Your dated experience (about ${candidateYears} years) meets the stated ${reqs.minYears}+ years.`);
    explanation.push("Must-have requirements count three times as much as nice-to-haves. A skill you only list earns 60% of the credit of one you demonstrate.");
  }
  const unverifiable = items.length - scorable.length;
  if (unverifiable > 0) explanation.push(`${unverifiable} requirement(s) could not be checked against a resume and were left out of the score.`);

  return {
    score,
    verdict,
    confidence,
    items,
    experience: { requiredYears: reqs.minYears, candidateYears, status: expStatus },
    strengths,
    gaps,
    cautions,
    explanation,
  };
}

export const VERDICT_TEXT: Record<MatchResult["verdict"], { label: string; advice: string }> = {
  apply: { label: "Strong fit", advice: "Your resume backs most of what this role asks for. Worth applying." },
  stretch: { label: "Stretch", advice: "You cover part of this role. Apply if you can close or explain the gaps below." },
  skip: { label: "Weak fit", advice: "Most must-haves have no evidence on your resume. Your time is likely better spent elsewhere." },
  unknown: { label: "Not enough to judge", advice: "There is too little information for a reliable assessment." },
};
