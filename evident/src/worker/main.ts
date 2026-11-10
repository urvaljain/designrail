import { hostname } from "node:os";
import { db } from "../lib/db";
import { drain } from "../lib/queue";
import { ensureSources, handlers, scheduleRecurring } from "./handlers";

const workerId = `${hostname()}:${process.pid}`;
let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  const errors = await ensureSources();
  for (const e of errors) console.warn(`[worker] ${e}`);
  console.log(`[worker] ${workerId} started`);
  while (!stopping) {
    try {
      const scheduled = await scheduleRecurring();
      const { ran, failed } = await drain(workerId, handlers, 50);
      if (scheduled || ran) console.log(`[worker] scheduled=${scheduled} ran=${ran} failed=${failed}`);
    } catch (err) {
      console.error("[worker] tick failed:", err instanceof Error ? err.message : err);
    }
    if (process.env.WORKER_ONCE === "true") break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  await db.$disconnect();
  console.log("[worker] stopped");
}

void main();
