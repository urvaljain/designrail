import type { BatterCard, BowlerCard, Innings, Insight, Match, Player } from "../types";
import { STRATEGY_LABEL } from "./strategy";
import { USER_TEAM_ID } from "./squad";
import { economy, oversText, strikeRate } from "./simulator";

export interface Performer<T> {
  player: Player;
  teamName: string;
  card: T;
}

export interface MatchInsights {
  userWon: boolean | null; // null when tied
  topBatter: Performer<BatterCard> | null;
  bestBowler: Performer<BowlerCard> | null;
  observations: Insight[];
  improvements: Insight[];
}

const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round((a / b) * 100));

function battingStats(inn: Innings) {
  const legal = inn.balls.filter((b) => b.result !== "wd");
  const dots = legal.filter((b) => b.result === "dot").length;
  const boundaries = legal.filter((b) => b.result === "4" || b.result === "6");
  const boundaryRuns = boundaries.reduce((s, b) => s + b.runs, 0);
  return { legal: legal.length, dots, boundaries: boundaries.length, boundaryRuns };
}

export function analyzeMatch(match: Match): MatchInsights {
  const teams = { [match.home.id]: match.home, [match.away.id]: match.away };
  const players = new Map<string, Player>([...match.home.players, ...match.away.players].map((p) => [p.id, p]));
  const [first, second] = match.innings;
  const userBat = first.battingTeamId === USER_TEAM_ID ? first : second;
  const userBowl = first.battingTeamId === USER_TEAM_ID ? second : first;
  const userChased = userBat === second;
  const opp = match.away;

  // Top performers across both teams.
  let topBatter: Performer<BatterCard> | null = null;
  let bestBowler: Performer<BowlerCard> | null = null;
  for (const inn of match.innings) {
    for (const c of inn.batting) {
      if (c.balls === 0 && c.runs === 0) continue;
      if (!topBatter || c.runs > topBatter.card.runs || (c.runs === topBatter.card.runs && c.balls < topBatter.card.balls))
        topBatter = { player: players.get(c.playerId)!, teamName: teams[inn.battingTeamId]!.name, card: c };
    }
    for (const c of inn.bowling) {
      if (c.balls === 0) continue;
      if (!bestBowler || c.wickets > bestBowler.card.wickets || (c.wickets === bestBowler.card.wickets && c.runs < bestBowler.card.runs))
        bestBowler = { player: players.get(c.playerId)!, teamName: teams[inn.bowlingTeamId]!.name, card: c };
    }
  }

  const userWon = match.result.winnerId === null ? null : match.result.winnerId === USER_TEAM_ID;
  const bat = battingStats(userBat);
  const observations: Insight[] = [];
  const improvements: Insight[] = [];
  const strategy = match.settings.strategy;

  // Batting observations
  observations.push({
    title: `${STRATEGY_LABEL[strategy]} batting: ${userBat.runs} for ${userBat.wickets}`,
    detail: `Your XI scored at ${(userBat.legalBalls ? (userBat.runs / userBat.legalBalls) * 6 : 0).toFixed(2)} an over from ${oversText(userBat.legalBalls)} overs, with ${bat.boundaries} boundaries worth ${bat.boundaryRuns} runs (${pct(bat.boundaryRuns, userBat.runs)} percent of the total).`,
  });
  if (bat.legal > 0)
    observations.push({
      title: `${bat.dots} dot balls faced`,
      detail: `${pct(bat.dots, bat.legal)} percent of legal deliveries produced no run. ${pct(bat.dots, bat.legal) >= 40 ? "That is high for a five over game." : "Good strike rotation for a short format."}`,
    });

  const collapseOver = userBat.overWickets.findIndex((w) => w >= 2);
  if (collapseOver >= 0)
    observations.push({
      title: `Collapse in over ${collapseOver + 1}`,
      detail: `You lost ${userBat.overWickets[collapseOver]} wickets in over ${collapseOver + 1}, scoring ${userBat.overRuns[collapseOver]} runs in it.`,
    });

  // Bowling observations
  const costly = userBowl.overRuns.reduce((best, r, i) => (r > (userBowl.overRuns[best] ?? -1) ? i : best), 0);
  const costlyBall = userBowl.balls.find((b) => b.over === costly);
  const costlyBowler = costlyBall ? players.get(costlyBall.bowlerId) : undefined;
  if (costlyBowler && userBowl.overRuns.length)
    observations.push({
      title: `Most expensive over: ${userBowl.overRuns[costly]} runs`,
      detail: `${costlyBowler.name} bowled over ${costly + 1} of ${opp.name}'s innings and conceded ${userBowl.overRuns[costly]}.`,
    });
  const tightest = userBowl.bowling.filter((c) => c.balls > 0).sort((a, b) => economy(a.runs, a.balls) - economy(b.runs, b.balls))[0];
  if (tightest)
    observations.push({
      title: `Tightest spell: ${players.get(tightest.playerId)!.name}`,
      detail: `${tightest.runs} runs from ${oversText(tightest.balls)} overs with ${tightest.wickets} wicket${tightest.wickets === 1 ? "" : "s"} and ${tightest.dots} dot balls.`,
    });
  const wides = userBowl.bowling.reduce((s, c) => s + c.wides, 0);
  if (wides >= 2) observations.push({ title: `${wides} wides conceded`, detail: `Each wide added a run and an extra delivery for ${opp.name}.` });

  if (userChased) {
    const target = second.target ?? 0;
    const lastOverBalls = userBat.balls.filter((b) => b.over === Math.max(0, userBat.overRuns.length - 1));
    const before = lastOverBalls[0] ? lastOverBalls[0].scoreAfter - lastOverBalls[0].runs : 0;
    observations.push({
      title: userWon ? "Chase completed" : "Chase fell short",
      detail: `You needed ${target} and reached ${userBat.runs}. Going into the final over you needed ${Math.max(0, target - before)}.`,
    });
  }

  // Improvements, each tied to an event above.
  if (strategy === "aggressive" && userBat.wickets >= 5)
    improvements.push({ title: "Switch to Balanced batting", detail: `Aggressive batting cost ${userBat.wickets} wickets. Balanced cuts wicket risk by about a third while keeping most of the boundaries.` });
  if (strategy === "defensive" && userBat.wickets <= 2 && (!userWon || userChased === false))
    improvements.push({ title: "Bat with more intent", detail: `You kept ${10 - userBat.wickets} wickets in hand at the end. In a five over game unused wickets are wasted runs. Try Balanced or Aggressive.` });
  if (bat.legal > 0 && pct(bat.dots, bat.legal) >= 40)
    improvements.push({ title: "Rotate the strike", detail: `${pct(bat.dots, bat.legal)} percent dot balls. Move your best strike rotators into the top three of the batting order.` });
  if (collapseOver >= 0)
    improvements.push({ title: "Protect the middle order", detail: `The over ${collapseOver + 1} collapse exposed the lower order. Consider a deeper batting XI or a Defensive plan after early wickets.` });
  if (costlyBowler && (userBowl.overRuns[costly] ?? 0) >= 14)
    improvements.push({ title: `Rethink ${costlyBowler.name}'s over`, detail: `${userBowl.overRuns[costly]} runs in one over decides a five over game. Give that over to a bowler in better form or one the pitch favours.` });
  if (wides >= 2) improvements.push({ title: "Tighten the lines", detail: `${wides} wides handed over free runs. Bowlers in better form tend to stay on target.` });
  if (userWon === false && userChased && (second.target ?? 0) - userBat.runs <= 6)
    improvements.push({ title: "Push harder at the end", detail: `You lost by a small margin. An Aggressive plan in the final over could have closed the gap.` });
  if (!improvements.length)
    improvements.push({ title: "Keep the same plan", detail: `Your ${STRATEGY_LABEL[strategy].toLowerCase()} approach worked. Try the same XI against a stronger opponent or on a different pitch.` });

  return { userWon, topBatter, bestBowler, observations, improvements };
}

export { strikeRate, economy };
