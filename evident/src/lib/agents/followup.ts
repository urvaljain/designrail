import { z } from "zod";
import { db, json } from "../db";
import { NotFoundError } from "../services/applications";
import { daysBetween } from "../text";
import { runAgent, tool, type AgentOutcome } from "./runtime";

export interface PlannedReminder {
  applicationId: string;
  kind: "follow_up" | "thank_you" | "decide" | "check_status";
  message: string;
  rationale: string;
  dueAt: Date;
  dedupeKey: string;
}

interface AppState {
  id: string;
  status: string;
  appliedAt: Date | null;
  createdAt: Date;
  lastChangeAt: Date;
  job: { title: string; companyName: string; status: string };
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: Date, days: number) => new Date(d.getTime() + days * 86_400_000);

/** Timing rules. Pure, so the schedule is testable and explainable. */
export function planReminders(apps: AppState[], now: Date): PlannedReminder[] {
  const out: PlannedReminder[] = [];
  for (const a of apps) {
    const where = `${a.job.title} at ${a.job.companyName}`;
    const add = (kind: PlannedReminder["kind"], anchor: Date, offsetDays: number, message: string, rationale: string) =>
      out.push({ applicationId: a.id, kind, message, rationale, dueAt: plus(anchor, offsetDays), dedupeKey: `${a.id}:${kind}:${day(anchor)}` });

    if (a.status === "saved") {
      if (a.job.status === "closed") add("check_status", a.lastChangeAt, 0, `The listing for ${where} has closed`, "The source no longer lists this role. Archive it, or check the employer's site if you believe it is still open.");
      else add("decide", a.createdAt, 5, `Decide on ${where}: apply or archive`, "Saved roles go stale. Listings are most responsive in their first weeks, so a saved role is worth a decision within five days.");
    } else if (a.status === "applied" && a.appliedAt) {
      add("follow_up", a.appliedAt, 7, `Follow up on your application for ${where}`, "Seven days have passed since you applied with no recorded response. One short, polite follow-up is appropriate. Sending more than one is not.");
    } else if (a.status === "screening") {
      add("check_status", a.lastChangeAt, 5, `Check in on ${where}`, "Five days since this moved to screening with no update recorded.");
    } else if (a.status === "interview") {
      add("thank_you", a.lastChangeAt, 1, `Send a thank-you note for your ${a.job.companyName} interview`, "A brief thank-you within a day of an interview is standard and keeps you in mind. Update the date if your interview is later.");
    } else if (a.status === "offer") {
      add("decide", a.lastChangeAt, 3, `Respond to your offer from ${a.job.companyName}`, "Offers usually carry a deadline. Confirm the response date with the employer.");
    }
  }
  return out.filter((r) => daysBetween(r.dueAt, now) < 60);
}

/** Follow-Up Agent: decide which reminders should exist. Creating them twice is a no-op. */
export async function planFollowUps(userId: string, opts: { now?: Date; trigger?: string } = {}): Promise<AgentOutcome<{ planned: number; created: number }>> {
  const now = opts.now ?? new Date();
  const loadTool = tool({
    name: "load_applications",
    description: "Load the user's applications with their latest status change.",
    input: z.object({ userId: z.string() }),
    run: async () => {
      const apps = await db.application.findMany({ where: { userId, status: { in: ["saved", "applied", "screening", "interview", "offer"] } }, include: { job: { select: { title: true, companyName: true, status: true } }, events: { orderBy: { at: "desc" }, take: 1 } } });
      return apps.map((a) => ({ id: a.id, status: a.status, appliedAt: a.appliedAt, createdAt: a.createdAt, lastChangeAt: a.events[0]?.at ?? a.createdAt, job: a.job }));
    },
  });
  const createTool = tool({
    name: "create_reminders",
    description: "Create reminders. Existing reminders with the same key are left untouched.",
    input: z.object({ reminders: z.array(z.object({ applicationId: z.string(), kind: z.string(), dedupeKey: z.string(), dueAt: z.date(), message: z.string(), rationale: z.string() })) }),
    run: async (i) => {
      const res = await db.reminder.createMany({ data: i.reminders.map((r) => ({ ...r, userId })), skipDuplicates: true });
      return { created: res.count };
    },
  });
  return runAgent({ agent: "follow_up", userId, trigger: opts.trigger ?? "schedule", input: {} }, async (run) => {
    const apps = await run.call(loadTool, { userId });
    const planned = planReminders(apps, now);
    const { created } = planned.length > 0 ? await run.call(createTool, { reminders: planned }) : { created: 0 };
    return { planned: planned.length, created };
  });
}

// ── Outreach drafts ─────────────────────────────────────────────────────

