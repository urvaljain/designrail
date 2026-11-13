import { useMemo } from "react";
import { ArrowRight, BarChart3, Lightbulb, Medal, RotateCcw, Target, Trophy } from "lucide-react";
import type { Match } from "../types";
import { analyzeMatch } from "../lib/insights";
import { economy, oversText, strikeRate } from "../lib/simulator";
import { PITCH_LABEL, STRATEGY_LABEL } from "../lib/strategy";
import { USER_TEAM_ID } from "../lib/squad";
import { Scorecard, teamName } from "./Scorecard";
import { Badge, Button, Card, EmptyState, LinkButton, SectionHeader, cx } from "./ui";

function OverChart({ match }: { match: Match }) {
  const max = Math.max(1, ...match.innings.flatMap((i) => i.overRuns));
  return (
    <Card as="section" className="p-4 md:p-6">
      <h2 className="heading-6 flex items-center gap-2">
        <BarChart3 aria-hidden className="size-5 text-pitch" /> Over by over
      </h2>
      <div className="mt-2 flex flex-wrap gap-4">
        {match.innings.map((inn, i) => (
          <span key={i} className="caption-4 flex items-center gap-2 text-muted">
            <span aria-hidden className={cx("size-2.5 rounded-sm", inn.battingTeamId === USER_TEAM_ID ? "bg-pitch" : "bg-gold")} />
            {teamName(match, inn.battingTeamId)}
          </span>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-5 gap-3" role="img" aria-label={match.innings.map((inn) => `${teamName(match, inn.battingTeamId)}: ${inn.overRuns.join(", ")} runs per over`).join(". ")}>
        {Array.from({ length: 5 }, (_, o) => (
          <div key={o} className="flex flex-col items-center gap-2">
            <div className="flex h-40 w-full items-end justify-center gap-1">
              {match.innings.map((inn, i) => {
                const r = inn.overRuns[o];
                const w = inn.overWickets[o] ?? 0;
                const user = inn.battingTeamId === USER_TEAM_ID;
                return (
                  <div key={i} className="flex h-full w-1/2 max-w-8 flex-col items-center justify-end gap-1">
                    <span className="caption-3 tabular-nums text-muted">{r ?? "–"}</span>
                    <div className="relative w-full flex-1">
                      <div
                        className={cx("absolute inset-x-0 bottom-0 h-full origin-bottom rounded-t-md transition-transform duration-700 ease-brand", user ? "bg-pitch" : "bg-gold")}
                        style={{ transform: `scaleY(${r === undefined ? 0 : Math.max(0.03, r / max)})` }}
                      />
                    </div>
                    <span className={cx("caption-5 h-4", w ? "text-wicket" : "text-transparent")}>{w ? `${w}w` : "0"}</span>
                  </div>
                );
              })}
            </div>
            <span className="caption-4 text-faint">Over {o + 1}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function MatchInsights({ match, onNewMatch }: { match: Match | null; onNewMatch: () => void }) {
  const insights = useMemo(() => (match ? analyzeMatch(match) : null), [match]);

  if (!match || !insights) {
    return (
      <div className="flex flex-col gap-8">
        <SectionHeader eyebrow="Match Insights" title="Learn from every over" />
        <EmptyState
          icon={BarChart3}
          title="Finish a match to see insights"
          description="Play a five over match to the final ball. You will get the scorecard, top performers, scoring by over and what to change next time."
          action={<LinkButton href="#/match" iconRight={ArrowRight}>Play a quick match</LinkButton>}
        />
      </div>
    );
  }

  const { userWon, topBatter, bestBowler } = insights;
  const resultTone = userWon === null ? "text-gold" : userWon ? "text-pitch" : "text-wicket";

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="Match Insights"
        title={`Your XI vs ${match.away.name}`}
        description={`${PITCH_LABEL[match.settings.pitch]} pitch, ${STRATEGY_LABEL[match.settings.strategy].toLowerCase()} batting, seed ${match.settings.seed}. Every number below comes from the deliveries of this match.`}
        actions={
          <>
            <Button variant="secondary" icon={RotateCcw} onClick={onNewMatch}>
              New match
            </Button>
            <LinkButton href="#/squad" variant="ghost">
              Edit XI
            </LinkButton>
          </>
        }
      />

      {/* Result */}
      <Card className="grid gap-4 p-4 md:grid-cols-[1.2fr_1fr_1fr] md:p-6 animate-rise">
        <div>
          <p className={cx("title-4 flex items-center gap-2", resultTone)}>
            <Trophy aria-hidden className="size-4" />
            {userWon === null ? "Tied" : userWon ? "Victory" : "Defeat"}
          </p>
          <p className="heading-5 mt-1">{match.result.summary}</p>
          <div className="mt-4 flex flex-col gap-1">
            {match.innings.map((inn, i) => (
              <p key={i} className="body-5 flex justify-between gap-4 tabular-nums">
                <span className="text-muted">{teamName(match, inn.battingTeamId)}</span>
                <span>
                  {inn.runs}/{inn.wickets} <span className="text-faint">({oversText(inn.legalBalls)})</span>
                </span>
              </p>
            ))}
          </div>
        </div>
        {topBatter && (
          <div className="rounded-xl bg-ink-850 px-4 py-4">
            <p className="caption-4 flex items-center gap-2 text-gold">
              <Medal aria-hidden className="size-4" /> Top batter
            </p>
            <p className="title-3 mt-2">{topBatter.player.name}</p>
            <p className="caption-5 text-muted">{topBatter.teamName}</p>
            <p className="heading-5 mt-2 tabular-nums">
              {topBatter.card.runs}
              <span className="body-6 text-muted"> ({topBatter.card.balls} balls)</span>
            </p>
            <p className="caption-5 text-muted">
              {topBatter.card.fours} fours, {topBatter.card.sixes} sixes, SR {strikeRate(topBatter.card.runs, topBatter.card.balls).toFixed(1)}
            </p>
          </div>
        )}
        {bestBowler && (
          <div className="rounded-xl bg-ink-850 px-4 py-4">
            <p className="caption-4 flex items-center gap-2 text-pitch">
              <Target aria-hidden className="size-4" /> Best bowler
            </p>
            <p className="title-3 mt-2">{bestBowler.player.name}</p>
            <p className="caption-5 text-muted">{bestBowler.teamName}</p>
            <p className="heading-5 mt-2 tabular-nums">
              {bestBowler.card.wickets}/{bestBowler.card.runs}
              <span className="body-6 text-muted"> ({oversText(bestBowler.card.balls)} ov)</span>
            </p>
            <p className="caption-5 text-muted">Economy {economy(bestBowler.card.runs, bestBowler.card.balls).toFixed(2)}</p>
          </div>
        )}
      </Card>

      <OverChart match={match} />

      <div className="grid gap-4 md:grid-cols-2">
        <Card as="section" className="p-4 md:p-6">
          <h2 className="heading-6">Key tactical observations</h2>
          <ul className="mt-4 flex flex-col gap-3">
            {insights.observations.map((o) => (
              <li key={o.title} className="rounded-xl bg-ink-850 px-4 py-3">
                <p className="title-4">{o.title}</p>
                <p className="body-6 mt-1 text-muted">{o.detail}</p>
              </li>
            ))}
          </ul>
        </Card>
        <Card as="section" className="p-4 md:p-6">
          <h2 className="heading-6 flex items-center gap-2">
            <Lightbulb aria-hidden className="size-5 text-gold" /> For your next match
          </h2>
          <ul className="mt-4 flex flex-col gap-3">
            {insights.improvements.map((o) => (
              <li key={o.title} className="rounded-xl border border-gold/20 bg-ink-850 px-4 py-3">
                <p className="title-4 text-gold">{o.title}</p>
                <p className="body-6 mt-1 text-muted">{o.detail}</p>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <LinkButton href="#/coach" variant="secondary" size="sm">
              Ask the Strategy Coach
            </LinkButton>
            <Badge className="self-center">Seed {match.settings.seed} replays this match</Badge>
          </div>
        </Card>
      </div>

      <Scorecard match={match} />
    </div>
  );
}
