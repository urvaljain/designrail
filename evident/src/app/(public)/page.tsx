import { ButtonLink, Card, CardTitle, EvidenceQuote, FlashMessages, Badge } from "@/components/ui";

const PRINCIPLES = [
  { title: "Every listing shows its source", body: "Jobs come from employers' own job boards. Each one shows where it came from, when it was posted, and when Evident last confirmed it was still open. Closed roles are marked closed." },
  { title: "Every fit score shows its evidence", body: "A match is a list of the role's requirements, each one tied to the exact line of your resume that supports it, or marked as missing. No score without a reason you can check." },
  { title: "Nothing is invented", body: "Pay is shown only when the employer states it. Evident does not estimate salaries, guess recruiter contacts, or add skills to your resume that are not there." },
  { title: "You approve what leaves", body: "Follow-up messages are drafts. Nothing is ever sent for you, and a draft cannot be marked as sent until you have approved it." },
];

const STEPS = [
  ["Find", "Search verified listings, ranked by your resume evidence, freshness and preferences."],
  ["Check your fit", "See requirement by requirement what your resume proves, what it only lists, and what is missing."],
  ["Prepare", "Get an application kit built from your own resume lines, with the gaps stated honestly."],
  ["Track", "Move each application through its stages. Reminders tell you when a follow-up is due, and why."],
  ["Practise", "Run a mock interview on that exact role. Questions adapt to your answers and feedback quotes what you said."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  return (
    <div>
      <section className="mx-auto max-w-5xl px-4 pb-14 pt-12 sm:pt-20">
        <FlashMessages notice={notice} />
        <p className="text-sm font-semibold uppercase tracking-wider text-accent-ink">For students, graduates and early-career job seekers</p>
        <h1 className="mt-3 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
          Job advice you can <mark>check</mark>.
        </h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">
          Evident finds real openings, shows exactly how your resume matches each one, helps you prepare an honest application, tracks it, and coaches you for the interview. Every recommendation comes with the evidence behind it.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <ButtonLink href="/signup">Create a free account</ButtonLink>
          <ButtonLink href="/login" variant="secondary">
            Sign in
          </ButtonLink>
        </div>
        <p className="mt-3 text-sm text-muted">Searching, applying and tracking are free. Applying always happens on the employer&apos;s own site.</p>

        <Card className="mt-12 max-w-3xl">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="good">Demonstrated</Badge>
            <span className="font-semibold">PostgreSQL</span>
            <span className="text-sm text-muted">must-have requirement</span>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <EvidenceQuote quote="Experience with PostgreSQL and REST API design" source="From the job listing" />
            <EvidenceQuote quote="Reduced p95 response time by 40% by adding PostgreSQL indexes and Redis caching" source="Your resume, line 9" />
          </div>
          <p className="mt-3 text-sm text-muted">An illustration of how a single requirement is shown. The same view marks requirements you only list, and ones your resume does not support.</p>
        </Card>
      </section>

      <section aria-labelledby="principles" className="border-y border-line bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-14">
          <h2 id="principles" className="text-3xl font-semibold">
            Four rules the product is built on
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <li key={p.title}>
                <Card className="h-full bg-paper">
                  <CardTitle as="h3">{p.title}</CardTitle>
                  <p className="mt-2 text-muted">{p.body}</p>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="how" className="mx-auto max-w-5xl px-4 py-14">
        <h2 id="how" className="text-3xl font-semibold">
          One connected workflow
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map(([title, body], i) => (
            <li key={title} className="rounded-card border border-line bg-surface p-4">
              <p className="font-mono text-sm text-muted">Step {i + 1}</p>
              <h3 className="mt-1 text-lg font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10">
          <ButtonLink href="/signup">Start with your resume</ButtonLink>
        </div>
      </section>
    </div>
  );
}
