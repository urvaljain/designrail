# 2. Architecture reconstruction: Astra

What can be said about how Astra is built from public behaviour and public front-end files, and what Evident does instead. Evidence classes are the same as in the reconnaissance report. Nothing here came from private APIs, source maps or authenticated sessions, and Evident copies none of it: see `05-architecture.md` for the original design.

## Observed technologies

| Area | Evidence | Conclusion | Class |
| --- | --- | --- | --- |
| Framework | `x-powered-by: Next.js`; `self.__next_f` flight payloads; `vary: rsc, next-router-state-tree` | Next.js App Router with React Server Components | Observed |
| Bundler | A chunk named `turbopack-*.js` | Turbopack production build | Observed |
| Hosting | `x-opennext: 1`, `server: cloudflare`, `cf-ray` | OpenNext adapter on Cloudflare Workers | Observed |
| Edge caching | `cache-control: public, s-maxage=3600, stale-while-revalidate=86400` on HTML | Pages are cached at the edge for an hour and revalidated in the background | Observed |
| Mutations | Pages `POST` to their own URL; chunks reference `next-action` | Next.js Server Actions | Observed |
| Backend data | Browser calls `POST /rest/v1/rpc/get_companies` and `/rest/v1/rpc/get_quiz`; `@supabase/ssr` in a chunk; host `auth.useastra.in` | Supabase (PostgreSQL behind PostgREST), with RPC functions called from the client, on a custom domain | Observed |
| Auth | Login offers Google and a 6-digit email code | Supabase Auth: Google OAuth and email OTP | Inferred |
| Payments | `razorpay` string in a chunk; UPI and card buttons | Razorpay one-time payments | Observed (string), Inferred (integration) |
| UI | Radix primitives, `--tw-` custom properties, Lucide icons, Geist fonts, a `data-astra-theme="sand"` attribute | Tailwind CSS with Radix and a home-grown theme switch | Observed |
| Analytics | Requests to `datafa.st`, `piqo.app`, `static.cloudflareinsights.com` | DataFast, a second third-party script, Cloudflare Web Analytics | Observed (requests) |
| Images | `GET /api/logo/name/<Company>` and `/api/logo/<domain>` | A first-party logo proxy | Observed |
| SEO and answer-engine surface | `llms.txt`, `llms-full.txt` (576 KB), Markdown alternates via a `Link` header, JSON-LD (`ItemList`, `FAQPage`, `BreadcrumbList`) | Deliberate optimisation for AI crawlers | Observed |
| AI vendors | The strings `openai` and `gemini` occur in client chunks | Not enough to say which models run server-side | Unverified |

## Inferred design

| Topic | Inference | Basis |
| --- | --- | --- |
| Rendering | Server-rendered listing and detail pages, cached at the edge; client components for filters, view switches and modals | Cache headers, RSC payloads |
| Client state | No client state library was detected in the home-page chunks; state is likely URL parameters plus React state | Absence of Zustand, Redux, TanStack Query and SWR strings (absence in 28 files is weak evidence) |
| API style | Three styles side by side: Server Actions for page mutations, PostgREST RPC from the browser for reads, and a few `/api/*` routes (`/api/ping`, `/api/logo`, `/api/fresh-roles`) | Observed requests |
| Authorisation | Postgres row-level security is the natural fit for browser-to-PostgREST calls | Hypothetical: no policy was observed |
| Data model | `jobs` (sequential numeric ids appear in URLs, e.g. `...-17601`), `internships`, `companies`, `recruiter_contacts` with a verification timestamp, `campus_questions`, `quizzes`, `resumes`, `portfolios`, `tracker_items` with six stages, `preferences`, `ai_credit_ledger`, `payments`, `plans` | URLs, pricing table, guide |
| Ingestion | Scheduled crawls of employer career pages and ATS boards, with link re-checks | "checked and added every day"; "links are re-checked automatically"; a live counter of roles added in 24 hours |
| Salary | Banded estimates assigned by function, level and city where the employer states none | Identical bands across unrelated cards; "Estimated pay" in metadata |
| Ranking | Preference filters, then recency | Guide FAQ |
| AI pipeline | Resume parsed to text, then a rubric prompt with structured output; a per-use credit decrement | Rubric described on feature pages; "each use spends AI credits" |
| Rate limiting | A credit ledger doubles as the limit on model calls; Cloudflare in front for abuse | Pricing, hosting |
| Background work | Cloudflare cron triggers or Supabase scheduled functions | Hypothetical |
| Entitlements | A paid flag plus counters (swipes, resumes, credits); checked server-side for apply and search | Paywall behaviour |

## Risks visible from outside

| Risk | Why it matters | Class |
| --- | --- | --- |
| Browser calls database RPCs directly | Correctness of every policy becomes a security boundary; a missed policy leaks data | Inferred |
| Lifetime plan with recurring model costs | 50 credits a month forever against a single ₹899 payment | Observed pricing, Inferred cost |
| Estimated pay shown beside real listings | A trust problem if the estimate is wrong, and a legal one where pay disclosure is regulated | Observed |
| Personal data on public pages | Recruiter names and emails are indexed by search engines | Observed |
| Heavy programmatic SEO | 7,000+ generated pages depend on listing freshness; stale pages hurt trust and ranking | Inferred |

## What Evident does differently

| Concern | Astra (observed or inferred) | Evident (implemented) |
| --- | --- | --- |
| Data access | Browser to PostgREST | Browser never talks to the database. Server components and Server Actions call a service layer in which every function takes the acting user's id and scopes its query by it |
| Job sources | Crawling career pages | Public, documented job-board APIs only (Greenhouse, Lever, Ashby), configured explicitly, plus a labelled synthetic board |
| Pay | Estimated bands | Employer-stated only, validated; otherwise "not disclosed" |
| Matching | Preferences and recency; resume match as a separate tool | Evidence match computed for every listing in every result |
| AI | Credit-metered model calls | Deterministic engine first; a model is optional, verified against source text, and falls back automatically |
| Search | Paid | PostgreSQL full-text search, free |
| Apply | Paid | A plain link, always free |
| Background jobs | Unknown | A durable queue in PostgreSQL with `SKIP LOCKED`, retries and a dead-letter state |
| Auditability | None public | Every agent run and tool call is stored and shown to the user |
