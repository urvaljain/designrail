"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { draftOutreach, planFollowUps, transitionDraft } from "@/lib/agents/followup";
import { startInterview, submitAnswer } from "@/lib/agents/interview";
import { buildApplicationKit, ingestResume } from "@/lib/agents/resume-intel";
import { logIn, rateLimit, signUp } from "@/lib/auth/core";
import { clientKey, endSession, requireUser, startSession } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { extractResumeText } from "@/lib/resume/extract-file";
import { deleteAccount, removeApplication, saveJob, setReminderStatus, setStatus, togglePin, updateNotes } from "@/lib/services/applications";
import { evaluateFit } from "@/lib/services/jobs";
import { buildRoadmap } from "@/lib/services/roadmap";

/** Redirect back with a message. Works without client JavaScript. */
function back(path: string, kind: "error" | "notice", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}

function messageOf(err: unknown): string {
  // Known, user-safe errors pass through; anything else is logged and replaced.
  if (err instanceof Error && ["NotFoundError", "AgentFailure", "Error"].includes(err.name) && err.message.length < 240 && !/prisma|sql|ECONN|stack/i.test(err.message)) return err.message;
  console.error("[action]", err);
  return "Something went wrong on our side. Nothing was changed. Please try again.";
}

/** Only same-app paths are accepted as return targets, so a crafted form cannot redirect off-site. */
const safePath = (p: string, fallback: string) => (/^\/app(\/[\w\-/]*)?(#[\w-]+)?$/.test(p) ? p : fallback);

const str = (fd: FormData, key: string, max = 500) => String(fd.get(key) ?? "").slice(0, max).trim();

// ── Auth ────────────────────────────────────────────────────────────────

export async function signupAction(fd: FormData) {
  if (!(await rateLimit(`signup:${await clientKey()}`, 10, 3600))) back("/signup", "error", "Too many attempts. Wait a while and try again.");
  const res = await signUp(str(fd, "email", 254), String(fd.get("password") ?? ""), str(fd, "name", 80) || null);
  if (!res.ok) back("/signup", "error", res.error);
  await startSession(res.userId);
  redirect("/app");
}

export async function loginAction(fd: FormData) {
  const email = str(fd, "email", 254);
  const ok = (await rateLimit(`login:ip:${await clientKey()}`, 20, 900)) && (await rateLimit(`login:email:${email.toLowerCase()}`, 8, 900));
  if (!ok) back("/login", "error", "Too many sign-in attempts. Wait 15 minutes and try again.");
  const res = await logIn(email, String(fd.get("password") ?? ""));
  if (!res.ok) back("/login", "error", res.error);
  await startSession(res.userId);
  redirect("/app");
}

export async function logoutAction() {
  await endSession();
  redirect("/");
}

// ── Resume and profile ──────────────────────────────────────────────────

export async function uploadResumeAction(fd: FormData) {
  const user = await requireUser();
  if (!(await rateLimit(`resume:${user.id}`, 20, 3600))) back("/app/resume", "error", "You have uploaded many resumes in the last hour. Try again later.");
  const file = fd.get("file");
  const pasted = String(fd.get("text") ?? "");
  let text = pasted.trim();
  let filename = "Pasted resume";
  if (file instanceof File && file.size > 0) {
    const extracted = await extractResumeText({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
    if (extracted.error) back("/app/resume", "error", extracted.error);
    text = extracted.text;
    filename = file.name;
  }
  if (!text) back("/app/resume", "error", "Choose a file or paste your resume text.");
  let outcome;
  try {
    outcome = await ingestResume(user.id, filename, text);
  } catch (err) {
    back("/app/resume", "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  if (outcome.output.status === "failed") back("/app/resume", "error", "This resume could not be read. See the details below, then paste the text instead.");
  back("/app/resume", "notice", outcome.output.status === "parsed" ? `Resume read: ${outcome.output.skills} skills found with evidence.` : "Resume read, with warnings. Review them below.");
}

const Prefs = z.object({ stage: z.enum(["student", "graduate", "early_career"]), targetRoles: z.string().max(400), locations: z.string().max(400), remoteOk: z.boolean(), graduationYear: z.number().int().min(1990).max(2040).nullable() });

export async function savePreferencesAction(fd: FormData) {
  const user = await requireUser();
  const year = str(fd, "graduationYear", 4);
  const parsed = Prefs.safeParse({ stage: str(fd, "stage"), targetRoles: str(fd, "targetRoles", 400), locations: str(fd, "locations", 400), remoteOk: fd.get("remoteOk") === "on", graduationYear: year ? Number(year) : null });
  if (!parsed.success) back("/app/settings", "error", "Check the preferences form: one of the values is not valid.");
  const list = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean).slice(0, 8);
  const data = { stage: parsed.data.stage, targetRoles: list(parsed.data.targetRoles), locations: list(parsed.data.locations), remoteOk: parsed.data.remoteOk, graduationYear: parsed.data.graduationYear };
  await db.profile.upsert({ where: { userId: user.id }, create: { userId: user.id, ...data }, update: data });
  const name = str(fd, "name", 80);
  await db.user.update({ where: { id: user.id }, data: { name: name || null } });
  revalidatePath("/app", "layout");
  back("/app/settings", "notice", "Preferences saved.");
}

// ── Jobs and applications ───────────────────────────────────────────────

export async function saveJobAction(fd: FormData) {
  const user = await requireUser();
  const jobId = str(fd, "jobId", 60);
  let app;
  try {
    app = await saveJob(user.id, jobId);
    await evaluateFit(user.id, jobId);
    await planFollowUps(user.id, { trigger: "job_saved" });
  } catch (err) {
    back(`/app/jobs/${jobId}`, "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  redirect(`/app/applications/${app.id}?notice=${encodeURIComponent(app.created ? "Saved to your tracker." : "This role is already in your tracker.")}`);
}

export async function markAppliedAction(fd: FormData) {
  const user = await requireUser();
  const jobId = str(fd, "jobId", 60);
  let app;
  try {
    app = await saveJob(user.id, jobId);
    await evaluateFit(user.id, jobId);
    await setStatus(user.id, app.id, "applied");
    await planFollowUps(user.id, { trigger: "status_changed" });
  } catch (err) {
    back(`/app/jobs/${jobId}`, "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  redirect(`/app/applications/${app.id}?notice=${encodeURIComponent("Marked as applied. A follow-up reminder is set for seven days from now.")}`);
}

export async function setStatusAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "applicationId", 60);
  const returnTo = safePath(str(fd, "returnTo", 200), "/app/applications");
  try {
    await setStatus(user.id, id, str(fd, "status", 20));
    await planFollowUps(user.id, { trigger: "status_changed" });
  } catch (err) {
    back(returnTo, "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  back(returnTo, "notice", "Status updated.");
}

export async function updateNotesAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "applicationId", 60);
  try {
    await updateNotes(user.id, id, String(fd.get("notes") ?? ""));
  } catch (err) {
    back(`/app/applications/${id}`, "error", messageOf(err));
  }
  revalidatePath(`/app/applications/${id}`);
  back(`/app/applications/${id}`, "notice", "Notes saved.");
}

export async function togglePinAction(fd: FormData) {
  const user = await requireUser();
  try {
    await togglePin(user.id, str(fd, "applicationId", 60));
  } catch (err) {
    back("/app/applications", "error", messageOf(err));
  }
  revalidatePath("/app/applications");
}

export async function removeApplicationAction(fd: FormData) {
  const user = await requireUser();
  try {
    await removeApplication(user.id, str(fd, "applicationId", 60));
  } catch (err) {
    back("/app/applications", "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  back("/app/applications", "notice", "Removed from your tracker.");
}

export async function buildKitAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "applicationId", 60);
  try {
    await buildApplicationKit(user.id, id);
  } catch (err) {
    back(`/app/applications/${id}`, "error", messageOf(err));
  }
  revalidatePath(`/app/applications/${id}`);
  back(`/app/applications/${id}#kit`, "notice", "Application kit ready.");
}

export async function draftOutreachAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "applicationId", 60);
  const input = z.object({ purpose: z.enum(["follow_up", "thank_you", "intro"]), channel: z.enum(["email", "linkedin"]) }).safeParse({ purpose: str(fd, "purpose"), channel: str(fd, "channel") });
  if (!input.success) back(`/app/applications/${id}`, "error", "Choose a message type and channel.");
  try {
    await draftOutreach(user.id, id, { ...input.data, recipientName: str(fd, "recipientName", 80) || null, recipientTitle: str(fd, "recipientTitle", 80) || null });
  } catch (err) {
    back(`/app/applications/${id}`, "error", messageOf(err));
  }
  revalidatePath(`/app/applications/${id}`);
  back(`/app/applications/${id}#outreach`, "notice", "Draft created. Nothing is sent until you approve it and send it yourself.");
}

export async function draftTransitionAction(fd: FormData) {
  const user = await requireUser();
  const id = str(fd, "applicationId", 60);
  const to = z.enum(["approved", "sent_by_user", "discarded", "draft"]).safeParse(str(fd, "to"));
  if (!to.success) back(`/app/applications/${id}`, "error", "Unknown action.");
  const body = fd.get("body");
  try {
    await transitionDraft(user.id, str(fd, "draftId", 60), to.data, typeof body === "string" ? { body, subject: fd.has("subject") ? str(fd, "subject", 200) || null : undefined } : undefined);
  } catch (err) {
    back(`/app/applications/${id}`, "error", messageOf(err));
  }
  revalidatePath(`/app/applications/${id}`);
  const msg = { approved: "Approved. You can now copy it or open it in your email app.", sent_by_user: "Marked as sent.", discarded: "Draft discarded.", draft: "Draft saved." }[to.data];
  back(`/app/applications/${id}#outreach`, "notice", msg);
}

export async function reminderAction(fd: FormData) {
  const user = await requireUser();
  const returnTo = safePath(str(fd, "returnTo", 200), "/app");
  const status = z.enum(["done", "dismissed"]).safeParse(str(fd, "status"));
  if (!status.success) back(returnTo, "error", "Unknown action.");
  try {
    await setReminderStatus(user.id, str(fd, "reminderId", 60), status.data);
  } catch (err) {
    back(returnTo, "error", messageOf(err));
  }
  revalidatePath("/app", "layout");
  redirect(returnTo);
}

// ── Interview, roadmap ──────────────────────────────────────────────────

export async function startInterviewAction(fd: FormData) {
  const user = await requireUser();
  if (!(await rateLimit(`interview:${user.id}`, 30, 3600))) back("/app/interview", "error", "You have started many sessions in the last hour. Try again later.");
  const jobId = str(fd, "jobId", 60);
  let outcome;
  try {
    outcome = await startInterview(user.id, { jobId: jobId || null, length: Number(str(fd, "length", 2)) || 5 });
  } catch (err) {
    back("/app/interview", "error", messageOf(err));
  }
  redirect(`/app/interview/${outcome.output.sessionId}`);
}

export async function submitAnswerAction(fd: FormData) {
  const user = await requireUser();
  const sessionId = str(fd, "sessionId", 60);
  const answer = String(fd.get("answer") ?? "");
  if (!answer.trim()) back(`/app/interview/${sessionId}`, "error", "Write an answer first. If you are stuck, say what you do know.");
  try {
    await submitAnswer(user.id, sessionId, answer);
  } catch (err) {
    back(`/app/interview/${sessionId}`, "error", messageOf(err));
  }
  revalidatePath(`/app/interview/${sessionId}`);
  redirect(`/app/interview/${sessionId}#latest`);
}

export async function refreshRoadmapAction() {
  const user = await requireUser();
  try {
    await buildRoadmap(user.id);
  } catch (err) {
    back("/app/roadmap", "error", messageOf(err));
  }
  revalidatePath("/app/roadmap");
  back("/app/roadmap", "notice", "Roadmap updated from your current target roles.");
}

// ── Account ─────────────────────────────────────────────────────────────

export async function setPlanAction(fd: FormData) {
  const user = await requireUser();
  const plan = z.enum(["free", "plus"]).safeParse(str(fd, "plan"));
  if (!plan.success) back("/app/settings", "error", "Unknown plan.");
  await db.user.update({ where: { id: user.id }, data: { plan: plan.data } });
  revalidatePath("/app", "layout");
  back("/app/settings", "notice", plan.data === "plus" ? "Switched to Plus (demo billing: no payment was taken)." : "Switched to Free.");
}

export async function deleteAccountAction(fd: FormData) {
  const user = await requireUser();
  if (str(fd, "confirm", 254).toLowerCase() !== user.email.toLowerCase()) back("/app/settings", "error", "Type your email address exactly to confirm deletion.");
  await deleteAccount(user.id);
  await endSession();
  redirect("/?notice=" + encodeURIComponent("Your account and all its data have been deleted."));
}
