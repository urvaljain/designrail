import { daysBetween } from "../text";

export type FreshnessState = "fresh" | "recent" | "aging" | "stale" | "closed";

export interface Freshness {
  state: FreshnessState;
  ageDays: number;
  /** Which date the age is measured from. "first_seen" means the source gave no posting date. */
  basis: "posted" | "first_seen";
  label: string;
  verifiedLabel: string;
  /** 0..1 multiplier used in ranking. */
  weight: number;
}

export interface FreshnessInput {
  status: string;
  postedAt: Date | null;
  firstSeenAt: Date;
  lastVerifiedAt: Date | null;
  verifyStatus: string | null;
}

export const STALE_AFTER_DAYS = 45;
/** A listing not confirmed by its source for this long is treated as unverified. */
export const VERIFY_TTL_HOURS = 72;

function ago(days: number): string {
  if (days < 1) return "today";
  if (days < 2) return "yesterday";
  if (days < 14) return `${Math.floor(days)} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

export function freshness(job: FreshnessInput, now: Date = new Date()): Freshness {
  const basis = job.postedAt ? "posted" : "first_seen";
  const from = job.postedAt ?? job.firstSeenAt;
  const ageDays = Math.max(0, daysBetween(from, now));

  let verifiedLabel = "Not yet verified";
  if (job.lastVerifiedAt) {
    const hours = Math.max(0, (now.getTime() - job.lastVerifiedAt.getTime()) / 3_600_000);
    const when = hours < 1 ? "under an hour ago" : hours < 24 ? `${Math.floor(hours)}h ago` : ago(hours / 24);
    const what = job.verifyStatus === "link_ok" ? "Apply link checked" : job.verifyStatus === "link_dead" ? "Apply link failed" : job.verifyStatus === "link_unreachable" ? "Apply link could not be checked" : "Listed by source";
    verifiedLabel = `${what} ${when}`;
    if (hours > VERIFY_TTL_HOURS && job.status === "open") verifiedLabel += " (verification is out of date)";
  }

  if (job.status === "closed") {
    return { state: "closed", ageDays, basis, label: "Closed", verifiedLabel, weight: 0 };
  }
  const state: FreshnessState = ageDays <= 7 ? "fresh" : ageDays <= 21 ? "recent" : ageDays <= STALE_AFTER_DAYS ? "aging" : "stale";
  const weight = state === "fresh" ? 1 : state === "recent" ? 0.85 : state === "aging" ? 0.6 : 0.3;
  const label = `${basis === "posted" ? "Posted" : "First seen"} ${ago(ageDays)}`;
  return { state, ageDays, basis, label, verifiedLabel, weight };
}
