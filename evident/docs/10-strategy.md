# 10. Business and product strategy

Everything in this document is a plan or a hypothesis. No market sizing, user research, pricing test or revenue exists behind it. Where a number is an assumption it is marked as one, and the model shows what would have to be true rather than what is.

## Positioning

**For** students, recent graduates and early-career professionals **who** are applying widely and hearing little, **Evident is** a career platform **that** shows the evidence behind every recommendation it makes. **Unlike** job boards and AI resume tools that give scores, estimates and rewrites without sources, **Evident** ties each claim to something the user can check: the listing's own words, a line of their own resume, a date, a count.

| | Listings marketplaces (Naukri, LinkedIn, Indeed) | Student platforms (Internshala, Unstop) | AI career tools (Astra, Teal, Rezi) | **Evident** |
| --- | --- | --- | --- | --- |
| Core asset | Inventory and recruiter reach | Student supply, competitions | Feature breadth, prep content | Trust in what it tells you |
| Fit signal | Keyword match, opaque | Eligibility filters | Scores, sometimes gated | Requirement-level evidence, always shown |
| Pay data | Mixed | Stipends stated | Often estimated | Employer-stated or absent |
| Money comes from | Employers | Employers, fees | Job seekers: access and AI credits | Job seekers: optional subscription for model-backed depth |
| Weak point | Volume over relevance | Narrow scope | Trust, paywalled basics | Inventory, content depth, no distribution yet |

Column characterisations are this author's reading of public positioning, not a measured comparison.

**Defensibility.** Rules and UI can be copied. What compounds is (1) a corpus of outcomes linked to evidence-level fit, which makes the fit signal better than anyone's without that link, and (2) a reputation for not overstating, which is slow to build and easy for competitors with estimate-driven funnels to lack.

## Target segment for launch

Final-year engineering and data students in India applying off-campus to product companies that publish roles on Greenhouse, Lever or Ashby. Reasons: the reference product shows the segment is reachable and pays small amounts; those employers' listings are structured and permitted; resumes in this segment are project-heavy, where line-level evidence matters most. **Risk:** many Indian mass recruiters do not use those systems, so inventory for this segment may be thin. Measuring that coverage is week-one work.

## Pricing hypotheses

| Hypothesis | Test | Decision rule |
| --- | --- | --- |
| H1. Keeping search, apply, fit, tracking and rubric-scored interviews free produces more activated users than gating any of them | Compare activation with and without a soft cap on fit views | Keep everything free unless the cap raises paid conversion with no drop in week-4 retention |
| H2. Users will pay a monthly subscription for more model-backed depth (richer interview feedback, more drafts) | Fake-door Plus at three prices, by cohort: ₹199, ₹299, ₹499 a month | Pick the price that maximises revenue per activated user; drop Plus if under 2% click through at every price |
| H3. A one-time "interview week" pass sells better than a subscription to people with a scheduled interview | Offer a 7-day pass at the moment an application moves to Interview | Add the pass if it converts at twice the subscription rate at that moment |
| H4. Placement cells will pay per seat for a cohort view | Ten discovery calls before building anything | Build only with two signed pilots |

Not offered: lifetime plans (recurring cost against one payment), job guarantees (an outcome the product does not control), countdowns or struck-through anchor prices.

## Unit economics model

A structure with placeholder inputs, to be replaced by measurements. Only the model cost line has any basis in this repository, and that basis is a projection.

| Input | Value | Basis |
| --- | --- | --- |
| Model cost per completed journey | About $0.01 on `claude-opus-5-5`, about $0.0002 on `claude-haiku-5-5` | Projected from prompt sizes in `eval-results.md`; real cost will be higher because reasoning and realistic output lengths are not counted. Planning figure used below: **10× the Opus projection, $0.10** |
| Journeys per active user per month | 6 | Assumption |
| Hosting and database per monthly active user | $0.05 | Assumption; small-instance pricing spread over a few thousand users |
| Plus price | ₹299 (about $3.50) | Hypothesis H2 |
| Payment fees and tax | 20% of price | Assumption |
| Free-to-Plus conversion | 3% | Assumption; to be measured |
| Blended acquisition cost per activated user | $0.50 | Assumption; depends entirely on channel |

Per month:

- **Free user cost** = 6 × $0.10 × (share of journeys within the free allowance, taken as 1) + $0.05 = **$0.65**. The free allowance of 30 model-backed runs is roughly five journeys (a journey makes about six model-backed runs), which caps free-user model cost near $0.50 a month on these figures; routing routine tasks to Haiku cuts it by more than an order of magnitude.
- **Plus user contribution** = $3.50 × 0.8 − (higher usage, assumed 20 journeys × $0.10) − $0.05 = **$0.75**.
- **Blended** at 3% conversion: 0.03 × $0.75 − 0.97 × $0.65 = **−$0.61 per active user per month**.

**Reading.** On these assumptions the product loses money on an Opus-for-everything free tier. That is the point of doing the arithmetic. The levers, in order of size: (1) use the deterministic engine for free users and reserve the model for Plus, which the architecture already supports and which takes free-user model cost to zero; (2) route wording tasks to a small model; (3) raise conversion with the interview-week pass. With lever 1 alone the blended figure becomes 0.03 × $0.75 − 0.97 × $0.05 = **−$0.03**, near break-even before acquisition, and positive above roughly 6% conversion. None of this is validated.

