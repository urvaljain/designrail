import type { Freshness } from "@/lib/jobs/freshness";
import { formatSalary } from "@/lib/jobs/salary";
import type { MatchResult } from "@/lib/match/score";
import { VERDICT_TEXT } from "@/lib/match/score";
import { Badge, type Tone } from "./ui";

export const FRESH_TONE: Record<Freshness["state"], Tone> = { fresh: "good", recent: "accent", aging: "warn", stale: "warn", closed: "bad" };

export function FreshnessBadge({ f }: { f: Freshness }) {
  return <Badge tone={FRESH_TONE[f.state]}>{f.state === "closed" ? "Closed" : f.label}</Badge>;
}

export const VERDICT_TONE: Record<MatchResult["verdict"], Tone> = { apply: "good", stretch: "warn", skip: "bad", unknown: "neutral" };

export function FitBadge({ match }: { match: { score: number; verdict: MatchResult["verdict"]; confidence: string } }) {
  return (
    <Badge tone={VERDICT_TONE[match.verdict]}>
      {VERDICT_TEXT[match.verdict].label}
      {match.verdict !== "unknown" ? ` · ${match.score}/100` : ""}
    </Badge>
  );
}

export function SalaryText({ salary, status }: { salary: { min: number; max: number; currency: string; period: string } | null; status: string }) {
  if (salary) return <span>{formatSalary(salary.min, salary.max, salary.currency, salary.period)} (stated by employer)</span>;
  return <span className="text-muted">{status === "rejected_implausible" ? "Pay withheld: the stated figure failed a plausibility check" : "Pay not disclosed"}</span>;
}

const LEVEL: Record<string, string> = { intern: "Internship", entry: "Entry level", mid: "Mid level", senior: "Senior", unknown: "Level not stated" };
const MODE: Record<string, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Work mode not stated" };
export const levelLabel = (l: string) => LEVEL[l] ?? l;
export const modeLabel = (m: string) => MODE[m] ?? m;
export const SOURCE_LABEL: Record<string, string> = { greenhouse: "Employer's Greenhouse board", lever: "Employer's Lever board", ashby: "Employer's Ashby board", demo: "Synthetic demo board" };
