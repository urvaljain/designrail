import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Dice5, FastForward, Pause, Play, RotateCcw, Shield, SkipForward, StepForward, Swords, Trophy, Users, Scale } from "lucide-react";
import { OPPONENTS, OPPONENT_INFO } from "../data/players";
import type { BattingStrategy, Match, MatchSettings, Pitch, SavedLineup } from "../types";
import { newSeed, oversText, runRate, simulateMatch, OVERS_PER_INNINGS, BALLS_PER_OVER } from "../lib/simulator";
import { PITCH_LABEL, STRATEGY_LABEL } from "../lib/strategy";
import { squadToTeam, USER_TEAM_ID } from "../lib/squad";
import { PITCH_OPTIONS } from "./StrategyCoach";
import { BallChip, Scorecard, playerMap, teamName } from "./Scorecard";
import { Badge, Button, Card, ChoiceGroup, EmptyState, LinkButton, SectionHeader, Skeleton, cx } from "./ui";

export interface LiveMatch {
  match: Match;
  revealed: number;
}

const STRATEGY_OPTIONS: { value: BattingStrategy; label: string; hint: string; icon: typeof Shield }[] = [
  { value: "defensive", label: "Defensive", hint: "Fewer wickets, fewer boundaries", icon: Shield },
  { value: "balanced", label: "Balanced", hint: "Take the gaps, punish bad balls", icon: Scale },
  { value: "aggressive", label: "Aggressive", hint: "Swing hard, accept the risk", icon: Swords },
];

const allBalls = (m: Match) => [...m.innings[0].balls, ...m.innings[1].balls];

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

function Setup({ settings, setSettings, onStart }: { settings: MatchSettings; setSettings: (s: MatchSettings) => void; onStart: () => void }) {
  const [seedText, setSeedText] = useState(String(settings.seed));
  const seedValid = /^\d{1,9}$/.test(seedText) && Number(seedText) > 0;

  useEffect(() => setSeedText(String(settings.seed)), [settings.seed]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (seedValid) onStart();
      }}
    >
      <Card className="p-4 md:p-6">
        <ChoiceGroup label="Pitch condition" value={settings.pitch} onChange={(pitch: Pitch) => setSettings({ ...settings, pitch })} options={PITCH_OPTIONS} />
      </Card>
      <Card className="p-4 md:p-6">
        <ChoiceGroup
          label="Your batting strategy"
          value={settings.strategy}
          onChange={(strategy: BattingStrategy) => setSettings({ ...settings, strategy })}
          options={STRATEGY_OPTIONS}
          columns="grid-cols-1 sm:grid-cols-3"
        />
      </Card>
      <Card className="p-4 md:p-6">
        <ChoiceGroup
          label="Opponent"
          value={settings.opponentId}
          onChange={(opponentId: string) => setSettings({ ...settings, opponentId })}
          columns="grid-cols-1 sm:grid-cols-3"
          options={OPPONENTS.map((t) => ({ value: t.id, label: `${t.name} · ${OPPONENT_INFO[t.id]!.difficulty}`, hint: OPPONENT_INFO[t.id]!.blurb }))}
        />
      </Card>
      <Card className="flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between md:p-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="seed" className="title-4 text-muted">
            Match seed
          </label>
          <div className="flex gap-2">
            <input
              id="seed"
              inputMode="numeric"
              value={seedText}
              aria-invalid={!seedValid}
              aria-describedby="seed-help"
              onChange={(e) => {
                setSeedText(e.target.value);
                if (/^\d{1,9}$/.test(e.target.value) && Number(e.target.value) > 0) setSettings({ ...settings, seed: Number(e.target.value) });
              }}
              className={cx(
                "body-5 min-h-11 w-40 rounded-xl border bg-ink-850 px-3 py-2 tabular-nums text-fg focus:outline-none",
                seedValid ? "border-line focus:border-pitch/60" : "border-wicket/60",
              )}
            />
            <Button variant="secondary" icon={Dice5} onClick={() => setSettings({ ...settings, seed: newSeed() })} aria-label="Generate a new seed">
              <span className="hidden sm:inline">New seed</span>
            </Button>
          </div>
          <p id="seed-help" className={cx("caption-5", seedValid ? "text-faint" : "text-wicket")}>
            {seedValid ? "Same seed and settings replay the exact same match." : "Enter a whole number between 1 and 999999999."}
          </p>
        </div>
        <Button type="submit" size="lg" icon={Play} disabled={!seedValid}>
          Start match
        </Button>
      </Card>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* Live view                                                           */