## Metrics

**North Star: evidence-backed applications per week.** An application counts when the user marked it applied, and before doing so opened a fit assessment for that job in which at least half of the must-have requirements had resume evidence. It measures the product's whole promise (find, check, act) and cannot be inflated by browsing or by spraying applications.

| Layer | Metric | Why |
| --- | --- | --- |
| Activation | Share of sign-ups with a parsed resume and one saved job within 24 hours | The two inputs everything else needs |
| Engagement | Median fit assessments opened per active week; mock interviews completed per interview-stage application | Depth of use at the moments that matter |
| Outcome | Response rate on evidence-backed applications against others, per user and overall | Whether the fit signal predicts anything |
| Retention | Week-4 return rate among users with an open application | Job search is episodic; cohort on having something in flight |
| Trust | Share of listings verified in 72 hours; closed-listing click rate; integrity flags confirmed on review; reported wrong-evidence cases per 1,000 fit views | The promise, measured |
| Quality guardrails | Model outputs rejected by verification; share of agent runs degraded or failed; p95 page latency | Early warning |
| Business | Free-to-Plus conversion; model cost per active user | Viability |

**Instrumentation status:** the audit log already records agent runs, statuses, latency and cost. Product analytics events are not implemented.

## Experimentation strategy

- **Principles.** One primary metric per test, a guardrail on week-4 retention and on reported wrong-evidence cases, sample sizes fixed in advance, no peeking decisions. Under about 1,000 weekly actives, prefer qualitative tests and before/after cohorts to underpowered A/B tests, and say so in the write-up.
- **First five experiments**

| # | Question | Design | Primary metric |
| --- | --- | --- | --- |
| 1 | Does showing a "Weak fit" verdict reduce applications users should have made? | Verdict label against evidence table only | Evidence-backed applications per user; interview rate |
| 2 | Does the application kit raise apply-through? | Kit prompt on save against no prompt | Saved-to-applied within 7 days |
| 3 | Are 7-day follow-up reminders acted on? | Reminder against none | Follow-ups sent; response rate (directional) |
| 4 | Is interview adaptivity felt? | Adaptive against fixed order | Session completion; second session within 7 days |
| 5 | Which Plus price? | H2 fake door | Click-through and revenue per activated user |

## Roadmap

| Horizon | Theme | Items |
| --- | --- | --- |
| **Now (0 to 6 weeks)** | Make it real for 50 people | Coverage audit of Indian employers on supported boards; 12 user interviews; email verification and password reset; error tracking and analytics events; privacy policy; deploy; validate model providers live and tune prompts on real output |
| **Next (6 to 12 weeks)** | Close the content gap | India-specific parsing (LPA, CGPA, batch year, eligibility rules); campus test patterns for the top 20 recruiters; curated questions for 30 more skills; voice answers with transcripts; reminder emails |
| **Later** | Compound the advantage | Outcome-calibrated fit (does evidence predict responses?); semantic retrieval; a dedicated search engine; resume editor that edits against the evidence view; placement-cell cohort view; payments |

Ordering rule: nothing that adds a claim the product cannot source.

## 90-day launch plan

| Days | Goal | Work | Exit criterion |
| --- | --- | --- | --- |
| 1 to 14 | Know whether the wedge exists | Count open India-based early-career roles across 200 employers on supported boards; interview 12 students and graduates with their own resumes and the live fit view; fix what confuses them | At least 500 relevant open roles, and 8 of 12 interviewees can explain a fit result back unprompted. If inventory fails, the source strategy changes before anything else is built |
| 15 to 30 | Private alpha, 50 users | Deploy; real sources on; live model for Plus-equivalent features; analytics events; weekly review of every reported wrong-evidence case | 40% activation; no unresolved security or data-loss issue; wrong-evidence reports under 20 per 1,000 fit views |
| 31 to 60 | Closed beta, 500 users, two colleges | Placement-cell and student-club partnerships; India-specific parsing; reminder emails; experiments 1 to 3 | 25% week-4 retention among users with an open application; at least 3 evidence-backed applications per active user per week |
| 61 to 90 | Public launch, pricing test | Waitlist release; Plus fake door, then payments if H2 holds; publish the methodology and the evaluation results; experiments 4 and 5 | 5,000 sign-ups; a measured conversion rate; a go or no-go on Plus backed by the unit model with real inputs |

**Kill or pivot signals:** supported boards carry too few relevant roles; users do not open the evidence view after the first week; fit shows no relationship with responses once 1,000 applications have outcomes.

## Risks

| Risk | Likelihood | Mitigation |
| --- | --- | --- |
| Inventory too thin from permitted sources | High | Measure first; add employer-submitted listings with verification; partner feeds |
| Lexical matching misses real skills and frustrates users | Medium | Model-proposed skills with quote checks; let users attach a resume line to a skill themselves |
| A verdict discourages good applications | Medium | Experiment 1; verdict wording; always show the evidence, not only the label |
| A competitor copies the evidence view | High | Speed, the outcome corpus, and published methodology |
| Model costs exceed willingness to pay | Medium | Deterministic default; small-model routing; allowance |
| A wrong claim damages trust | Medium | Verification, audit log, a visible "report this" path (not yet built) |
