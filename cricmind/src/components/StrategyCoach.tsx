import { useEffect, useMemo, useState } from "react";
import { ArrowRight, CircleCheck, CircleAlert, Crown, ListOrdered, Mountain, Sun, Target, Users, Wind, Waves, Swords } from "lucide-react";
import type { Pitch, SavedLineup } from "../types";
import { analyzeTeam, localExplanations, PITCH_LABEL, PITCH_NOTE, STRATEGY_LABEL, type StrategyReport } from "../lib/strategy";
import { squadPlayers } from "../lib/squad";
import { initials } from "./PlayerCard";
import { Badge, Button, Card, ChoiceGroup, EmptyState, LinkButton, SectionHeader, Skeleton, Stat, cx } from "./ui";

export const PITCH_OPTIONS: { value: Pitch; label: string; hint: string; icon: typeof Sun }[] = [
  { value: "batting", label: "Batting friendly", hint: "Flat, fast outfield", icon: Sun },
  { value: "balanced", label: "Balanced", hint: "Even contest", icon: Waves },
  { value: "spin", label: "Spin friendly", hint: "Dry, grips and turns", icon: Wind },
  { value: "pace", label: "Pace friendly", hint: "Green, carry and seam", icon: Mountain },
];

function Insights({ title, items, tone }: { title: string; items: { title: string; detail: string }[]; tone: "pitch" | "wicket" }) {
  const Icon = tone === "pitch" ? CircleCheck : CircleAlert;
  return (
    <Card as="section" className="p-4 md:p-6">
      <h2 className="heading-6 flex items-center gap-2">
        <Icon aria-hidden className={cx("size-5", tone === "pitch" ? "text-pitch" : "text-wicket")} />
        {title}
      </h2>
      {items.length === 0 ? (
        <p className="body-6 mt-3 text-muted">{tone === "pitch" ? "No standout strengths on this pitch. Look at the weaknesses first." : "No clear weaknesses on this pitch."}</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {items.map((i) => (
            <li key={i.title} className="rounded-xl bg-ink-850 px-4 py-3">
              <p className="title-4">{i.title}</p>
              <p className="body-6 mt-1 text-muted">{i.detail}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function StrategyCoach({
  lineup,
  unsaved,
  pitch,
  setPitch,
  onApplyOrder,
  onApplyCaptain,
}: {
  lineup: SavedLineup | null;
  unsaved: boolean;
  pitch: Pitch;
  setPitch: (p: Pitch) => void;
  onApplyOrder: (ids: string[]) => void;
  onApplyCaptain: (id: string) => void;
}) {
  const players = useMemo(() => (lineup ? squadPlayers(lineup) : []), [lineup]);
  const [report, setReport] = useState<StrategyReport | null>(null);

  useEffect(() => {
    if (players.length !== 11) return;
    let live = true;
    setReport(null);
    const base = analyzeTeam(players, pitch, lineup?.captainId ?? null);
    // The explanation layer is async so a serverless LLM layer can slot in later.
    localExplanations.explain(base).then((r) => {
      if (live) setTimeout(() => live && setReport(r), 250);
    });
    return () => {
      live = false;
    };
  }, [players, pitch, lineup?.captainId]);

  if (!lineup || players.length !== 11) {
    return (
      <div className="flex flex-col gap-8">
        <SectionHeader eyebrow="Strategy Coach" title="Your tactical read" />
        <EmptyState
          icon={Users}
          title="Save an XI to get a tactical read"
          description="The Strategy Coach analyses your saved lineup against the pitch. Pick 11 players, name a captain and a keeper, then save."
          action={<LinkButton href="#/squad" iconRight={ArrowRight}>Build your XI</LinkButton>}
        />
      </div>
    );
  }

  const orderMatches = report && report.battingOrder.every((s, i) => lineup.battingOrder[i] === s.player.id);

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        eyebrow="Strategy Coach"
        title="Your tactical read"
        description="Recommendations come from a rules engine that weighs ratings, form and pitch modifiers. The same XI and pitch always give the same advice."
      />
      {unsaved && (
        <Badge tone="gold" className="self-start">
          You have unsaved changes in Squad Builder. This read uses your last saved XI.
        </Badge>
      )}

      <Card className="p-4 md:p-6">
        <ChoiceGroup label="Pitch condition" value={pitch} onChange={setPitch} options={PITCH_OPTIONS} />
        <p className="body-6 mt-3 text-muted">{PITCH_NOTE[pitch]}</p>
      </Card>

      {!report ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Analysing your XI">
          <Skeleton className="h-24 md:col-span-2" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-96 md:col-span-2" />
        </div>
      ) : (
        <div key={pitch} className="flex flex-col gap-6 animate-rise">
          {/* Headline numbers */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Top six batting" value={Math.round(report.metrics.batting)} sub={`${report.metrics.battingDepth} rated 70 plus`} tone={report.metrics.batting >= 80 ? "gold" : undefined} />
            <Stat label="Best five bowling" value={Math.round(report.metrics.bowling)} sub={`${report.metrics.paceOptions} pace, ${report.metrics.spinOptions} spin`} tone={report.metrics.bowling >= 82 ? "gold" : undefined} />
            <Stat label="Fielding" value={Math.round(report.metrics.fielding)} sub="XI average" />
            <Stat label="Recommended plan" value={STRATEGY_LABEL[report.strategy.value]} sub="Batting approach" tone="pitch" />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Insights title="Strengths" items={report.strengths} tone="pitch" />
            <Insights title="Weaknesses" items={report.weaknesses} tone="wicket" />
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            {/* Batting order */}
            <Card as="section" className="p-4 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="heading-6 flex items-center gap-2">
                  <ListOrdered aria-hidden className="size-5 text-pitch" /> Suggested batting order
                </h2>
                <Button size="sm" variant={orderMatches ? "secondary" : "primary"} disabled={!!orderMatches} onClick={() => onApplyOrder(report.battingOrder.map((s) => s.player.id))}>
                  {orderMatches ? "Already your order" : "Apply this order"}
                </Button>
              </div>
              <ol className="mt-4 flex flex-col gap-2">
                {report.battingOrder.map((s, i) => {
                  const moved = lineup.battingOrder[i] !== s.player.id;
                  return (
                    <li key={s.player.id} className="flex gap-3 rounded-xl bg-ink-850 px-3 py-3">
                      <span className="caption-3 mt-0.5 w-5 shrink-0 text-right tabular-nums text-faint">{i + 1}</span>
                      <div className="min-w-0">
                        <p className="title-4 flex flex-wrap items-center gap-2">
                          {s.player.name}
                          {moved && <Badge tone="gold">Moved</Badge>}
                        </p>
                        <p className="caption-5 mt-1 text-muted">{s.reason}</p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>

            <div className="flex flex-col gap-4">
              {/* Captain */}
              <Card as="section" className="p-4 md:p-6">
                <h2 className="heading-6 flex items-center gap-2">
                  <Crown aria-hidden className="size-5 text-gold" /> Suggested captain
                </h2>
                <div className="mt-4 flex items-center gap-3">
                  <span aria-hidden className="title-4 grid size-11 place-items-center rounded-xl border border-gold/30 bg-gold-deep text-gold">{initials(report.captain.player.name)}</span>
                  <div>
                    <p className="title-3">{report.captain.player.name}</p>
                    <p className="caption-5 text-muted">{report.captain.player.role}</p>
                  </div>
                </div>
                <p className="body-6 mt-3 text-muted">{report.captain.reason}</p>
                {report.captain.matchesCurrent ? (
                  <p className="caption-4 mt-3 text-pitch">Matches your current captain.</p>
                ) : (
                  <Button size="sm" variant="gold" className="mt-4" icon={Crown} onClick={() => onApplyCaptain(report.captain.player.id)}>
                    Make captain
                  </Button>
                )}
              </Card>

              {/* Bowlers */}
              <Card as="section" className="p-4 md:p-6">
                <h2 className="heading-6 flex items-center gap-2">
                  <Target aria-hidden className="size-5 text-pitch" /> Opening bowlers
                </h2>
                <ul className="mt-4 flex flex-col gap-2">
                  {report.openingBowlers.map((s, i) => (
                    <li key={s.player.id} className="rounded-xl bg-ink-850 px-4 py-3">
                      <p className="title-4">
                        Over {i + 1}: {s.player.name}
                      </p>
                      <p className="caption-5 mt-1 text-muted">{s.reason}</p>
                    </li>
                  ))}
                  {report.finalOverBowler && (
                    <li className="rounded-xl border border-gold/20 bg-ink-850 px-4 py-3">
                      <p className="title-4 text-gold">Over 5: {report.finalOverBowler.player.name}</p>
                      <p className="caption-5 mt-1 text-muted">{report.finalOverBowler.reason}</p>
                    </li>
                  )}
                </ul>
              </Card>
            </div>
          </div>

          {/* Tactics */}
          <Card as="section" className="p-4 md:p-6">
            <h2 className="heading-6 flex items-center gap-2">
              <Swords aria-hidden className="size-5 text-pitch" /> Tactical recommendations
            </h2>
            <ol className="mt-4 grid gap-3 md:grid-cols-2">
              {report.tactics.map((t, i) => (
                <li key={t.title} className="flex gap-3 rounded-xl bg-ink-850 px-4 py-3">
                  <span className="caption-3 grid size-6 shrink-0 place-items-center rounded-md bg-pitch-deep tabular-nums text-pitch">{i + 1}</span>
                  <div>
                    <p className="title-4">{t.title}</p>
                    <p className="body-6 mt-1 text-muted">{t.detail}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 flex flex-col items-start justify-between gap-3 rounded-xl border border-line px-4 py-4 md:flex-row md:items-center">
              <p className="body-6 text-muted">
                Test this plan: {PITCH_LABEL[pitch].toLowerCase()} pitch, {STRATEGY_LABEL[report.strategy.value].toLowerCase()} batting.
              </p>
              <LinkButton href={`#/match?pitch=${pitch}&strategy=${report.strategy.value}`} iconRight={ArrowRight} size="sm">
                Simulate with this plan
              </LinkButton>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