export interface DraftInput {
  purpose: "follow_up" | "thank_you" | "intro";
  channel: "email" | "linkedin";
  recipientName?: string | null;
  recipientTitle?: string | null;
}

export interface Grounding {
  facts: { fact: string; source: string }[];
  unknowns: string[];
  source: "llm" | "deterministic";
}

export function composeDraft(input: DraftInput, ctx: { jobTitle: string; companyName: string; appliedAt: Date | null; userName: string | null; strength: string | null }): { subject: string | null; body: string; grounding: Grounding } {
  const name = input.recipientName?.trim() || null;
  const facts: Grounding["facts"] = [
    { fact: `Role: ${ctx.jobTitle}`, source: "job listing" },
    { fact: `Employer: ${ctx.companyName}`, source: "job listing" },
  ];
  const unknowns: string[] = [];
  if (name) facts.push({ fact: `Recipient: ${name}${input.recipientTitle ? `, ${input.recipientTitle}` : ""}`, source: "entered by you" });
  else unknowns.push("Recipient name. Evident does not look up or guess recruiter contacts; add the person's name before sending.");
  if (ctx.appliedAt) facts.push({ fact: `Applied on ${ctx.appliedAt.toISOString().slice(0, 10)}`, source: "your tracker" });
  if (ctx.strength) facts.push({ fact: ctx.strength, source: "your resume" });
  if (!ctx.userName) unknowns.push("Your name for the signature.");

  const greeting = name ? `Hi ${name.split(/\s+/)[0]},` : "Hello,";
  const sign = ctx.userName ?? "[Your name]";
  const applied = ctx.appliedAt ? ` on ${ctx.appliedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}` : "";
  const proof = ctx.strength ? ` One relevant example from my background: ${ctx.strength.charAt(0).toLowerCase()}${ctx.strength.slice(1).replace(/[.;]+$/, "")}.` : "";

  let subject: string | null = null;
  let body: string;
  if (input.purpose === "follow_up") {
    subject = `Following up: ${ctx.jobTitle} application`;
    body = `${greeting}\n\nI applied for the ${ctx.jobTitle} role at ${ctx.companyName}${applied} and wanted to check whether there is an update on the process.${proof}\n\nI remain very interested and am happy to share anything else that would help.\n\nThank you,\n${sign}`;
  } else if (input.purpose === "thank_you") {
    subject = `Thank you: ${ctx.jobTitle} interview`;
    body = `${greeting}\n\nThank you for taking the time to speak with me about the ${ctx.jobTitle} role at ${ctx.companyName}. [Mention one specific thing you discussed.]\n\nThe conversation made me more interested in the role, and I would be glad to provide anything further you need.\n\nBest regards,\n${sign}`;
    unknowns.push("A specific detail from the interview. Only you know what was discussed.");
  } else {
    subject = `${ctx.jobTitle} at ${ctx.companyName}`;
    body = `${greeting}\n\nI am interested in the ${ctx.jobTitle} role at ${ctx.companyName}${ctx.appliedAt ? " and have applied through your careers page" : ""}.${proof}\n\nIf you are the right person to speak with about this role, I would appreciate a few minutes of your time. If not, could you point me to who is?\n\nThank you,\n${sign}`;
  }
  if (input.channel === "linkedin") {
    subject = null;
    body = body.replace(/\n\n(Thank you|Best regards),\n/, "\n\n$1,\n");
    if (body.length > 900) body = body.slice(0, 900);
  }
  return { subject, body, grounding: { facts, unknowns, source: "deterministic" } };
}

/** A model-polished draft may not contain contact details or figures that were not supplied. */
export function verifyDraft(body: string, allowed: string): string[] {
  const problems: string[] = [];
  for (const m of body.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) ?? []) if (!allowed.includes(m)) problems.push(`contains an email address (${m}) that was not provided`);
  for (const m of body.match(/\+?\d[\d\s().-]{8,}\d/g) ?? []) if (!allowed.includes(m.trim())) problems.push("contains a phone number that was not provided");
  for (const m of body.match(/https?:\/\/\S+/gi) ?? []) if (!allowed.includes(m)) problems.push("contains a link that was not provided");
  const allowedNums = new Set(allowed.match(/\d+/g) ?? []);
  for (const n of body.match(/\d+/g) ?? []) if (!allowedNums.has(n)) problems.push(`contains the figure "${n}", which is not in the supplied facts`);
  return [...new Set(problems)];
}

/**
 * Follow-Up Agent: draft an outreach message. Drafts are never sent by the platform. A draft
 * must be explicitly approved by the user before it can be marked as sent.
 */
