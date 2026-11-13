/**
 * Strategy Coach: a deterministic rules engine.
 *
 * Every recommendation is computed from player ratings, form, the pitch and the
 * selection rules below. No model or network call is involved.
 *
 * Extension point: `ExplanationLayer` lets a future serverless endpoint
 * (for example POST /api/coach/explain) rewrite the `detail` text of each
 * recommendation in richer language. The engine stays the source of truth for
 * *what* is recommended; an LLM layer would only change *how* it is explained.
 */
import type { BattingStrategy, Insight, Pitch, Player } from "../types";
import { effectiveBatting, effectiveBowling, pickBowlingAttack } from "./simulator";
import { isBowlingOption, isFrontlineBatter, overall } from "./squad";

export const PITCH_LABEL: Record<Pitch, string> = {
  batting: "Batting friendly",
  balanced: "Balanced",
  spin: "Spin friendly",
  pace: "Pace friendly",
};

export const PITCH_NOTE: Record<Pitch, string> = {
  batting: "True bounce and a quick outfield. Boundaries come easier, wickets are harder to buy.",
  balanced: "Even contest between bat and ball. No modifier for either side.",
  spin: "Dry surface that grips. Spinners gain bite, seamers lose some threat.",
  pace: "Green tinge and carry. Seamers gain movement, spinners lose some threat.",
};

export const STRATEGY_LABEL: Record<BattingStrategy, string> = {
  defensive: "Defensive",
  balanced: "Balanced",
  aggressive: "Aggressive",
};

export interface Slot {
  player: Player;
  reason: string;
}

export interface TeamMetrics {
  batting: number; // average effective batting of the top six
  bowling: number; // average effective bowling of the best five
  fielding: number; // XI average
  form: number; // XI average
  battingDepth: number; // batters rated 70 or above
  bowlingOptions: number; // players rated 60 or above with the ball
  spinOptions: number;
  paceOptions: number;
}

