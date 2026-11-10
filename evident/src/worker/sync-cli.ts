import { syncSource } from "../lib/agents/discovery";
import { db } from "../lib/db";
import { ensureSources } from "./handlers";

/** One-off sync of every enabled source: `npm run sync`. */
async function main() {
  for (const e of await ensureSources()) console.warn(e);
  const sources = await db.source.findMany({ where: { enabled: true } });
  for (const s of sources) {
    try {
      const { output, status, notes } = await syncSource(s.id, { trigger: "manual" });
      console.log(`${s.kind}:${s.slug} ${status}`, JSON.stringify(output));
      for (const n of notes) console.log(`  note: ${n}`);
    } catch (err) {
      console.error(`${s.kind}:${s.slug} failed: ${err instanceof Error ? err.message : err}`);
      process.exitCode = 1;
    }
  }
  await db.$disconnect();
}

void main();
