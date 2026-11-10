import { Prisma } from "@prisma/client";
import { db, json } from "./db";

/**
 * Durable job queue on PostgreSQL.
 *  - enqueue is idempotent on `idempotencyKey` (unique index).
 *  - claim uses FOR UPDATE SKIP LOCKED, so any number of workers can poll without double delivery.
 *  - a job is acknowledged only after its handler returns; a crashed worker's job is reclaimed
 *    once its lock is older than the visibility timeout (at-least-once delivery, so handlers
 *    must be idempotent).
 *  - failures retry with exponential backoff, then park as "dead" for inspection.
 */
export interface QueueJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  maxAttempts: number;
}

export const VISIBILITY_TIMEOUT_MS = 5 * 60_000;

export async function enqueue(type: string, payload: unknown, opts: { runAt?: Date; idempotencyKey?: string; maxAttempts?: number } = {}): Promise<{ id: string; created: boolean }> {
  if (opts.idempotencyKey) {
    const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
      INSERT INTO "BackgroundJob" ("id", "type", "payload", "runAt", "idempotencyKey", "maxAttempts")
      VALUES (${`bj_${crypto.randomUUID()}`}, ${type}, ${JSON.stringify(payload)}::jsonb, ${opts.runAt ?? new Date()}, ${opts.idempotencyKey}, ${opts.maxAttempts ?? 5})
      ON CONFLICT ("idempotencyKey") DO NOTHING
      RETURNING "id"`);
    if (rows[0]) return { id: rows[0].id, created: true };
    const existing = await db.backgroundJob.findUnique({ where: { idempotencyKey: opts.idempotencyKey }, select: { id: true } });
    return { id: existing!.id, created: false };
  }
  const row = await db.backgroundJob.create({ data: { type, payload: json(payload), runAt: opts.runAt ?? new Date(), maxAttempts: opts.maxAttempts ?? 5 }, select: { id: true } });
  return { id: row.id, created: true };
}

export async function claim(workerId: string, now: Date = new Date(), types?: string[]): Promise<QueueJob | null> {
  const stale = new Date(now.getTime() - VISIBILITY_TIMEOUT_MS);
  // A worker can be restricted to some job types (for example, a pool dedicated to slow syncs).
  const typeFilter = types && types.length > 0 ? Prisma.sql`AND "type" IN (${Prisma.join(types)})` : Prisma.empty;
  const rows = await db.$queryRaw<QueueJob[]>(Prisma.sql`
    UPDATE "BackgroundJob" SET "status" = 'running', "lockedAt" = ${now}, "lockedBy" = ${workerId}, "attempts" = "attempts" + 1
    WHERE "id" = (
      SELECT "id" FROM "BackgroundJob"
      WHERE (("status" = 'queued' AND "runAt" <= ${now}) OR ("status" = 'running' AND "lockedAt" < ${stale})) ${typeFilter}
      ORDER BY "runAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING "id", "type", "payload", "attempts", "maxAttempts"`);
  return rows[0] ?? null;
}

export async function complete(id: string): Promise<void> {
  await db.backgroundJob.update({ where: { id }, data: { status: "done", finishedAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } });
}

export function backoffMs(attempt: number): number {
  return Math.min(60 * 60_000, 15_000 * 2 ** (attempt - 1));
}

export async function fail(job: QueueJob, error: string, now: Date = new Date()): Promise<"retry" | "dead"> {
  const dead = job.attempts >= job.maxAttempts;
  await db.backgroundJob.update({
    where: { id: job.id },
    data: dead
      ? { status: "dead", finishedAt: now, lastError: error.slice(0, 2000), lockedAt: null, lockedBy: null }
      : { status: "queued", runAt: new Date(now.getTime() + backoffMs(job.attempts)), lastError: error.slice(0, 2000), lockedAt: null, lockedBy: null },
  });
  return dead ? "dead" : "retry";
}

export type Handler = (payload: unknown) => Promise<void>;

/** Claim and run jobs until the queue is empty. Returns how many jobs ran. */
export async function drain(workerId: string, handlers: Record<string, Handler>, limit = 100, types?: string[]): Promise<{ ran: number; failed: number }> {
  let ran = 0;
  let failed = 0;
  while (ran < limit) {
    const job = await claim(workerId, new Date(), types);
    if (!job) break;
    ran++;
    const handler = handlers[job.type];
    try {
      if (!handler) throw new Error(`no handler registered for job type "${job.type}"`);
      await handler(job.payload);
      await complete(job.id);
    } catch (err) {
      failed++;
      await fail(job, err instanceof Error ? err.message : String(err));
    }
  }
  return { ran, failed };
}
