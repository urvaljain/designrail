import type { Metadata } from "next";
import { ButtonLink, Card, CardTitle, Notice } from "@/components/ui";

export const metadata: Metadata = { title: "Pricing" };

const FREE = ["Search every listing, with sources and freshness", "Apply on the employer's site: never paywalled", "Evidence-based fit for every job", "Application tracker and follow-up reminders", "Application kits, outreach drafts and mock interviews", "Skill roadmap and analytics", "Export or delete your data at any time"];
const PLUS = ["Everything in Free", "A larger monthly allowance of model-written feedback and drafts", "Longer mock interviews"];

export default function Pricing() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-4xl font-semibold">Pricing</h1>
      <p className="mt-3 max-w-2xl text-muted">
        The core journey is free: finding a job, checking your fit, applying, tracking and practising. Paying only raises the allowance for features that cost money to run.
      </p>
      <Notice tone="info" className="mt-6 max-w-2xl" title="Demonstration billing">
        Evident does not take payments yet. Plus can be switched on from Settings to see how allowances change. Prices shown are a pricing hypothesis, documented in the product strategy.
      </Notice>
      <div className="mt-8 grid gap-5 md:grid-cols-2">
        <Card>
          <CardTitle>Free</CardTitle>
          <p className="display mt-2 text-4xl font-semibold">₹0</p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5">
            {FREE.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <ButtonLink href="/signup" className="mt-6">
            Create a free account
          </ButtonLink>
        </Card>
        <Card>
          <CardTitle>Plus</CardTitle>
          <p className="display mt-2 text-4xl font-semibold">
            ₹299 <span className="font-sans text-base font-normal text-muted">a month, cancel any time (hypothesis)</span>
          </p>
          <ul className="mt-4 list-disc space-y-1.5 pl-5">
            {PLUS.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">No lifetime plans, no job guarantees, no countdown timers. If model-written feedback is unavailable, the built-in rubric still works on every plan.</p>
        </Card>
      </div>
    </div>
  );
}
