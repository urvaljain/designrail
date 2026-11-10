import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { breakerState, getProvider } from "@/lib/llm/router";

export const dynamic = "force-dynamic";

/** Liveness and dependency check for load balancers and uptime monitors. */
export async function GET() {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const [queued, dead] = await Promise.all([db.backgroundJob.count({ where: { status: "queued" } }), db.backgroundJob.count({ where: { status: "dead" } })]);
    return NextResponse.json({ status: "ok", database: "ok", dbLatencyMs: Date.now() - started, queue: { queued, dead }, llm: { configured: Boolean(getProvider()), breaker: breakerState() } });
  } catch {
    return NextResponse.json({ status: "degraded", database: "unreachable" }, { status: 503 });
  }
}
