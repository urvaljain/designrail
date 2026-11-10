import type { Metadata } from "next";
import { deleteAccountAction, savePreferencesAction, setPlanAction } from "@/app/actions";
import { SubmitButton } from "@/components/client";
import { Badge, Card, CardTitle, Field, FlashMessages, Input, Notice, PageHeader, Select } from "@/components/ui";
import { aiAllowance } from "@/lib/agents/runtime";
import { requireUser } from "@/lib/auth/server";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const user = await requireUser();
  const { error, notice } = await searchParams;
  const [profile, allowance] = await Promise.all([db.profile.findUnique({ where: { userId: user.id } }), aiAllowance(user.id)]);

  return (
    <>
      <PageHeader title="Settings" />
      <FlashMessages error={error} notice={notice} />
      <div className="max-w-3xl space-y-6">
        <Card>
          <CardTitle>Preferences</CardTitle>
          <p className="mt-1 text-sm text-muted">Used to rank jobs. When a preference affects a ranking, the listing says so.</p>
          <form action={savePreferencesAction} className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field label="Name" htmlFor="name"><Input id="name" name="name" defaultValue={user.name ?? ""} maxLength={80} autoComplete="name" /></Field>
            <Field label="Where you are now" htmlFor="stage">
              <Select id="stage" name="stage" defaultValue={profile?.stage ?? "student"}>
                <option value="student">Student</option>
                <option value="graduate">Recent graduate</option>
                <option value="early_career">Early career (under 3 years)</option>
              </Select>
            </Field>
            <Field label="Target roles" htmlFor="targetRoles" hint="Comma-separated, e.g. backend engineer, data analyst" className="sm:col-span-2">
              <Input id="targetRoles" name="targetRoles" defaultValue={profile?.targetRoles.join(", ") ?? ""} maxLength={400} aria-describedby="targetRoles-hint" />
            </Field>
            <Field label="Preferred locations" htmlFor="locations" hint="Comma-separated cities">
              <Input id="locations" name="locations" defaultValue={profile?.locations.join(", ") ?? ""} maxLength={400} aria-describedby="locations-hint" />
            </Field>
            <Field label="Graduation year" htmlFor="graduationYear">
              <Input id="graduationYear" name="graduationYear" type="number" min={1990} max={2040} defaultValue={profile?.graduationYear ?? ""} />
            </Field>
            <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="remoteOk" defaultChecked={profile?.remoteOk ?? true} className="h-5 w-5 accent-accent" /> Open to remote roles
            </label>
            <div className="sm:col-span-2"><SubmitButton pendingLabel="Saving…">Save preferences</SubmitButton></div>
          </form>
        </Card>

        <Card>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Plan</CardTitle>
            <Badge tone="accent">{user.plan === "plus" ? "Plus" : "Free"}</Badge>
          </div>
          <Notice tone="info" className="mt-3" title="Demonstration billing">No payment is taken. Switching plans here only changes the monthly allowance of model-backed runs, so the entitlement logic can be seen working.</Notice>
          <p className="mt-3 text-sm">Model-backed runs this month: {allowance.used} of {allowance.limit}. Searching, matching, tracking, reminders and rubric-scored interviews are never limited.</p>
          <form action={setPlanAction} className="mt-3">
            <input type="hidden" name="plan" value={user.plan === "plus" ? "free" : "plus"} />
            <SubmitButton variant="secondary" pendingLabel="Switching…">{user.plan === "plus" ? "Switch to Free" : "Switch to Plus (demo)"}</SubmitButton>
          </form>
        </Card>

        <Card>
          <CardTitle>Your data</CardTitle>
          <p className="mt-1 text-sm text-muted">Download everything Evident holds about you as JSON: your resumes, applications, drafts, interview answers and the agent log.</p>
          <a href="/api/account/export" download className="mt-3 inline-flex min-h-11 items-center rounded-control border border-line-strong px-4 text-sm font-semibold hover:bg-sunken">Download my data</a>
        </Card>

        <Card className="border-bad">
          <CardTitle>Delete account</CardTitle>
          <p className="mt-1 text-sm text-muted">Permanently deletes your account and everything linked to it. This cannot be undone.</p>
          <form action={deleteAccountAction} className="mt-3 space-y-3">
            <Field label={`Type ${user.email} to confirm`} htmlFor="confirm"><Input id="confirm" name="confirm" autoComplete="off" required /></Field>
            <SubmitButton variant="danger" pendingLabel="Deleting…">Delete my account</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
