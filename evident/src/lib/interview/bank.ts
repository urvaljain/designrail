import type { JobRequirements } from "../jobs/requirements";
import type { MatchResult } from "../match/score";
import type { ParsedResume } from "../resume/parse";
import { skillById } from "../taxonomy";
import { truncate } from "../text";

export type QuestionKind = "motivation" | "behavioral" | "concept" | "deep_dive" | "gap";

export interface Question {
  id: string;
  kind: QuestionKind;
  competency: string;
  difficulty: 1 | 2 | 3;
  text: string;
  /** Why this question is being asked, citing the listing or the resume. Shown to the user. */
  rationale: string;
  /** For concept questions: the points a complete answer covers, each with accepted phrasings. */
  expects?: { point: string; keywords: string[] }[];
}

type Curated = { d: 1 | 2 | 3; text: string; expects: { point: string; keywords: string[] }[] };

const CONCEPTS: Record<string, Curated[]> = {
  sql: [
    { d: 1, text: "What is the difference between an INNER JOIN and a LEFT JOIN? Give an example of when you would use each.", expects: [{ point: "INNER returns only matching rows", keywords: ["only match", "both tables", "matching rows", "intersection"] }, { point: "LEFT keeps all rows from the left table", keywords: ["all rows from the left", "keeps all", "every row", "even if no match", "unmatched"] }, { point: "Unmatched right-side columns are NULL", keywords: ["null"] }, { point: "A concrete example", keywords: ["for example", "e.g", "such as", "customers", "orders", "users"] }] },
    { d: 2, text: "A query that used to run in 50 ms now takes 5 seconds. How do you investigate and fix it?", expects: [{ point: "Read the query plan", keywords: ["explain", "query plan", "execution plan"] }, { point: "Check indexes", keywords: ["index"] }, { point: "Look for full scans or bad joins", keywords: ["full scan", "sequential scan", "table scan", "seq scan", "join"] }, { point: "Consider data growth or stale statistics", keywords: ["data grew", "growth", "statistics", "analyze", "volume", "more rows"] }, { point: "Measure before and after", keywords: ["measure", "benchmark", "compare", "before and after", "verify"] }] },
  ],
  python: [
    { d: 1, text: "What is the difference between a list and a tuple in Python, and when would you choose each?", expects: [{ point: "Lists are mutable", keywords: ["mutable", "can change", "can be modified", "append"] }, { point: "Tuples are immutable", keywords: ["immutable", "cannot change", "can't change", "cannot be modified"] }, { point: "Tuples can be dictionary keys / are hashable", keywords: ["hashable", "dictionary key", "dict key"] }, { point: "A use case for each", keywords: ["use a list when", "use a tuple when", "for example", "fixed", "coordinates", "record"] }] },
    { d: 2, text: "Explain how you would find and fix a memory or performance problem in a Python service.", expects: [{ point: "Profile before changing code", keywords: ["profile", "profiler", "cprofile", "measure"] }, { point: "Name a likely cause", keywords: ["loop", "n+1", "copy", "leak", "generator", "global", "cache"] }, { point: "A concrete fix", keywords: ["generator", "batch", "cache", "vectori", "index", "stream", "async"] }, { point: "Verify the improvement", keywords: ["verify", "compare", "benchmark", "before and after", "test"] }] },
  ],
  javascript: [
    { d: 1, text: "Explain the difference between `let`, `const` and `var`.", expects: [{ point: "var is function-scoped", keywords: ["function scope", "function-scoped"] }, { point: "let and const are block-scoped", keywords: ["block scope", "block-scoped"] }, { point: "const cannot be reassigned", keywords: ["reassign", "cannot be changed", "constant"] }, { point: "Hoisting behaviour", keywords: ["hoist", "temporal dead zone"] }] },
    { d: 2, text: "What happens, step by step, when you `await` a promise? How does the event loop keep the page responsive?", expects: [{ point: "The function pauses and yields control", keywords: ["pause", "suspend", "yield", "returns control"] }, { point: "Continuation is queued as a microtask", keywords: ["microtask", "queue", "job queue"] }, { point: "The single thread is not blocked", keywords: ["single thread", "non-blocking", "not block", "doesn't block"] }, { point: "Error handling with try/catch or .catch", keywords: ["try", "catch", "reject"] }] },
  ],
  react: [
    { d: 1, text: "What is the difference between props and state in React?", expects: [{ point: "Props come from the parent", keywords: ["parent", "passed in", "passed down"] }, { point: "Props are read-only", keywords: ["read-only", "immutable", "cannot change", "should not modify"] }, { point: "State is owned by the component", keywords: ["own", "internal", "local", "inside the component"] }, { point: "Changing state causes a re-render", keywords: ["re-render", "rerender", "render again", "update the ui"] }] },
    { d: 2, text: "A list of 5,000 rows re-renders slowly every time the user types in a search box. How do you diagnose and fix it?", expects: [{ point: "Measure with the profiler", keywords: ["profiler", "measure", "devtools"] }, { point: "Avoid unnecessary re-renders", keywords: ["memo", "usememo", "usecallback", "key"] }, { point: "Render fewer rows", keywords: ["virtual", "windowing", "paginat"] }, { point: "Delay the work", keywords: ["debounce", "throttle", "defer", "transition"] }] },
  ],
  nodejs: [
    { d: 1, text: "Node.js is single-threaded. How does it handle many requests at once?", expects: [{ point: "Event loop", keywords: ["event loop"] }, { point: "Non-blocking I/O", keywords: ["non-blocking", "asynchronous", "async i/o", "callbacks", "promises"] }, { point: "CPU-heavy work blocks it", keywords: ["cpu", "block", "worker thread", "worker"] }] },
    { d: 2, text: "Your Node.js API's p95 latency doubled after a release. Walk me through how you find the cause.", expects: [{ point: "Compare metrics before and after", keywords: ["metric", "dashboard", "compare", "before", "baseline"] }, { point: "Narrow to an endpoint or dependency", keywords: ["endpoint", "trace", "database", "dependency", "slow query", "log"] }, { point: "Check for blocking the event loop", keywords: ["event loop", "blocking", "synchronous", "cpu"] }, { point: "Roll back or fix, then verify", keywords: ["roll back", "rollback", "revert", "verify", "fix"] }] },
  ],
  rest: [
    { d: 1, text: "What makes an API RESTful? Describe how you would design endpoints for creating and listing orders.", expects: [{ point: "Resources and nouns in URLs", keywords: ["resource", "noun", "/orders"] }, { point: "HTTP methods carry meaning", keywords: ["get", "post", "put", "patch", "delete"] }, { point: "Status codes", keywords: ["status code", "201", "200", "404", "400"] }, { point: "Statelessness", keywords: ["stateless"] }] },
    { d: 2, text: "A client retries a payment request after a timeout. How do you make sure the customer is not charged twice?", expects: [{ point: "Idempotency key", keywords: ["idempoten"] }, { point: "Store and look up the key", keywords: ["store", "unique", "look up", "dedupe", "database"] }, { point: "Return the original result on retry", keywords: ["same response", "original result", "return the previous", "cached response"] }, { point: "Handle concurrent duplicates", keywords: ["race", "concurrent", "lock", "transaction", "unique constraint"] }] },
  ],
  postgres: [
    { d: 1, text: "What is a database index and what does it cost you?", expects: [{ point: "Speeds up lookups", keywords: ["faster", "speed", "lookup", "avoid scanning", "search"] }, { point: "Data structure (B-tree)", keywords: ["b-tree", "btree", "tree", "sorted"] }, { point: "Slower writes", keywords: ["write", "insert", "update"] }, { point: "Extra storage", keywords: ["storage", "space", "disk"] }] },
    { d: 2, text: "Explain what a transaction is and what can go wrong when two transactions update the same row.", expects: [{ point: "Atomicity: all or nothing", keywords: ["atomic", "all or nothing", "rollback", "commit"] }, { point: "Isolation", keywords: ["isolation", "read committed", "serializable"] }, { point: "Lost updates or race conditions", keywords: ["lost update", "race", "overwrite", "conflict"] }, { point: "Locks or optimistic control", keywords: ["lock", "for update", "optimistic", "version"] }] },
  ],
  dsa: [
    { d: 1, text: "When would you use a hash map instead of an array? What are the time complexities of lookup in each?", expects: [{ point: "Hash map lookup is O(1) on average", keywords: ["o(1)", "constant time", "constant"] }, { point: "Array search is O(n)", keywords: ["o(n)", "linear"] }, { point: "Key-based access", keywords: ["key", "lookup by", "mapping"] }, { point: "Trade-off: memory or ordering", keywords: ["memory", "order", "collision", "space"] }] },
    { d: 2, text: "How would you detect a cycle in a linked list? Explain the approach and its complexity.", expects: [{ point: "Two pointers at different speeds", keywords: ["slow", "fast", "two pointers", "tortoise", "floyd"] }, { point: "They meet if there is a cycle", keywords: ["meet", "collide", "equal"] }, { point: "O(n) time", keywords: ["o(n)", "linear"] }, { point: "O(1) space", keywords: ["o(1)", "constant space", "no extra"] }] },
    { d: 3, text: "Design an LRU cache with O(1) get and put. Which data structures do you combine, and why?", expects: [{ point: "Hash map for lookup", keywords: ["hash map", "hashmap", "dictionary", "map"] }, { point: "Doubly linked list for order", keywords: ["doubly linked", "linked list"] }, { point: "Move to front on access", keywords: ["move to", "front", "head", "most recent"] }, { point: "Evict from the tail", keywords: ["evict", "tail", "least recent", "remove the last"] }] },
  ],
  docker: [
    { d: 1, text: "What problem does Docker solve, and how is a container different from a virtual machine?", expects: [{ point: "Consistent environments", keywords: ["works on my machine", "consistent", "same environment", "reproducib", "dependencies"] }, { point: "Containers share the host kernel", keywords: ["kernel", "share"] }, { point: "Lighter and faster than VMs", keywords: ["lighter", "lightweight", "faster", "less overhead", "smaller"] }, { point: "Images and layers", keywords: ["image", "layer", "dockerfile"] }] },
  ],
  testing: [
    { d: 1, text: "What is the difference between a unit test and an integration test? What would you cover with each?", expects: [{ point: "Unit tests isolate one piece", keywords: ["isolat", "single function", "one function", "small", "in isolation"] }, { point: "Integration tests cross boundaries", keywords: ["together", "database", "multiple components", "end to end", "real"] }, { point: "Speed and cost trade-off", keywords: ["fast", "slow", "cost", "flaky"] }, { point: "A concrete example", keywords: ["for example", "e.g", "such as"] }] },
  ],
  statistics: [
    { d: 1, text: "What does a p-value tell you, and what does it not tell you?", expects: [{ point: "Probability of data this extreme if the null is true", keywords: ["null hypothesis", "if the null", "assuming"] }, { point: "Not the probability the hypothesis is true", keywords: ["not the probability", "does not mean", "doesn't tell", "misinterpret"] }, { point: "Threshold or significance level", keywords: ["0.05", "significance", "alpha", "threshold"] }, { point: "Effect size matters separately", keywords: ["effect size", "practical", "magnitude", "sample size"] }] },
    { d: 2, text: "An A/B test shows a 2% lift after two days. Your manager wants to ship. What do you check first?", expects: [{ point: "Sample size or power", keywords: ["sample size", "power", "enough users", "enough data"] }, { point: "Statistical significance", keywords: ["significan", "confidence interval", "p-value"] }, { point: "Duration and novelty effects", keywords: ["novelty", "full week", "weekday", "seasonal", "longer"] }, { point: "Peeking or stopping early", keywords: ["peek", "stopping early", "early stop"] }, { point: "Guardrail metrics", keywords: ["guardrail", "other metrics", "retention", "side effect"] }] },
  ],
  "machine-learning": [
    { d: 1, text: "What is overfitting, how do you detect it, and how do you reduce it?", expects: [{ point: "Fits training data but not new data", keywords: ["training", "generali", "unseen", "new data", "memori"] }, { point: "Detected by a train/validation gap", keywords: ["validation", "test set", "gap", "hold-out", "holdout"] }, { point: "Regularisation or simpler model", keywords: ["regulari", "dropout", "simpler", "prune", "l1", "l2"] }, { point: "More data or cross-validation", keywords: ["more data", "cross-validation", "augment", "early stopping"] }] },
  ],
  "user-research": [
    { d: 1, text: "You have one week to learn why new users abandon onboarding. How do you run the research?", expects: [{ point: "Define the question and who to talk to", keywords: ["goal", "question", "hypothes", "recruit", "segment", "who"] }, { point: "Combine data with interviews", keywords: ["interview", "funnel", "analytics", "data", "session", "usability"] }, { point: "Avoid leading questions", keywords: ["leading", "open-ended", "open ended", "bias"] }, { point: "Synthesise into a decision", keywords: ["synthesi", "themes", "pattern", "recommend", "prioriti"] }] },
  ],
};
CONCEPTS.typescript = CONCEPTS.javascript!;
CONCEPTS["product-management"] = CONCEPTS["user-research"]!;
CONCEPTS["data-analysis"] = CONCEPTS.sql!;
CONCEPTS["ab-testing"] = [CONCEPTS.statistics![1]!];
CONCEPTS.mysql = CONCEPTS.postgres!;

