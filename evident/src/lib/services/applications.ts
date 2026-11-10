import { db } from "../db";

export const STATUSES = ["saved", "applied", "screening", "interview", "offer", "rejected", "withdrawn"] as const;
export type AppStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<AppStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  screening: "Screening",
  interview: "Interview",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export class NotFoundError extends Error {
  constructor(what = "Record") {
    super(`${what} not found.`);
    this.name = "NotFoundError";
  }
}

/**
 * Every function here takes the acting user's id and scopes its query by it. A record that
 * belongs to someone else is indistinguishable from one that does not exist.
 */
export async function saveJob(userId: string, jobId: string): Promise<{ id: string; created: boolean }> {
  const job = await db.job.findUnique({ where: { id: jobId }, select: { id: true } });
  if (!job) throw new NotFoundError("Job");
  const existing = await db.application.findUnique({ where: { userId_jobId: { userId, jobId } }, select: { id: true } });
  if (existing) return { id: existing.id, created: false };
  const app = await db.application.create({ data: { userId, jobId, status: "saved", events: { create: { type: "created", toStatus: "saved" } } }, select: { id: true } });
  return { id: app.id, created: true };
}

export async function getApplication(userId: string, id: string) {
  const app = await db.application.findFirst({
    where: { id, userId },
    include: { job: { include: { source: true } }, events: { orderBy: { at: "desc" } }, reminders: { orderBy: { dueAt: "asc" } }, drafts: { orderBy: { createdAt: "desc" } } },
  });
  if (!app) throw new NotFoundError("Application");
  return app;
}

export async function listApplications(userId: string) {
  return db.application.findMany({
    where: { userId },
    include: { job: { select: { id: true, title: true, companyName: true, location: true, status: true, isSynthetic: true, postedAt: true, firstSeenAt: true } }, reminders: { where: { status: "pending" }, orderBy: { dueAt: "asc" }, take: 1 } },
    orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
  });
}

export async function setStatus(userId: string, id: string, status: string, now: Date = new Date()): Promise<void> {
  if (!(STATUSES as readonly string[]).includes(status)) throw new Error("Unknown status.");
  const app = await db.application.findFirst({ where: { id, userId }, select: { id: true, status: true, appliedAt: true } });
  if (!app) throw new NotFoundError("Application");
  if (app.status === status) return;
  await db.$transaction([
    db.application.update({
      where: { id: app.id },
      data: { status, appliedAt: status === "applied" && !app.appliedAt ? now : status === "saved" ? null : app.appliedAt ?? (status !== "withdrawn" ? now : null) },
    }),
    db.applicationEvent.create({ data: { applicationId: app.id, type: "status_changed", fromStatus: app.status, toStatus: status, at: now } }),
    // Reminders tied to the old stage no longer apply.
    db.reminder.updateMany({ where: { applicationId: app.id, status: "pending" }, data: { status: "dismissed" } }),
  ]);
}

export async function updateNotes(userId: string, id: string, notes: string): Promise<void> {
  const res = await db.application.updateMany({ where: { id, userId }, data: { notes: notes.slice(0, 5000) } });
  if (res.count === 0) throw new NotFoundError("Application");
}

export async function togglePin(userId: string, id: string): Promise<void> {
  const app = await db.application.findFirst({ where: { id, userId }, select: { pinned: true } });
  if (!app) throw new NotFoundError("Application");
  await db.application.updateMany({ where: { id, userId }, data: { pinned: !app.pinned } });
}

export async function removeApplication(userId: string, id: string): Promise<void> {
  const res = await db.application.deleteMany({ where: { id, userId } });
  if (res.count === 0) throw new NotFoundError("Application");
}

export async function setReminderStatus(userId: string, id: string, status: "done" | "dismissed"): Promise<void> {
  const res = await db.reminder.updateMany({ where: { id, userId }, data: { status } });
  if (res.count === 0) throw new NotFoundError("Reminder");
}

export async function dueReminders(userId: string, now: Date = new Date(), horizonDays = 3) {
  return db.reminder.findMany({
    where: { userId, status: "pending", dueAt: { lte: new Date(now.getTime() + horizonDays * 86_400_000) } },
    include: { application: { include: { job: { select: { title: true, companyName: true } } } } },
    orderBy: { dueAt: "asc" },
    take: 20,
  });
}

/** Everything the platform holds about a user, for export. */
export async function exportUserData(userId: string) {
  const [user, profile, resumes, applications, interviews, roadmaps, agentRuns] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { email: true, name: true, plan: true, createdAt: true } }),
    db.profile.findUnique({ where: { userId } }),
    db.resume.findMany({ where: { userId }, select: { id: true, filename: true, rawText: true, status: true, warnings: true, createdAt: true } }),
    db.application.findMany({ where: { userId }, include: { events: true, reminders: true, drafts: true, job: { select: { title: true, companyName: true, applyUrl: true } } } }),
    db.interviewSession.findMany({ where: { userId }, include: { turns: true } }),
    db.roadmap.findMany({ where: { userId } }),
    db.agentRun.findMany({ where: { userId }, include: { steps: true }, orderBy: { createdAt: "desc" }, take: 500 }),
  ]);
  return { exportedAt: new Date().toISOString(), user, profile, resumes, applications, interviews, roadmaps, agentRuns };
}

export async function deleteAccount(userId: string): Promise<void> {
  await db.user.delete({ where: { id: userId } });
}
