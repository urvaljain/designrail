import type { MatchResult, ItemStatus } from "@/lib/match/score";
import { VERDICT_TEXT } from "@/lib/match/score";
import { VERDICT_TONE } from "./job-bits";
import { Badge, Card, CardTitle, EvidenceQuote, Meter, Notice, type Tone } from "./ui";

const STATUS: Record<ItemStatus, { label: string; tone: Tone }> = {
  demonstrated: { label: "Demonstrated", tone: "good" },
  listed: { label: "Listed only", tone: "warn" },
  related: { label: "Related skill", tone: "info" },
  missing: { label: "Missing", tone: "bad" },
  unverifiable: { label: "Check yourself", tone: "neutral" },
};

/** Requirement-by-requirement evidence view. The same component renders on the job page and the application page. */
export function MatchView({ match }: { match: MatchResult }) {
  const v = VERDICT_TEXT[match.verdict];
  const tone = VERDICT_TONE[match.verdict];
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <CardTitle>Your fit: {v.label}</CardTitle>
          <p className="mt-1 max-w-xl text-muted">{v.advice}</p>
        </div>
        {match.verdict !== "unknown" ? (
          <div className="w-40">
            <p className="display text-3xl font-semibold tabular-nums">{match.score}<span className="font-sans text-base font-normal text-muted"> / 100</span></p>
            <Meter value={match.score} label="Fit score" tone={tone === "good" ? "good" : tone === "warn" ? "warn" : "bad"} />
            <p className="mt-1 text-xs text-muted">{match.confidence[0]!.toUpperCase() + match.confidence.slice(1)} confidence</p>
          </div>
        ) : null}
      </div>

      <details className="mt-4 rounded-control bg-sunken px-4 py-3 text-sm" open>
        <summary className="cursor-pointer font-semibold">How this was worked out</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          {match.explanation.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </details>

      {match.cautions.length > 0 ? (
        <Notice tone="warn" className="mt-4" title="Read before relying on this">
          <ul className="list-disc space-y-1 pl-5">
            {match.cautions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {match.items.length > 0 ? (
        <>
          <h3 className="mt-6 font-semibold">Requirement by requirement</h3>
          <ul className="mt-2 divide-y divide-line">
            {match.items.map((item) => (
              <li key={item.requirement.id} className="py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                  <span className="font-semibold">{item.requirement.label}</span>
                  <span className="text-sm text-muted">{item.requirement.importance === "must" ? "must-have" : "nice to have"}</span>
                </div>
                <p className="mt-1 text-sm text-muted">{item.note}</p>
                <div className="mt-2 grid gap-3 md:grid-cols-2">
                  <EvidenceQuote quote={item.requirement.quote} source="From the job listing" />
                  {item.evidence.map((e) => (
                    <EvidenceQuote key={e.lineId + e.quote} quote={e.quote} source={`Your resume, line ${e.lineId.replace("L", "")}`} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </Card>
  );
}