const BEHAVIORAL: { competency: string; d: 1 | 2 | 3; text: string }[] = [
  { competency: "ownership", d: 1, text: "Tell me about a project you are proud of. What was your part in it, and what was the result?" },
  { competency: "learning", d: 1, text: "Tell me about a time you had to learn something new quickly. How did you go about it?" },
  { competency: "collaboration", d: 2, text: "Describe a time you disagreed with a teammate about how to do something. What did you do, and how did it end?" },
  { competency: "failure", d: 2, text: "Tell me about something you worked on that did not go well. What happened, and what did you change afterwards?" },
  { competency: "prioritisation", d: 2, text: "Describe a time you had more work than time. How did you decide what to do first, and what did you drop?" },
  { competency: "ambiguity", d: 3, text: "Tell me about a time you were given a vague goal with no clear owner. How did you turn it into something concrete, and how did you know it worked?" },
  { competency: "influence", d: 3, text: "Describe a time you changed someone's mind using data or evidence when you had no authority over them." },
];

function conceptQuestions(skillId: string, label: string, quote: string): Question[] {
  const curated = CONCEPTS[skillId];
  if (curated) return curated.map((c, i) => ({ id: `concept:${skillId}:${i}`, kind: "concept" as const, competency: label, difficulty: c.d, text: c.text, rationale: `The listing asks for ${label}: "${truncate(quote, 110)}"`, expects: c.expects }));
  return [
    { id: `concept:${skillId}:g1`, kind: "concept", competency: label, difficulty: 1, text: `What is ${label} used for? Describe one situation where you used it or would choose it.`, rationale: `The listing asks for ${label}: "${truncate(quote, 110)}"` },
    { id: `concept:${skillId}:g2`, kind: "concept", competency: label, difficulty: 2, text: `Walk me through a specific problem you solved, or would solve, with ${label}. What trade-offs did you weigh?`, rationale: `The listing asks for ${label}: "${truncate(quote, 110)}"` },
  ];
}

