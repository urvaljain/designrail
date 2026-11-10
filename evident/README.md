# Evident

**A career platform that shows its evidence.** Evident finds real openings, shows line by line how your resume supports each one, helps you prepare an honest application, tracks it with reasoned reminders, and coaches you for the interview.

It was built as an original alternative to a reference product, [Astra](https://useastra.in/), after a public-surface teardown. It lives in this repository as a self-contained application with its own dependencies and CI; it does not share code with DesignRail.

> **Status: a working demonstration, not a launched product.** It runs locally against PostgreSQL and passes its automated suites. It has not been deployed publicly, has taken no payments, has had no real users, and no live AI model call was made while building it. See [what is real and what is not](#what-is-real-and-what-is-not).

## The core journey

1. **Find** a role: full-text search over listings from employers' own job boards, ranked by your resume evidence, freshness and preferences, with the reason for each ranking.
2. **Check your fit:** every requirement quoted from the listing, paired with the resume line that supports it, or marked listed-only, related, missing or unverifiable.
3. **Prepare:** an application kit with the lines to lead with, the gaps to handle honestly, and a cover note that adds nothing your resume does not say.
4. **Track:** stages, a timeline, and follow-up reminders that state their reason. Outreach is drafted for you and never sent for you.
5. **Practise:** a mock interview built from that listing and your resume, adapting to your answers, with feedback that quotes what you wrote.

Then a skill-gap roadmap, outcome analytics, and a full log of what each agent did.

## Quick start

Requires Node.js 22+ and PostgreSQL 14+.

```bash
cd evident
```

```bash
npm ci
```

```bash
cp .env.example .env
```

Create a database, set `DATABASE_URL` in `.env`, then:

```bash
npm run db:migrate
```

```bash
npm run sync
```

```bash
npm run dev
```

Open http://localhost:3000, create an account, paste a resume, and search. `npm run sync` loads the synthetic demo board; add real boards with `JOB_SOURCES` (see the deployment guide). Run `npm run worker` in a second terminal for scheduled syncs, link checks and reminders.

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm run worker` | Background worker: scheduler and queue consumer |
| `npm run sync` | Sync every enabled job source once |
| `npm run db:migrate` | Apply migrations |
| `npm test` | Unit and integration tests (needs `TEST_DATABASE_URL` or the default local test database, migrated) |
| `npm run test:e2e` | Browser tests against a production build (run `npm run build` first) |
| `npm run eval` | Evaluation harness; rewrites `docs/eval-results.md` |
| `npm run typecheck`, `npm run lint` | Static checks |

## What is real and what is not

| Area | State |
| --- | --- |
| Search, matching, tracking, reminders, interviews, roadmap, analytics, audit log | Built and tested |
| Greenhouse, Lever and Ashby connectors | Built; unit-tested with in-memory responses; checked once by hand against live public boards |
| Demo job board | **Synthetic.** Fictional companies, labelled "Demo data" wherever shown |
| AI model use (Anthropic or any OpenAI-compatible endpoint) | Built behind a provider interface with verification and fallback; **tested only with a scripted provider**. Off by default |
| Sign-in with Google or GitHub | Built; **not exercised against live providers**. Email and password sign-in is tested |
| Billing | **Demonstration only.** A plan switch changes allowances; no payment is taken |
| Docker image, compose file, GitHub Actions workflow | Written; **not run** in the build environment |
| Public deployment | **None** |
| User research | **None.** Personas and pricing are hypotheses |

## Documents

| # | Document | Contents |
| --- | --- | --- |
| 1 | [Product reconnaissance](docs/01-reconnaissance.md) | Feature inventory, flows, pricing and accessibility findings for the reference product, each classified as observed, inferred, hypothetical or unverified |
| 2 | [Architecture reconstruction](docs/02-architecture-reconstruction.md) | What can be inferred about how the reference is built, and what Evident does instead |
| 3 | [Competitive teardown](docs/03-teardown.md) | Scorecard and 20 ranked opportunities |
| 4 | [Product requirements](docs/04-product-design.md) | Principle, personas, requirements and status, flows, acceptance criteria |
| 5 | [Architecture and schema](docs/05-architecture.md) | System design, data model, search, queue, AI pipeline, security model, decision log |
| 6 | [Design system](docs/06-design-system.md) | Tokens with contrast ratios, type, components, content and accessibility rules |
| 7 | [Agents](docs/07-agents.md) | The runtime contract and the six agents |
| 8 | [Evaluation report](docs/08-evaluation-report.md) and [measured results](docs/eval-results.md) | Adversarial scenarios, results, defects found, what was not tested |
| 9 | [Deployment](docs/09-deployment.md) | Environment configuration, local and container runs, operations |
| 10 | [Strategy](docs/10-strategy.md) | Positioning, pricing hypotheses, unit economics model, metrics, experiments, roadmap, 90-day plan |
| 11 | [Case study](docs/11-case-study.md) | The portfolio write-up |

## Layout

```text
evident/
  prisma/            schema and SQL migration
  src/app/           pages, server actions, route handlers
  src/components/    UI primitives and feature components
  src/lib/           domain logic, agents, LLM layer, services, auth, queue, sources
  src/worker/        scheduler and queue consumer
  tests/             unit, integration (PostgreSQL), end-to-end (Playwright + axe)
  evals/             labelled data and the evaluation harness
  docs/              the documents above
```

## Ground rules the code enforces

- Pay is shown only when the employer states it. There is no estimation code.
- No recruiter or contact data is collected or looked up.
- Job-description text is never sent to a model.
- Model output is checked against source text and discarded if it adds facts.
- Nothing is sent on a user's behalf; drafts need explicit approval.
- Every user-data query is scoped to the signed-in user.
