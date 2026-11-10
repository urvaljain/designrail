# 3. Competitive teardown: Astra

An assessment of Astra's public product against nine criteria, then a ranked list of opportunities. Evidence is cited from `01-reconnaissance.md`. Scores are this author's judgement on a 1 to 5 scale from public material only; the signed-in product may be better or worse than its public description.

## Scorecard

| Criterion | Score | Why |
| --- | --- | --- |
| User problem clarity | 4 | The audience is unmistakable: Indian students and freshers. Pay in LPA, batch years, CGPA cut-offs and named campus tests show real domain knowledge |
| Time to first value | 3 | Browsing is instant and needs no account. The two most valuable actions, searching and applying, are paid. "No signup needed" on Resume to Jobs leads to a login modal |
| Job relevance and freshness | 3 | Daily additions and "Posted N days ago" are shown. Relevance rests on stated preferences. Three different open-role counts are published at once |
| Trustworthiness of data | 2 | Pay bands look estimated but are not labelled on the job page; a "Verified" badge carries no date; a sampled listing contradicts itself on experience; descriptions are one-line summaries; a 4.9 rating has no source |
| Resume feedback usefulness | 3 (unverified) | The rubric and "a fix for every flagged line" are the right shape. Nothing public shows feedback tied to evidence in the resume, and full results are paid |
| Interview preparation quality | 3 | Breadth is strong: 873 questions with model answers, company-wise banks. The mock interview is configured by role and type, not by a specific listing or by the candidate's resume |
| Workflow friction | 2 | Two spaces, 20+ sidebar destinations, 7 free tools, a manual "Mark as applied" tap, a credit meter. The tools are separate entry points more than one flow |
| Retention potential | 3 | Daily listings, flashcards and a planner give reasons to return. A lifetime plan removes the commercial reason to keep earning the visit |
| Monetisation fairness | 2 | Charging to follow a link to an employer's own page is the weakest point. Struck-through prices, a "peak hiring season" banner, a guarantee claimable only by email after 60 days, and no other refunds add pressure |

**What Astra does well and Evident should respect:** sharp audience focus; India-specific content depth; a no-middleman stance on applications; a serious question bank; unusually good machine-readable publishing (`llms.txt`, Markdown alternates).

## Improvement opportunities

Each is scored 1 to 5 for user impact, confidence that the problem is real (from evidence), and business value; effort is 1 (days) to 5 (quarters). Priority = impact × confidence × business value ÷ effort. "Built" says whether Evident implements it today.

| Rank | Opportunity | Evidence | Impact | Effort | Confidence | Business value | Priority | Built |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Never paywall the apply link or search | Guide: "Applying needs a paid plan"; search control labelled "Upgrade to search" | 5 | 1 | 5 | 4 | 100 | Yes |
| 2 | Show pay only when the employer states it, and say so | Unlabelled bands on job pages; identical bands across cards | 5 | 1 | 5 | 4 | 100 | Yes |
| 3 | Put the fit assessment on every listing, with the resume lines that justify it | Matching is a separate upload tool; feed ranks by preferences | 5 | 2 | 4 | 5 | 50 | Yes |
| 4 | Date every verification and state what was verified | "Verified" badge without a timestamp | 4 | 1 | 5 | 3 | 60 | Yes |
| 5 | Detect and flag contradictory or suspicious listings | "Fresher · 1+ years" with "6+ months" in text | 4 | 2 | 4 | 4 | 32 | Yes |
| 6 | Tie the mock interview to one listing and to the candidate's resume | Copilot setup is role and type only | 4 | 2 | 4 | 4 | 32 | Yes |
| 7 | Schedule follow-ups automatically with a stated reason | Tracker described as stages and counts only | 4 | 2 | 4 | 4 | 32 | Yes |
| 8 | Collapse the tools into one flow per job: fit, kit, track, practise | 7 free tools, 2 spaces, 20+ destinations | 4 | 3 | 4 | 4 | 21 | Yes |
| 9 | Keep one consistent count for every published number | Three role counts, two recruiter counts | 3 | 1 | 5 | 3 | 45 | Yes (counts come from one query) |
| 10 | Fix colour contrast and small tap targets | axe failures on most pages; 60+ small targets | 3 | 2 | 5 | 2 | 15 | Yes (0 axe violations in e2e) |
| 11 | Replace the recruiter-email directory with drafts the user addresses | Named individuals' emails public | 3 | 2 | 4 | 3 | 18 | Yes (no contact lookup at all) |
| 12 | Explain every recommendation and rank position | No public rationale for "For You" | 4 | 2 | 3 | 4 | 24 | Yes |
| 13 | Skill-gap analysis across the user's target roles, with a plan | Roadmap page is a static fresher guide | 4 | 3 | 3 | 4 | 16 | Yes |
| 14 | Analytics that withhold rates until the sample supports them | Analytics are raw counts | 3 | 2 | 3 | 3 | 13.5 | Yes |
| 15 | Subscription that can be cancelled, in place of lifetime plans | ₹899 lifetime with monthly AI credits | 3 | 2 | 4 | 5 | 30 | Designed, billing not built |
| 16 | Make AI features degrade gracefully instead of metering credits | "Each use spends AI credits" | 3 | 3 | 3 | 4 | 12 | Yes |
| 17 | Give users the log of what AI did for them | No audit surface is described | 3 | 2 | 3 | 3 | 13.5 | Yes |
| 18 | Remove unsourced ratings and store badges for an unreleased app | "Rated 4.9"; App Store buttons above a waitlist | 2 | 1 | 5 | 2 | 20 | Yes (no testimonials or ratings exist) |
| 19 | One-click data export and account deletion | Not mentioned publicly | 3 | 1 | 3 | 3 | 27 | Yes |
| 20 | India-specific depth: campus tests, LPA, batch eligibility | Astra's strongest asset | 5 | 4 | 5 | 5 | 31 | **No.** Evident's taxonomy and parsers are generic; this is the largest gap in Evident's favour to close |

## Where Astra is ahead of Evident today

Stated plainly so the comparison is not one-sided:

- **Inventory.** Thousands of live Indian listings against Evident's configured boards plus a demo board.
- **Content.** 873 interview questions, 701 DSA problems, 28 company question sets. Evident has curated questions for 13 skills and generated ones for the rest.
- **Resume and portfolio builders, a browser autofill extension, a mobile waitlist, an employer marketplace.** Evident has none of these.
- **Payments and distribution.** Astra takes UPI and has community channels. Evident's billing is a labelled demo.
- **Real users.** Evident has not been used by anyone outside automated tests.