export async function draftOutreach(userId: string, applicationId: string, input: DraftInput): Promise<AgentOutcome<{ draftId: string }>> {
  const app = await db.application.findFirst({ where: { id: applicationId, userId }, include: { job: { select: { title: true, companyName: true } }, user: { select: { name: true } } } });
  if (!app) throw new NotFoundError("Application");
  const match = await db.jobMatch.findFirst({ where: { userId, jobId: app.jobId }, orderBy: { computedAt: "desc" } });
  const items = (match?.breakdown as { items?: { status: string; evidence: { quote: string }[] }[] } | null)?.items ?? [];
  const strength = items.find((i) => i.status === "demonstrated")?.evidence[0]?.quote ?? null;

  const composeTool = tool({
    name: "compose_draft",
    description: "Fill a message template using only known facts. Unknowns are left as visible placeholders.",
    input: z.object({ purpose: z.enum(["follow_up", "thank_you", "intro"]), channel: z.enum(["email", "linkedin"]), recipientName: z.string().max(80).nullish(), recipientTitle: z.string().max(80).nullish() }),
    run: (i) => composeDraft(i, { jobTitle: app.job.title, companyName: app.job.companyName, appliedAt: app.appliedAt, userName: app.user.name, strength }),
  });

  return runAgent({ agent: "follow_up", userId, trigger: "draft_outreach", input: { applicationId, purpose: input.purpose, channel: input.channel } }, async (run) => {
    const base = await run.call(composeTool, input);
    const allowed = `${base.body}\n${base.grounding.facts.map((f) => f.fact).join("\n")}`;
    const res = await run.assist(
      {
        task: "outreach.polish",
        system:
          "You lightly edit a short professional message for clarity and warmth. Keep every fact exactly as given. Never add names, contact details, links, dates, numbers or claims. Keep bracketed placeholders exactly as written. Stay under 130 words.",
        prompt: `Edit this ${input.channel} message:\n\n${base.body}`,
        schema: z.object({ body: z.string().min(40).max(1600) }),
        maxTokens: 1200,
      },
      () => ({ body: base.body }),
      (data) => {
        const problems = verifyDraft(data.body, allowed);
        const lostPlaceholder = (base.body.match(/\[[^\]]+\]/g) ?? []).some((p) => !data.body.includes(p));
        if (lostPlaceholder) problems.push("removed a placeholder that only the user can fill in");
        return problems.length > 0 ? { ok: false, problems } : { ok: true, data, problems: [] };
      },
    );
    const draft = await db.outreachDraft.create({
      data: {
        userId,
        applicationId,
        channel: input.channel,
        purpose: input.purpose,
        recipientName: input.recipientName?.trim() || null,
        recipientTitle: input.recipientTitle?.trim() || null,
        subject: base.subject,
        body: res.data.body,
        status: "draft",
        grounding: json({ ...base.grounding, source: res.source }),
      },
      select: { id: true },
    });
    await db.applicationEvent.create({ data: { applicationId, type: "outreach", note: `Drafted a ${input.purpose.replace("_", " ")} message (${input.channel}). Awaiting your approval.` } });
    return { draftId: draft.id };
  });
}

const DRAFT_TRANSITIONS: Record<string, string[]> = { draft: ["approved", "discarded"], approved: ["sent_by_user", "discarded", "draft"], sent_by_user: [], discarded: [] };

/** State machine for drafts. "sent_by_user" is reachable only through "approved". */
export async function transitionDraft(userId: string, draftId: string, to: "approved" | "sent_by_user" | "discarded" | "draft", edits?: { body?: string; subject?: string | null }): Promise<void> {
  const draft = await db.outreachDraft.findFirst({ where: { id: draftId, userId } });
  if (!draft) throw new NotFoundError("Draft");
  if (to === draft.status && to === "draft" && edits) {
    await db.outreachDraft.update({ where: { id: draft.id }, data: { body: (edits.body ?? draft.body).slice(0, 4000), subject: edits.subject === undefined ? draft.subject : edits.subject?.slice(0, 200) ?? null } });
    return;
  }
  if (!(DRAFT_TRANSITIONS[draft.status] ?? []).includes(to)) throw new Error(`A ${draft.status.replace(/_/g, " ")} message cannot be moved to "${to.replace(/_/g, " ")}".`);
  await db.outreachDraft.update({
    where: { id: draft.id },
    data: { status: to, approvedAt: to === "approved" ? new Date() : draft.approvedAt, ...(edits?.body ? { body: edits.body.slice(0, 4000) } : {}), ...(edits?.subject !== undefined ? { subject: edits.subject?.slice(0, 200) ?? null } : {}) },
  });
  if (to === "approved" || to === "sent_by_user") {
    await db.applicationEvent.create({ data: { applicationId: draft.applicationId, type: "outreach", note: to === "approved" ? "You approved an outreach message." : "You marked an outreach message as sent." } });
  }
}
