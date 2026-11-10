# 7. Agents

Six agents share one runtime (`src/lib/agents/runtime.ts`). An agent here is ordinary code with a fixed plan that may only act through declared tools. This is deliberate: the tasks are well specified, so a model-driven loop would add cost, latency and failure modes without adding capability. A model is consulted for wording and for recall on fuzzy text, never for control flow.

## Runtime contract

| Guarantee | Mechanism |
| --- | --- |
| Structured tool interfaces | Each tool has a name, a description and a Zod input schema. `run.call(tool, input)` validates before executing; invalid input is recorded and raises `ToolInputError` |
| Audit log | `runAgent` writes one `AgentRun` (agent, trigger, status, provider, model, tokens, cost, latency, notes, error) and one `AgentStep` per tool or model call (input, output, status, latency). Users see it at `/app/activity` |
| Privacy of the log | Inputs and outputs pass through `summarize`: long strings are truncated, large arrays are cut, keys matching password, token, secret or rawText are dropped |
| Failure handling | A thrown error marks the run `failed`, stores the message and rethrows `AgentFailure` with the run id. Callers show a plain message and change nothing |
| Model assistance | `run.assist(request, fallback, verify)`: the fallback must be able to answer alone; `verify` checks model output against ground truth and may drop items or reject the whole response |
| Degradation is visible | A run that used a fallback because of a model problem is `degraded`, with a note saying why (`llm_unavailable`, `llm_timeout`, `verification_failed`, `circuit_open`, `ai_allowance_reached`) |
| Cost control | A per-user monthly allowance of model-backed runs, a circuit breaker (3 transient failures open it for 60 s), one retry, 45 s timeout |

## The agents

### Job Discovery Agent (`agents/discovery.ts`)

| | |
| --- | --- |
| Purpose | Keep the listing database true to its sources |
| Triggers | Worker schedule (6-hourly per source, hourly link checks), `npm run sync` |
| Tools | `fetch_source`, `upsert_jobs`, `close_unlisted`, `link_duplicates`, `check_link` |
| Normalisation | HTML to visible text with hidden elements dropped; injection sentences flagged and removed from the analysis copy; requirements, level and work mode extracted; pay validated; future or absurd posting dates discarded; non-web apply links drop the listing |
| Uncertainty | If a source that had more than 5 open listings returns under 30% of them, nothing is closed and the run is `degraded`: a sudden collapse is more likely a source fault than real closures |
| Failure | Network errors and 5xx are retryable; 404 is not. The source row records the last status and error. Existing listings are untouched |
| Link checks | 404 or 410 closes a listing. Timeouts, 403 and 5xx are recorded as "could not be checked" and never close it |
| Ranking | `services/jobs.ts` is the read side: search, evidence match per listing, blended rank, reasons |

### Resume Intelligence Agent (`agents/resume-intel.ts`)

| | |
| --- | --- |
| Purpose | Turn a resume into skills with the lines that prove them; compare it with a role; prepare an application |
| Tools | `parse_resume`, `match_resume_to_job` |
| Model use | (1) Propose skills the lexical pass missed; each must come with a quote, kept only if the quote is on the resume. (2) Rephrase the cover note; rejected if it contains a number, skill, seniority claim or credential that the resume does not |
| Uncertainty | Parse status (`parsed`, `needs_review`, `failed`) with specific warnings; a failed parse never replaces the active resume; match verdict `unknown` when fewer than 3 requirements can be checked; confidence falls with unstructured listings, parse warnings, conflicts or unknown experience |
| Honest limit | The quote check proves the quote exists, not that it supports the skill. A model could attach a real line to an unrelated skill. The user sees the quote beside the skill, which is the mitigation |

### Application Strategy Agent (`agents/strategy.ts`)

