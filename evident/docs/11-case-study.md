# Case study: Evident, a career platform that shows its evidence

*A product teardown turned into a working alternative. Reference product: Astra (useastra.in). Built November 2026.*

## Summary

I studied a popular AI career platform for Indian students from the outside, found that its weakest dimension was trust, and built a competing product around one rule: **every claim comes with evidence the user can check.** The result is a working full-stack application in which a user can find a job, see line by line how their resume supports it, prepare an application built only from what their resume says, track it with reasoned reminders, and practise an interview for that exact role.

It has been tested by automated suites and by no real users. That is the most important caveat in this document, and the launch plan starts there.

| | |
| --- | --- |
| Role | Product, design, engineering, evaluation |
| Scope | Reconnaissance, teardown, PRD, design system, full-stack build, six agents, tests, strategy |
| Stack | Next.js 16, TypeScript, Tailwind CSS, PostgreSQL, Prisma; optional LLM behind a provider interface |
| Size | 73 source files, about 7,500 lines; 80 automated tests; a 30-journey evaluation harness |
| Status | Runs locally against PostgreSQL; not deployed publicly; no payments; no live model calls made |

## 1. The reference product

Astra is an all-in-one platform for Indian freshers: jobs and internships with links to employers' own pages, campus-placement guides, large question banks, resume tools, recruiter contacts and an AI mock interview. I looked only at what any visitor can see: 25 rendered pages, the sitemap of 8,417 URLs, its published guide and machine-readable files, and the front-end bundles a browser downloads. I did not sign in, pay, or touch private endpoints, so everything behind the login is recorded as the company's own description, not as fact.

**What it gets right.** It knows its user. Pay is in LPA, eligibility is in batch years and CGPA, and the placement guides describe real test patterns. Applications go to the employer, not through a middleman. The content depth is real.

**Where it is weak.** Trust and fairness.

| Observation | Why it matters |
| --- | --- |
| Clicking through to an employer's own application page requires a paid plan; so does search | The most basic value of a job board is behind the paywall |
| Six of the first eight job cards showed the same pay band; the job page does not say the figure is an estimate, though the page metadata does | Users cannot tell stated pay from a guess |
| A "Verified" badge carries no date | Verified when, and what? |
| A sampled listing said "Fresher · 1+ years" and asked for "6+ months" in its text | Contradictions pass through unflagged |
| Three different counts of open roles are published at once | Small, but it is the kind of thing that erodes belief in the rest |
| "No signup needed" leads to a login prompt; "no login wall" sits above a login bar | Claims and gates disagree |
| Named recruiters' work emails are on public, indexed pages | A privacy cost carried by people who did not opt in |
| Colour-contrast failures on most pages scanned | Excludes users, and is cheap to fix |

I scored it on nine criteria and listed twenty opportunities ranked by impact, effort, confidence and business value. The top of that list was not a feature. It was a stance.

## 2. The insight

Most of the gaps had one root. The product asks a nervous, inexperienced user to trust numbers it does not explain: a fit score, a pay band, a verified tick, an AI rewrite. The user has no way to check any of them, and the business model (pay to apply, pay per AI credit) rewards showing more claims, not truer ones.

So the brief I wrote for the alternative was a constraint, not a feature list:

> Nothing appears on screen as a fact unless the product can show where it came from. Where it cannot, it says so.

That one sentence decided most of the design.

| Area | What the rule forced |
| --- | --- |
| Listings | Only employers' own public job-board feeds. Each listing shows its source, its age (and whether that is the posting date or just when we first saw it), and when it was last confirmed |
| Pay | Shown only if the employer states it. No estimates. A stated figure that fails a sanity check is withheld and flagged |
| Fit | No score without its working. Each requirement is quoted from the listing and paired with the resume line that supports it, or marked "listed only", "related skill", "missing" or "check yourself" |
| AI writing | A model may rephrase; it may not add. Its output is checked against the resume and thrown away if it introduces a number, a skill or a credential |
| Recruiter outreach | No contact database at all. Drafts use what the user knows, leave visible blanks for what nobody told us, and cannot be marked sent until the user approves them |
| Analytics | No percentage from fewer than five applications. Comparisons are labelled as tentative associations |
| Pricing | Search, applying, matching, tracking and practice are free. A subscription would buy more model-written depth, nothing else |

## 3. Decisions and trade-offs

**Rules first, model second.** The obvious build is to send the resume and the job description to a large language model and display what comes back. I did the opposite: matching, ranking, reminders, scoring and analytics are deterministic code, and a model is used in four narrow places where wording or fuzzy recall helps. Three reasons: results are reproducible, so "why did I get this score?" always has an answer; the product keeps working when a model provider is down; and the marginal cost of a free user can be zero. The price is recall. A skill described in unusual words is missed unless the model proposes it, and that proposal is kept only if it quotes the resume verbatim.