export interface StrategyReport {
  pitch: Pitch;
  metrics: TeamMetrics;
  strengths: Insight[];
  weaknesses: Insight[];
  battingOrder: Slot[];
  openingBowlers: Slot[];
  finalOverBowler: Slot | null;
  captain: Slot & { matchesCurrent: boolean };
  strategy: { value: BattingStrategy; reason: string };
  tactics: Insight[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r0 = (n: number) => Math.round(n);
const short = (p: Player) => p.name.split(" ").slice(-1)[0] ?? p.name;

export function teamMetrics(players: Player[], pitch: Pitch): TeamMetrics {
  const bats = players.map((p) => effectiveBatting(p, pitch)).sort((a, b) => b - a);
  const bowls = players.map((p) => effectiveBowling(p, pitch)).sort((a, b) => b - a);
  const bowlers = players.filter(isBowlingOption);
  return {
    batting: avg(bats.slice(0, 6)),
    bowling: avg(bowls.slice(0, 5)),
    fielding: avg(players.map((p) => p.fielding)),
    form: avg(players.map((p) => p.form)),
    battingDepth: players.filter(isFrontlineBatter).length,
    bowlingOptions: bowlers.length,
    spinOptions: bowlers.filter((p) => p.bowlingKind === "spin").length,
    paceOptions: bowlers.filter((p) => p.bowlingKind === "pace").length,
  };
}

export function suggestBattingOrder(players: Player[], pitch: Pitch): Slot[] {
  const ranked = [...players].sort((a, b) => effectiveBatting(b, pitch) - effectiveBatting(a, pitch));
  const [a, b] = ranked;
  if (!a || !b) return ranked.map((player) => ({ player, reason: "Only option available." }));

  // Prefer a left and right hand opening pair when the gap in quality is small.
  let pairNote = "";
  if (a.battingStyle === b.battingStyle) {
    const idx = ranked.findIndex(
      (p, i) => i >= 2 && i <= 3 && p.battingStyle !== a.battingStyle && effectiveBatting(b, pitch) - effectiveBatting(p, pitch) <= 4,
    );
    if (idx > 0) {
      const [alt] = ranked.splice(idx, 1);
      ranked.splice(1, 0, alt!);
      pairNote = " Paired as a left and right combination so bowlers must keep changing their line.";
    }
  }

  return ranked.map((player, i) => {
    const eff = r0(effectiveBatting(player, pitch));
    let reason: string;
    if (i < 2) reason = `Opener. Effective batting ${eff} on this pitch with form ${player.form} of 10.${i === 1 ? pairNote : ""}`;
    else if (i < 4) reason = `Top order. Strongest remaining bat at ${eff}, protected from the new ball.`;
    else if (i < 7) reason = `Middle order. Rated ${eff}, can accelerate in the final two overs.`;
    else reason = `Lower order. Batting ${player.batting}, selected mainly for the ball or the gloves.`;
    return { player, reason };
  });
}

export function suggestCaptain(players: Player[]): Player | null {
  const score = (p: Player) => overall(p) * 0.5 + p.form * 3 + (p.role === "All-rounder" ? 4 : 0) + p.fielding * 0.1;
  return [...players].sort((a, b) => score(b) - score(a))[0] ?? null;
}

export function suggestStrategy(m: TeamMetrics, pitch: Pitch): { value: BattingStrategy; reason: string } {
  if ((pitch === "batting" && m.battingDepth >= 5) || (m.batting >= 80 && m.battingDepth >= 6)) {
    return {
      value: "aggressive",
      reason: `With ${m.battingDepth} batters rated 70 or above${pitch === "batting" ? " on a batting friendly pitch" : ""}, you can afford to lose wickets chasing boundaries in a five over game.`,
    };
  }
  if (m.batting < 70 || m.battingDepth < 5 || pitch === "spin" || pitch === "pace") {
    const why =
      m.battingDepth < 5
        ? `only ${m.battingDepth} batters are rated 70 or above`
        : m.batting < 70
          ? `your top six average ${r0(m.batting)} with the bat`
          : `a ${PITCH_LABEL[pitch].toLowerCase()} surface helps bowlers`;
    return { value: "defensive", reason: `Protect wickets because ${why}. Rotate strike and attack the weaker bowlers.` };
  }
  return {
    value: "balanced",
    reason: `Top six average ${r0(m.batting)} with ${m.battingDepth} frontline batters. Strong enough to push on, not deep enough to throw wickets away.`,
  };
}

export function analyzeTeam(players: Player[], pitch: Pitch, currentCaptainId: string | null): StrategyReport {
  const m = teamMetrics(players, pitch);
  const strengths: Insight[] = [];
  const weaknesses: Insight[] = [];

  // Batting
  if (m.batting >= 80) strengths.push({ title: "Powerful top six", detail: `Top six average ${r0(m.batting)} effective batting on this pitch, well above the 75 benchmark.` });
  else if (m.batting < 72) weaknesses.push({ title: "Light on runs", detail: `Top six average only ${r0(m.batting)} effective batting. Expect to defend modest totals.` });
  if (m.battingDepth >= 7) strengths.push({ title: "Batting depth", detail: `${m.battingDepth} players rated 70 or above with the bat. A collapse is unlikely.` });
  else if (m.battingDepth <= 4) weaknesses.push({ title: "Thin batting", detail: `Only ${m.battingDepth} batters rated 70 or above. Two early wickets expose the tail.` });

  // Bowling
  if (m.bowling >= 82) strengths.push({ title: "Sharp attack", detail: `Your best five bowlers average ${r0(m.bowling)} effective on this pitch.` });
  else if (m.bowling < 74) weaknesses.push({ title: "Blunt attack", detail: `Your best five bowlers average only ${r0(m.bowling)}. Part timers will be targeted.` });
  if (m.bowlingOptions < 5) weaknesses.push({ title: "Not enough bowlers", detail: `${m.bowlingOptions} genuine options for five overs. At least one over goes to a part timer.` });
  if (pitch === "spin") {
    if (m.spinOptions >= 2) strengths.push({ title: "Built for this turner", detail: `${m.spinOptions} spinners will gain extra bite on a dry surface.` });
    else weaknesses.push({ title: "Short of spin", detail: `${m.spinOptions} spinner${m.spinOptions === 1 ? "" : "s"} on a pitch that rewards turn.` });
  }
  if (pitch === "pace") {
    if (m.paceOptions >= 3) strengths.push({ title: "Seam to exploit the grass", detail: `${m.paceOptions} pace options can use the extra carry.` });
    else weaknesses.push({ title: "Short of seam", detail: `Only ${m.paceOptions} pace option${m.paceOptions === 1 ? "" : "s"} on a seaming pitch.` });
  }

  // Fielding and form
  if (m.fielding >= 78) strengths.push({ title: "Elite fielding", detail: `XI fielding average ${r0(m.fielding)}. You will cut off twos and hold more catches.` });
  else if (m.fielding < 70) weaknesses.push({ title: "Loose in the field", detail: `XI fielding average ${r0(m.fielding)}. Expect to leak extra runs.` });
  if (m.form >= 7) strengths.push({ title: "Confident dressing room", detail: `Average form ${m.form.toFixed(1)} of 10. Ratings get a boost across the XI.` });
  const cold = players.filter((p) => p.form <= 4);
  if (cold.length) weaknesses.push({ title: "Players out of form", detail: `${cold.map((p) => p.name).join(", ")} ${cold.length === 1 ? "is" : "are"} at form ${cold.map((p) => p.form).join(", ")} of 10, which lowers their effective rating.` });

  // Selections
  const battingOrder = suggestBattingOrder(players, pitch);
  const attack = pickBowlingAttack(players, pitch);
  const bowlNote = (p: Player) => {
    const eff = r0(effectiveBowling(p, pitch));
    const kind = p.bowlingKind === "spin" ? "Spin" : "Pace";
    const boost =
      (pitch === "spin" && p.bowlingKind === "spin") || (pitch === "pace" && p.bowlingKind === "pace")
        ? " The pitch adds 6 to their rating."
        : "";
    return `${kind}, ${p.bowlingStyle.toLowerCase()}. Effective bowling ${eff}.${boost}`;
  };
  const openingBowlers = attack.slice(0, 2).map((p) => ({ player: p, reason: bowlNote(p) }));
  const last = attack[4];
  const finalOverBowler = last ? { player: last, reason: `${bowlNote(last)} Saved for the fifth over, when the game is decided.` } : null;

  const cap = suggestCaptain(players)!;
  const captain = {
    player: cap,
    reason: `Overall rating ${overall(cap)} with form ${cap.form} of 10${cap.role === "All-rounder" ? ", and involved with bat and ball" : ""}. Leads from the front in every phase.`,
    matchesCurrent: cap.id === currentCaptainId,
  };

  const strategy = suggestStrategy(m, pitch);

  // Tactics
  const tactics: Insight[] = [];
  tactics.push({ title: `Bat ${STRATEGY_LABEL[strategy.value].toLowerCase()}`, detail: strategy.reason });
  if (openingBowlers.length === 2)
    tactics.push({
      title: `Open with ${short(openingBowlers[0]!.player)} and ${short(openingBowlers[1]!.player)}`,
      detail: `They are your two highest effective bowlers on a ${PITCH_LABEL[pitch].toLowerCase()} pitch, so they get the first two overs while batters are new.`,
    });
  if (finalOverBowler)
    tactics.push({
      title: `Keep ${short(finalOverBowler.player)} for the last over`,
      detail: `Your third best option is held back so you are never left with a part timer when the chase is tight.`,
    });
  if (pitch === "batting") tactics.push({ title: "Field deep and bowl full", detail: "Boundaries are 15 percent more likely here. Protect the ropes and make batters hit along the ground." });
  if (pitch === "spin") tactics.push({ title: "Spin early, pace late", detail: "Spinners gain 6 rating points while the surface is fresh and dry. Use pace to change pace at the end." });
  if (pitch === "pace") tactics.push({ title: "Attack with slips", detail: "Seamers gain 6 rating points and more edges carry. Wickets with the new ball decide five over games." });
  if (m.fielding >= 78) tactics.push({ title: "Squeeze the singles", detail: `With fielding at ${r0(m.fielding)}, bring the ring in and dare batters to go aerial.` });
  else if (m.fielding < 72) tactics.push({ title: "Protect the boundary", detail: `Fielding at ${r0(m.fielding)} leaks twos. Push one more fielder back and concede singles.` });
  if (cold.length) {
    const worst = [...cold].sort((a, b) => a.form - b.form)[0]!;
    tactics.push({ title: `Review ${short(worst)}'s place`, detail: `Form ${worst.form} of 10 costs about ${r0((5 - worst.form) * 1.2 + 0.5)} rating points. A player in better form may add more.` });
  }

  return { pitch, metrics: m, strengths, weaknesses, battingOrder, openingBowlers, finalOverBowler, captain, strategy, tactics };
}

/* ------------------------------------------------------------------ */
/* Optional explanation layer                                          */
/* ------------------------------------------------------------------ */

export interface ExplanationLayer {
  /** Returns the same report with explanations rewritten. Must not change any selection. */
  explain(report: StrategyReport): Promise<StrategyReport>;
}

/** Default layer: the rules engine's own text, no network call. */
export const localExplanations: ExplanationLayer = {
  explain: async (report) => report,
};

/*
 * A serverless layer would look like:
 *
 * export const remoteExplanations: ExplanationLayer = {
 *   async explain(report) {
 *     const res = await fetch("/api/coach/explain", { method: "POST", body: JSON.stringify(report) });
 *     if (!res.ok) return report; // fall back to the rules engine text
 *     return { ...report, ...(await res.json()) };
 *   },
 * };
 */