export interface PoolInput {
  job: { title: string; companyName: string; requirements: JobRequirements } | null;
  resume: ParsedResume | null;
  match: MatchResult | null;
}

/** Build the question pool for a session. Every question records why it was chosen. */
export function buildPool(input: PoolInput): Question[] {
  const pool: Question[] = [];
  const role = input.job ? `the ${input.job.title} role at ${input.job.companyName}` : "this kind of role";
  pool.push({ id: "motivation:1", kind: "motivation", competency: "motivation", difficulty: 1, text: `Why are you interested in ${role}, and what would you bring to it?`, rationale: "A standard opening question. It checks that you have read the listing and can connect your background to it." });

  const items = input.match?.items.filter((i) => i.requirement.kind === "skill" && i.requirement.skillId) ?? [];
  const musts = items.filter((i) => i.requirement.importance === "must");
  for (const item of [...musts, ...items.filter((i) => i.requirement.importance === "nice")].slice(0, 8)) {
    const sid = item.requirement.skillId!;
    const label = skillById(sid)?.name ?? item.requirement.label;
    if (item.status === "missing" || item.status === "related") {
      pool.push({ id: `gap:${sid}`, kind: "gap", competency: label, difficulty: 2, text: `This role asks for ${label}, and it does not appear on your resume. What related experience do you have, and how would you get productive with it in your first month?`, rationale: `Your resume shows no evidence of ${label}, which the listing requires. Interviewers probe gaps like this.` });
    }
    if (item.status === "demonstrated" && item.evidence[0]) {
      pool.push({ id: `deep:${sid}`, kind: "deep_dive", competency: label, difficulty: 2, text: `Your resume says: "${truncate(item.evidence[0].quote, 160)}". Walk me through it. What exactly did you do, what was hard, and what was the outcome?`, rationale: `This line is your strongest evidence for ${label}, a requirement of the role. Expect to be asked to defend it.` });
    }
    pool.push(...conceptQuestions(sid, label, item.requirement.quote));
  }
  if (!input.match && input.job) {
    for (const r of input.job.requirements.requirements.filter((x) => x.kind === "skill" && x.skillId).slice(0, 6)) pool.push(...conceptQuestions(r.skillId!, r.label, r.quote));
  }
  if (!input.job && input.resume) {
    for (const s of input.resume.skills.filter((x) => x.strength === "demonstrated").slice(0, 4)) {
      pool.push({ id: `deep:${s.skillId}`, kind: "deep_dive", competency: s.name, difficulty: 2, text: `Your resume says: "${truncate(s.evidence[0]!.quote, 160)}". Walk me through it. What exactly did you do, what was hard, and what was the outcome?`, rationale: `This line is evidence for ${s.name} on your resume.` });
      pool.push(...conceptQuestions(s.skillId, s.name, s.evidence[0]!.quote));
    }
  }
  for (const b of BEHAVIORAL) pool.push({ id: `behavioral:${b.competency}`, kind: "behavioral", competency: b.competency, difficulty: b.d, text: b.text, rationale: "A behavioural question. Interviewers use these to see how you actually work, so a specific past example beats a general statement." });
  return [...new Map(pool.map((q) => [q.id, q])).values()];
}