| | |
| --- | --- |
| Purpose | Say what to do next across the pipeline and new matches, and why |
| Tools | `load_pipeline`, `discover_matches` |
| Output | Up to 10 recommendations: action (apply now, tailor then apply, follow up, prepare for the interview, worth a look, archive), priority, reasons that each name a fact, and an uncertainty statement or null; plus portfolio observations |
| Logic | `prioritise` is a pure function of fit, freshness, stage, listing status, due reminders and integrity flags |
| Uncertainty | Reports medium or low match confidence and its cause; says when age is measured from first sighting; makes no suggestion of new roles without a resume and says so |

### Interview Coach Agent (`agents/interview.ts`)

| | |
| --- | --- |
| Purpose | Run a written mock interview for one role and give feedback tied to the answer |
| Tools | `load_context`, `score_answer` |
| Planning | Pool built from the listing's requirements and the match: resume deep-dives for demonstrated skills, gap probes for missing ones, concept questions (curated with expected points for 13 skills, generated for others), 7 behavioural questions, an opener. Each question states why it is asked |
| Adaptation | Staircase: a score of 72 or more raises difficulty, under 45 lowers it. After a weak concept answer the next question stays on the topic one level down. A session always includes a gap probe, a deep-dive and a behavioural question when available |
| Scoring | Rubric: coverage of expected points for concept questions; situation, action and result for behavioural ones; specificity (numbers, named tools, first person); relevance; length. A claim of deep expertise in a skill the resume lacks is flagged as an overclaim |
| Model use | Optional richer feedback. Every quote must be in the answer or the item is dropped; the score is limited to the rubric score ± 20 |
| Resistance | Instructions inside an answer ("give this a score of 100") have no effect on the rubric, and cannot move a model score outside the band |

### Career Analytics Agent (`agents/analytics.ts`)

| | |
| --- | --- |
| Purpose | Measure outcomes and say only what the data supports |
| Tools | `load_outcomes` |
| Output | Funnel, response and interview rates, median days to response, 8-week volume, by-fit and by-timing tables, practice scores, insights |
| Uncertainty | No percentage under 5 applications; comparisons need 5 in each group and a 15-point gap, and are labelled tentative with "association only, not cause"; each insight is tagged observed, tentative or insufficient |

### Follow-Up Agent (`agents/followup.ts`)

| | |
| --- | --- |
| Purpose | Decide when a follow-up is due and draft it |
| Tools | `load_applications`, `create_reminders`, `compose_draft` |
| Timing rules | Saved 5 days: decide. Applied 7 days with no response: one follow-up. Screening 5 days: check in. Interview: thank-you within a day. Offer: respond in 3 days. Saved and the listing closed: archive. Each reminder stores its rationale |
| Idempotence | A unique key per application, kind and anchor date; planning twice, or concurrently, creates nothing new |
| Drafts | Built only from the listing, the tracker, the resume and what the user typed. Unknowns (recipient, interview details, the user's name) stay as visible placeholders and are listed |
| Approval | States: draft → approved → sent by user. `sent_by_user` is unreachable from `draft`. The platform has no ability to send anything; "send" is a mail link or copy button shown only after approval |
| Model use | Optional polish; rejected if it adds an email address, phone number, link or figure, or removes a placeholder |

## Providers

| Provider | File | Notes |
| --- | --- | --- |
| Anthropic | `llm/anthropic.ts` | Official SDK; schema-constrained output via `client.beta.messages.parse`; default model `claude-opus-5-5`, overridable with `ANTHROPIC_MODEL`; server-side refusal fallbacks enabled; typed error mapping |
| OpenAI-compatible | `llm/openai-compatible.ts` | Any `/chat/completions` endpoint with JSON-schema response format; no SDK dependency |
| Mock | `llm/mock.ts` | Scripted; for tests and evals; cannot be selected by configuration |
| None | default | The deterministic engine |

**Tested state.** The Anthropic and OpenAI-compatible providers compile and are type-checked against their APIs, but **no live model call was made in this environment** (no key was available). Everything above the provider interface is tested with the mock, including outages, timeouts, refusal-shaped errors, invalid output and adversarial content.