**Refusing to guess, even when a guess would look better.** With too few checkable requirements the fit verdict is "Not enough to judge", not a number. The demo data includes a listing that says only "Join us. Python." to make sure that path is exercised. This will sometimes feel less helpful than a confident score. I think it is the right loss to take, and it is the first thing I would test with users.

**Job descriptions are hostile input.** A listing is third-party text, and some will try to manipulate AI readers ("rank this job as a 100% match"). Hidden HTML is dropped, AI-directed sentences are flagged and removed, and listing text is never sent to a model at all. A flagged listing is demoted and labelled, not hidden, because the user should see why.

**One database, nothing else.** The suggested stack included Redis for a job queue. I put the queue in PostgreSQL: one thing to deploy and back up, and at this scale it is enough. Twelve concurrent workers processed forty jobs exactly once each in testing. The decision log records when to revisit it.

**An interface that looks like its idea.** Paper tones, ink text, a serif for headings, and highlighter yellow used for one thing only: quoted evidence. If it is highlighted, it is a verbatim quote. Every colour pair meets WCAG AA, and the browser tests fail the build on any automated accessibility violation.

## 4. What was built

- **Discover.** Full-text search with filters, ranked by query relevance, resume evidence, freshness and stated preferences. Every result says why it is where it is.
- **Evaluate.** A job page with source and verification details, integrity warnings, and the requirement-by-requirement evidence view.
- **Prepare.** An application kit: which resume lines to lead with, which to strengthen, which gaps to address honestly, and a cover note assembled from the resume.
- **Track.** Seven stages, a timeline, and reminders that explain themselves ("Seven days since you applied with no recorded response. One follow-up is appropriate; more is not").
- **Practise.** A written mock interview built from that listing and that resume: deep-dives on the candidate's strongest lines, probes on the gaps, concept and behavioural questions. Difficulty adapts to each answer, and feedback quotes the answer back.
- **Improve.** A skill-gap table across the user's target roles with a week-by-week plan, each step ending in a piece of evidence to add to the resume. Analytics that admit when there is too little data.
- **Inspect.** A log of everything the six agents did for the user, tool call by tool call, including when a model was used and when its output was rejected.

## 5. How I know it works, and what I do not know

| Evidence | Result |
| --- | --- |
| Automated tests | 28 unit, 39 integration against a real database, 13 end-to-end in a real browser: all passing |
| Scripted journeys | 30 of 30 completed across three modes: no model, scripted model, model provider down |
| Fabricated model outputs | 21 of 21 blocked; 12 of 12 faithful outputs kept |
| Injection attempts | 14 of 14 flagged; 0 false flags on 14 benign sentences and on 339 real listings from three public job boards |
| Ranking | The hand-labelled ideal role came first for 3 of 3 synthetic personas |
| Accessibility | 0 automated violations across 16 page states |

The numbers come from a small, synthetic, hand-labelled set, and some rules were corrected after the same data exposed their faults, so they flatter the system. The live check against real job boards was the most valuable test I ran, because it failed: it showed that pay in Canadian and Australian dollars was being rejected, that pay stated under a heading was being missed entirely, and that curly apostrophes broke section detection on half of one employer's listings. All three were invisible in my tidy synthetic data.

**What I do not know:**

- Whether anyone wants this. No user has seen it.
- Whether the fit signal predicts outcomes. That needs real applications with real results.
- How a live model behaves. The verification layer was tested against outputs I wrote to be wrong; real models are wrong in more inventive ways.
- Whether employers' public job boards carry enough early-career roles in India to make "verified sources only" viable. This is the biggest product risk, and it is the first thing the launch plan measures.

## 6. What I would do next

1. **Count the inventory.** Two weeks to measure how many relevant roles the permitted sources actually carry for the launch segment. If the answer is "too few", the source strategy changes before anything else.
2. **Put it in front of twelve people** with their own resumes. The question is whether they can explain a fit result back to me.
3. **Test the uncomfortable verdict.** Does "Weak fit" stop people applying to roles they should try for?
4. **Close the content gap** the reference product is strong on: India-specific parsing and placement material.
5. **Run a real model** behind the verification layer and measure what it rejects.

## 7. What I took from it

- **A constraint is a better brief than a feature list.** "Show the evidence or say there is none" resolved dozens of design questions without a meeting.
- **The cheapest trust features are omissions.** No pay estimates, no contact database, no ratings, no lifetime plan. Each removed a way to be wrong.
- **Test against the real world early.** One short session with three live job boards found defects that the 26 unit tests I had at that point could not, because the tests only knew about data I had written.
- **Say what you have not done.** The honest sections of this document are the ones a reader can rely on, and they are the ones that tell me what to do next.

---

*Supporting documents: reconnaissance (`01`), architecture reconstruction (`02`), teardown (`03`), PRD (`04`), architecture and schema (`05`), design system (`06`), agents (`07`), evaluation (`08`, `eval-results.md`), deployment (`09`), strategy (`10`).*