/** Staircase adaptation: a strong answer raises difficulty, a weak one lowers it. */
export function nextDifficulty(current: number, score: number): 1 | 2 | 3 {
  const next = score >= 72 ? current + 1 : score < 45 ? current - 1 : current;
  return Math.max(1, Math.min(3, next)) as 1 | 2 | 3;
}

export function pickNext(pool: Question[], askedIds: string[], target: number, last: { question: Question; score: number } | null, position: number, total: number): { question: Question; reason: string } | null {
  const remaining = pool.filter((q) => !askedIds.includes(q.id));
  if (remaining.length === 0) return null;
  const asked = pool.filter((q) => askedIds.includes(q.id));
  const kindsAsked = new Set(asked.map((q) => q.kind));
  const dist = (q: Question) => Math.abs(q.difficulty - target);

  // After a weak concept answer, stay on the topic one level down before moving on.
  if (last && last.score < 45 && last.question.kind === "concept") {
    const easier = remaining.find((q) => q.competency === last.question.competency && q.difficulty < last.question.difficulty);
    if (easier) return { question: easier, reason: `Your last answer on ${last.question.competency} missed key points, so this is an easier question on the same topic.` };
  }
  // Make sure a session always includes a gap probe, a resume deep-dive and a behavioural question.
  const wanted: QuestionKind[] = ["gap", "deep_dive", "behavioral", "concept"];
  const slotsLeft = total - position;
  const missing = wanted.filter((k) => !kindsAsked.has(k) && remaining.some((q) => q.kind === k));
  const kind = missing.length >= slotsLeft ? missing[0] : (missing[0] ?? null);
  const candidates = (kind ? remaining.filter((q) => q.kind === kind) : remaining).filter((q) => !last || q.competency !== last.question.competency || remaining.every((r) => r.competency === last.question.competency));
  const list = candidates.length > 0 ? candidates : remaining;
  const best = [...list].sort((a, b) => dist(a) - dist(b) || a.id.localeCompare(b.id))[0]!;
  const moved = last ? (target > last.question.difficulty ? "Your last answer was strong, so this one is harder." : target < last.question.difficulty ? "Your last answer had gaps, so this one is more approachable." : "Difficulty held steady.") : "Opening question.";
  return { question: best, reason: moved };
}
