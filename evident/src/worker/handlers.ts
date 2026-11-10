import { z } from "zod";
import { syncSource, verifyApplyLinks } from "../lib/agents/discovery";
import { planFollowUps } from "../lib/agents/followup";
import { db } from "../lib/db";
import { enqueue, type Handler } from "../lib/queue";
import { parseSourceConfig } from "../lib/sources/connectors";

/** Make the Source table match configuration. Safe to run on every boot. */
export async function ensureSources(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const { sources, errors } = parseSourceConfig(env.JOB_SOURCES);
  for (const s of sources) {
    await db.source.upsert({ where: { kind_slug: { kind: s.kind, slug: s.slug } }, create: { kind: s.kind, slug: s.slug, name: s.name ?? "", isSynthetic: false }, update: { enabled: true, ...(s.name ? { name: s.name } : {}) } });
  }
  if ((env.ENABLE_DEMO_SOURCE ?? "true") === "true") {
    await db.source.upsert({ where: { kind_slug: { kind: "demo", slug: "demo" } }, create: { kind: "demo", slug: "demo", name: "Demo board (synthetic)", isSynthetic: true }, update: { enabled: true } });
  } else {
    await db.source.updateMany({ where: { kind: "demo" }, data: { enabled: false } });
  }
  return errors;
}

export const handlers: Record<string, Handler> = {
  sync_source: async (payload) => {
    const { sourceId } = z.object({ sourceId: z.string() }).parse(payload);
    await syncSource(sourceId, { trigger: "schedule" });
  },
  verify_links: async () => {
    await verifyApplyLinks({ limit: 25 });
  },
  plan_followups: async (payload) => {
    const { userId } = z.object({ userId: z.string() }).parse(payload);
    await planFollowUps(userId, { trigger: "schedule" });
  },
};

const bucket = (now: Date, hours: number) => Math.floor(now.getTime() / (hours * 3_600_000));

/** Enqueue recurring work. Idempotency keys are time buckets, so several workers can call this freely. */
export async function scheduleRecurring(now: Date = new Date()): Promise<number> {
  let created = 0;
  const sources = await db.source.findMany({ where: { enabled: true }, select: { id: true } });
  for (const s of sources) if ((await enqueue("sync_source", { sourceId: s.id }, { idempotencyKey: `sync:${s.id}:${bucket(now, 6)}` })).created) created++;
  if ((await enqueue("verify_links", {}, { idempotencyKey: `verify:${bucket(now, 1)}` })).created) created++;
  const users = await db.application.findMany({ distinct: ["userId"], select: { userId: true } });
  for (const u of users) if ((await enqueue("plan_followups", { userId: u.userId }, { idempotencyKey: `followups:${u.userId}:${bucket(now, 12)}` })).created) created++;
  return created;
}
