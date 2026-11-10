import type { Metadata } from "next";
import { uploadResumeAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, EvidenceQuote, Field, FlashMessages, Input, Notice, PageHeader, Stat, Textarea } from "@/components/ui";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { WARNING_TEXT, type ParsedResume, type ResumeWarning } from "@/lib/resume/parse";

export const metadata: Metadata = { title: "Resume" };

export default async function ResumePage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  const latest = await db.resume.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
  const active = profile?.activeResumeId ? await db.resume.findFirst({ where: { id: profile.activeResumeId, userId: user.id } }) : null;
  const shown = latest ?? active;
  const parsed = shown ? (shown.parsed as unknown as ParsedResume) : null;
  const years = parsed?.experienceMonths != null ? (parsed.experienceMonths >= 12 ? `${(parsed.experienceMonths / 12).toFixed(1)} yrs` : `${parsed.experienceMonths} mo`) : "Unknown";

  return (
    <>
      <PageHeader title="Resume" lead="Evident reads your resume once and keeps the exact lines that prove each skill. Those lines are what every fit assessment cites." />
      <FlashMessages error={error} notice={notice} />

      <Card className="mb-6">
        <CardTitle>{shown ? "Replace your resume" : "Add your resume"}</CardTitle>
        <form action={uploadResumeAction} className="mt-4 space-y-4">
          <Field label="Upload a file" htmlFor="file" hint="PDF, DOCX or TXT, up to 3 MB.">
            <Input id="file" name="file" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,text/plain" aria-describedby="file-hint" className="py-2" />
          </Field>
          <Field label="Or paste the text" htmlFor="text" hint="Use this if your PDF does not read correctly.">
            <Textarea id="text" name="text" rows={6} maxLength={60000} aria-describedby="text-hint" />
          </Field>
          <SubmitButton pendingLabel="Reading your resume…">Read my resume</SubmitButton>
        </form>
      </Card>

      {shown && parsed ? (
        <section aria-labelledby="analysis">
          <h2 id="analysis" className="text-2xl font-semibold">What was read</h2>
          <p className="mt-1 text-sm text-muted">
            {shown.filename} · added {shown.createdAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} ·{" "}
            <Badge tone={shown.status === "parsed" ? "good" : shown.status === "failed" ? "bad" : "warn"}>{shown.status === "parsed" ? "Read cleanly" : shown.status === "failed" ? "Could not be read" : "Read with warnings"}</Badge>
            {shown.status === "failed" && active && active.id !== shown.id ? " Your earlier resume is still the one in use." : ""}
          </p>

          {parsed.warnings.length > 0 ? (
            <Notice tone={shown.status === "failed" ? "bad" : "warn"} className="mt-4" title="Problems found">
              <ul className="list-disc space-y-1 pl-5">
                {parsed.warnings.map((w) => (
                  <li key={w}>{WARNING_TEXT[w as ResumeWarning] ?? w}</li>
                ))}
              </ul>
            </Notice>
          ) : null}

          {shown.status !== "failed" ? (
            <>
              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Stat label="Skills with evidence" value={parsed.skills.length} />
                <Stat label="Demonstrated" value={parsed.skills.filter((s) => s.strength === "demonstrated").length} note="Used in experience or projects" />
                <Stat label="Dated experience" value={years} />
                <Stat label="Lines with a number" value={`${parsed.stats.bulletsWithMetrics}/${parsed.stats.bullets}`} note="Experience and project lines" />
              </div>

              <Card className="mt-5">
                <CardTitle>Skills and the lines that prove them</CardTitle>
                <p className="mt-1 text-sm text-muted">“Demonstrated” means a line in your experience or projects shows you using the skill. “Listed” means it only appears in a skills list, which carries less weight in matching.</p>
                {parsed.skills.length === 0 ? (
                  <p className="mt-4 text-muted">No recognised skills were found.</p>
                ) : (
                  <ul className="mt-3 divide-y divide-line">
                    {parsed.skills.map((s) => (
                      <li key={s.skillId} className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{s.name}</span>
                          <Badge tone={s.strength === "demonstrated" ? "good" : "warn"}>{s.strength === "demonstrated" ? "Demonstrated" : "Listed only"}</Badge>
                        </div>
                        <div className="mt-2 space-y-2">
                          {s.evidence.slice(0, 2).map((e) => (
                            <EvidenceQuote key={e.lineId} quote={e.quote} source={`Line ${e.lineId.replace("L", "")}`} />
                          ))}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