/* ------------------------------------------------------------------ */

function Live({ live, setRevealed, onNewMatch }: { live: LiveMatch; setRevealed: (n: number) => void; onNewMatch: () => void }) {
  const { match, revealed } = live;
  const balls = useMemo(() => allBalls(match), [match]);
  const total = balls.length;
  const done = revealed >= total;
  const [auto, setAuto] = useState(false);
  const players = useMemo(() => playerMap(match), [match]);
  const pname = (id: string) => players.get(id)?.name ?? id;

  useEffect(() => {
    if (!auto || done) {
      if (done) setAuto(false);
      return;
    }
    const t = setTimeout(() => setRevealed(revealed + 1), 650);
    return () => clearTimeout(t);
  }, [auto, done, revealed, setRevealed]);

  const shown = balls.slice(0, revealed);
  const last = shown[shown.length - 1];
  const next = balls[revealed];
  const firstLen = match.innings[0].balls.length;
  const inningsBreak = revealed === firstLen && !done;
  const curIdx: 0 | 1 = revealed > firstLen ? 1 : 0;
  const cur = match.innings[curIdx];
  const curBalls = shown.filter((b) => b.innings === curIdx);
  const runs = curBalls.reduce((s, b) => s + b.runs, 0);
  const wkts = curBalls.filter((b) => b.result === "W").length;
  const legal = curBalls.filter((b) => b.result !== "wd").length;
  const target = curIdx === 1 ? match.innings[1].target! : null;

  // Players at the crease come from the next delivery in the same innings.
  const crease = next && next.innings === curIdx ? next : last;
  const batterStats = (id: string) => {
    const bs = curBalls.filter((b) => b.batterId === id && b.result !== "wd");
    return { runs: bs.reduce((s, b) => s + b.runs, 0), balls: bs.length };
  };
  const bowlerStats = (id: string) => {
    const bs = curBalls.filter((b) => b.bowlerId === id);
    return {
      legal: bs.filter((b) => b.result !== "wd").length,
      runs: bs.reduce((s, b) => s + b.runs, 0),
      wickets: bs.filter((b) => b.result === "W").length,
    };
  };

  const currentOver = curBalls.length ? curBalls[curBalls.length - 1]!.over : 0;
  const overBalls = curBalls.filter((b) => b.over === currentOver);
  const recent = [...shown].reverse().slice(0, 8);

  const ballsLeft = OVERS_PER_INNINGS * BALLS_PER_OVER - legal;
  const need = target !== null ? Math.max(0, target - runs) : null;
  const rrr = need !== null && ballsLeft > 0 ? (need / ballsLeft) * 6 : null;

  const advanceOver = () => {
    if (!next) return;
    let i = revealed;
    const { innings, over } = next;
    while (i < total && balls[i]!.innings === innings && balls[i]!.over === over) i++;
    setRevealed(i);
  };

  const userWon = match.result.winnerId === USER_TEAM_ID;

  return (
    <div className="flex flex-col gap-4">
      {/* Scoreboard */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
          <p className="caption-4 text-muted">
            {PITCH_LABEL[match.settings.pitch]} pitch · {STRATEGY_LABEL[match.settings.strategy]} batting · Seed {match.settings.seed}
          </p>
          <p className="caption-4 text-muted">
            {teamName(match, match.tossWinnerId)} won the toss and chose to {match.tossWinnerId === match.battingFirstId ? "bat" : "bowl"}
          </p>
        </div>
        <div className="grid gap-6 p-4 md:grid-cols-[1.2fr_1fr] md:p-6">
          <div>
            <p className="title-4 text-muted">
              {teamName(match, cur.battingTeamId)} · {curIdx === 0 ? "First innings" : "Chasing"}
            </p>
            <p className="mt-1 flex items-baseline gap-3">
              <span className="heading-2 tabular-nums md:heading-1" aria-live="polite">
                {runs}/{wkts}
              </span>
              <span className="title-2 tabular-nums text-muted">{oversText(legal)} ov</span>
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Badge>RR {runRate(runs, legal).toFixed(2)}</Badge>
              {target !== null && <Badge tone="gold">Target {target}</Badge>}
              {rrr !== null && !done && <Badge tone={rrr > 12 ? "wicket" : "pitch"}>Req RR {rrr.toFixed(2)}</Badge>}
              {curIdx === 1 && <Badge>{teamName(match, match.innings[0].battingTeamId)} {match.innings[0].runs}/{match.innings[0].wickets}</Badge>}
            </div>
            {need !== null && !done && (
              <p className="body-5 mt-3 text-fg">
                {need === 0 ? "Scores level." : `Need ${need} from ${ballsLeft} ball${ballsLeft === 1 ? "" : "s"}`}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            {crease && !done && !inningsBreak ? (
              <>
                {[crease.batterId, crease.nonStrikerId].map((id, i) => {
                  const s = batterStats(id);
                  return (
                    <div key={id} className="flex items-center justify-between rounded-xl bg-ink-850 px-3 py-2">
                      <span className="body-5 flex items-center gap-2">
                        {i === 0 && <span aria-label="on strike" className="size-1.5 rounded-full bg-pitch" />}
                        {pname(id)}
                      </span>
                      <span className="body-4 tabular-nums">
                        {s.runs} <span className="body-6 text-muted">({s.balls})</span>
                      </span>
                    </div>
                  );
                })}
                {(() => {
                  const s = bowlerStats(crease.bowlerId);
                  return (
                    <div className="flex items-center justify-between rounded-xl border border-line px-3 py-2">
                      <span className="body-6 text-muted">Bowling: {pname(crease.bowlerId)}</span>
                      <span className="body-5 tabular-nums">
                        {s.wickets}/{s.runs} <span className="text-muted">({oversText(s.legal)})</span>
                      </span>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="rounded-xl bg-ink-850 px-4 py-4">
                {done ? (
                  <>
                    <p className={cx("heading-6 flex items-center gap-2", match.result.winnerId === null ? "text-gold" : userWon ? "text-pitch" : "text-wicket")}>
                      <Trophy aria-hidden className="size-5" /> {match.result.winnerId === null ? "Match tied" : userWon ? "You won" : "You lost"}
                    </p>
                    <p className="body-6 mt-1 text-muted">{match.result.summary}.</p>
                  </>
                ) : (
                  <>
                    <p className="heading-6">Innings break</p>
                    <p className="body-6 mt-1 text-muted">
                      {teamName(match, match.innings[1].battingTeamId)} need {match.innings[1].target} to win from 5 overs.
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Progress */}
        <div className="px-4 pb-4 md:px-6">
          <div className="flex items-center justify-between">
            <span className="caption-4 text-faint">Match progress</span>
            <span className="caption-4 tabular-nums text-faint">
              {revealed}/{total} deliveries
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-750" role="progressbar" aria-valuenow={revealed} aria-valuemin={0} aria-valuemax={total} aria-label="Match progress">
            <div className="h-full w-full origin-left rounded-full bg-pitch transition-transform duration-500 ease-brand" style={{ transform: `scaleX(${total ? revealed / total : 0})` }} />
          </div>
        </div>
      </Card>

      {/* Controls */}
      {!done ? (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button icon={StepForward} onClick={() => setRevealed(revealed + 1)} disabled={auto}>
            Next ball
          </Button>
          <Button variant="secondary" icon={FastForward} onClick={advanceOver} disabled={auto}>
            Finish over
          </Button>
          <Button variant="secondary" icon={auto ? Pause : Play} onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
            {auto ? "Pause" : "Auto play"}
          </Button>
          <Button variant="ghost" icon={SkipForward} onClick={() => setRevealed(total)}>
            Skip to result
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap animate-rise">
          <LinkButton href="#/insights" iconRight={ArrowRight}>
            View match insights
          </LinkButton>
          <Button variant="secondary" icon={RotateCcw} onClick={onNewMatch}>
            New match
          </Button>
          <Button variant="ghost" onClick={() => setRevealed(0)}>
            Replay ball by ball
          </Button>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        {/* This over */}
        <Card as="section" className="p-4 md:p-6">
          <h2 className="title-3">
            {`Over ${currentOver + 1}`}
            <span className="caption-5 ml-2 text-muted">{teamName(match, cur.battingTeamId)} batting</span>
          </h2>
          <div className="mt-3 flex min-h-8 flex-wrap gap-2">
            {overBalls.length === 0 ? <span className="body-6 text-faint">Waiting for the first ball.</span> : overBalls.map((b, i) => <BallChip key={`${b.over}-${i}`} ball={b} />)}
          </div>
          <div className="mt-4 flex gap-1">
            {[0, 1].map((ix) =>
              match.innings[ix as 0 | 1].overRuns.map((_r, o) => {
                const visible = shown.some((b) => b.innings === ix && b.over === o);
                if (ix !== curIdx) return null;
                return (
                  <div key={`${ix}-${o}`} className="flex-1 text-center">
                    <div className={cx("caption-3 rounded-lg py-2 tabular-nums", visible ? "bg-ink-800 text-fg" : "bg-ink-850 text-faint")}>
                      {visible ? shown.filter((b) => b.innings === ix && b.over === o).reduce((s, b) => s + b.runs, 0) : "·"}
                    </div>
                    <span className="caption-5 text-faint">Ov {o + 1}</span>
                  </div>
                );
              }),
            )}
          </div>
        </Card>

        {/* Commentary */}
        <Card as="section" className="p-4 md:p-6">
          <h2 className="title-3">Ball by ball</h2>
          {recent.length === 0 ? (
            <p className="body-6 mt-3 text-faint">Press Next ball to bowl the first delivery.</p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2" aria-live="polite">
              {recent.map((b) => (
                <li key={`${b.innings}-${b.over}-${b.scoreAfter}-${b.wicketsAfter}-${b.legalBallInOver}-${b.result}`} className="flex items-start gap-3 animate-rise">
                  <BallChip ball={b} size="sm" />
                  <div className="min-w-0">
                    <p className="body-6">{b.commentary}</p>
                    <p className="caption-5 text-faint tabular-nums">
                      {b.innings === 0 ? "1st" : "2nd"} inns · {b.over}.{b.legalBallInOver} · {b.scoreAfter}/{b.wicketsAfter}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>

      {done && <Scorecard match={match} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export function MatchSimulator({
  lineup,
  live,
  setLive,
  settings,
  setSettings,
  onComplete,
}: {
  lineup: SavedLineup | null;
  live: LiveMatch | null;
  setLive: (l: LiveMatch | null) => void;
  settings: MatchSettings;
  setSettings: (s: MatchSettings) => void;
  onComplete: (m: Match) => void;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (live && live.revealed >= allBalls(live.match).length) onComplete(live.match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live?.revealed, live?.match]);

  if (!lineup) {
    return (
      <div className="flex flex-col gap-8">
        <SectionHeader eyebrow="Quick Match" title="Five over showdown" />
        <EmptyState
          icon={Users}
          title="You need a saved XI to play"
          description="Pick 11 players with a captain and a wicketkeeper, then save your lineup. It will walk out to bat here."
          action={<LinkButton href="#/squad" iconRight={ArrowRight}>Build your XI</LinkButton>}
        />
      </div>
    );
  }

  const start = () => {
    setLoading(true);
    const opp = OPPONENTS.find((o) => o.id === settings.opponentId)!;
    const match = simulateMatch(squadToTeam(lineup), opp, settings);
    setTimeout(() => {
      setLive({ match, revealed: 0 });
      setLoading(false);
    }, 600);
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        eyebrow="Quick Match"
        title={live ? `Your XI vs ${live.match.away.name}` : "Five over showdown"}
        description={live ? undefined : "Set the conditions and your plan. Every ball is decided by ratings, form, the pitch and a seeded random roll."}
      />
      {loading ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Tossing the coin">
          <p className="body-5 text-muted">Tossing the coin…</p>
          <Skeleton className="h-56" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
            <Skeleton className="h-11" />
          </div>
          <Skeleton className="h-40" />
        </div>
      ) : live ? (
        <Live
          live={live}
          setRevealed={(n) => setLive({ ...live, revealed: Math.min(n, allBalls(live.match).length) })}
          onNewMatch={() => {
            setSettings({ ...settings, seed: newSeed() });
            setLive(null);
          }}
        />
      ) : (
        <Setup settings={settings} setSettings={setSettings} onStart={start} />
      )}
    </div>
  );
}
