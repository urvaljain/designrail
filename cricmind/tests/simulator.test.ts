import { describe, expect, it } from "vitest";
import { OPPONENTS, PLAYERS } from "../src/data/players";
import { createRng, MAX_WICKETS, simulateMatch } from "../src/lib/simulator";
import { USER_TEAM_ID } from "../src/lib/squad";
import { analyzeTeam } from "../src/lib/strategy";
import type { BattingStrategy, Innings, Match, Pitch, Team } from "../src/types";

const XI_IDS = ["p01", "p02", "p08", "p03", "p11", "p12", "p13", "p17", "p19", "p21", "p22"];
const home: Team = {
  id: USER_TEAM_ID,
  name: "Your XI",
  short: "YOU",
  players: XI_IDS.map((id) => PLAYERS.find((p) => p.id === id)!),
  captainId: "p01",
};

const pitches: Pitch[] = ["batting", "balanced", "spin", "pace"];
const strategies: BattingStrategy[] = ["defensive", "balanced", "aggressive"];

function allMatches(): Match[] {
  const out: Match[] = [];
  let seed = 1;
  for (const pitch of pitches)
    for (const strategy of strategies)
      for (const opp of OPPONENTS)
        for (let i = 0; i < 8; i++) out.push(simulateMatch(home, opp, { pitch, strategy, opponentId: opp.id, seed: seed++ * 7919 }));
  return out;
}
const matches = allMatches();

function checkInnings(inn: Innings) {
  // Legal deliveries per over never exceed 6 and only the last over may be short.
  const perOver = new Map<number, number>();
  for (const b of inn.balls) if (b.result !== "wd") perOver.set(b.over, (perOver.get(b.over) ?? 0) + 1);
  const overs = [...perOver.keys()].sort((a, b) => a - b);
  overs.forEach((o, i) => {
    expect(perOver.get(o)).toBeLessThanOrEqual(6);
    if (i < overs.length - 1) expect(perOver.get(o)).toBe(6);
  });
  expect(inn.legalBalls).toBeLessThanOrEqual(30);
  expect(inn.legalBalls).toBe([...perOver.values()].reduce((a, b) => a + b, 0));
  expect(inn.wickets).toBeLessThanOrEqual(MAX_WICKETS);

  // Totals reconcile: batter runs plus extras equals the team total.
  const batterRuns = inn.batting.reduce((s, c) => s + c.runs, 0);
  expect(batterRuns + inn.extras).toBe(inn.runs);
  expect(inn.bowling.reduce((s, c) => s + c.runs, 0)).toBe(inn.runs);
  expect(inn.bowling.reduce((s, c) => s + c.wickets, 0)).toBe(inn.wickets);
  expect(inn.overRuns.reduce((a, b) => a + b, 0)).toBe(inn.runs);
  expect(inn.batting.filter((c) => c.out).length).toBe(inn.wickets);

  // Each bowler bowls at most one over in a five over innings.
  const bowlerOvers = new Map<string, Set<number>>();
  for (const b of inn.balls) {
    if (!bowlerOvers.has(b.bowlerId)) bowlerOvers.set(b.bowlerId, new Set());
    bowlerOvers.get(b.bowlerId)!.add(b.over);
  }
  for (const set of bowlerOvers.values()) expect(set.size).toBe(1);

  // Innings ends only for a valid reason.
  const chased = inn.target !== null && inn.runs >= inn.target;
  expect(inn.legalBalls === 30 || inn.wickets === MAX_WICKETS || chased).toBe(true);
  // Running score is consistent ball by ball.
  let score = 0;
  for (const b of inn.balls) {
    score += b.runs;
    expect(b.scoreAfter).toBe(score);
  }
}

describe("seedable PRNG", () => {
  it("returns the same sequence for the same seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 50; i++) expect(a()).toBe(b());
  });
  it("returns values in [0, 1)", () => {
    const r = createRng(9);
    for (let i = 0; i < 1000; i++) {
      const x = r();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("match simulation", () => {
  it("is reproducible for the same seed and settings", () => {
    const s = { pitch: "balanced" as const, strategy: "balanced" as const, opponentId: "deccan", seed: 123456 };
    expect(simulateMatch(home, OPPONENTS[1]!, s)).toEqual(simulateMatch(home, OPPONENTS[1]!, s));
  });

  it("keeps every innings internally consistent", () => {
    for (const m of matches) for (const inn of m.innings) checkInnings(inn);
  });

  it("sets the chase target to first innings runs plus one and stops once it is reached", () => {
    for (const m of matches) {
      const [first, second] = m.innings;
      expect(second.target).toBe(first.runs + 1);
      const winningBall = second.balls.findIndex((b) => b.scoreAfter >= second.target!);
      if (winningBall >= 0) expect(winningBall).toBe(second.balls.length - 1);
    }
  });

  it("declares the correct winner and margin", () => {
    for (const m of matches) {
      const [first, second] = m.innings;
      if (second.runs > first.runs) {
        expect(m.result.winnerId).toBe(second.battingTeamId);
        expect(m.result.margin).toBe(`by ${10 - second.wickets} wicket${10 - second.wickets === 1 ? "" : "s"}`);
      } else if (second.runs === first.runs) {
        expect(m.result.winnerId).toBeNull();
      } else {
        expect(m.result.winnerId).toBe(first.battingTeamId);
        const r = first.runs - second.runs;
        expect(m.result.margin).toBe(`by ${r} run${r === 1 ? "" : "s"}`);
      }
    }
  });

  it("rotates strike on odd runs and at the end of each over", () => {
    for (const m of matches) {
      for (const inn of m.innings) {
        for (let i = 0; i < inn.balls.length - 1; i++) {
          const b = inn.balls[i]!;
          const next = inn.balls[i + 1]!;
          if (b.result === "W") continue;
          const overChanged = next.over !== b.over;
          const odd = b.runs % 2 === 1 && b.result !== "wd";
          const swapped = odd !== overChanged;
          expect(next.batterId).toBe(swapped ? b.nonStrikerId : b.batterId);
          expect(next.nonStrikerId).toBe(swapped ? b.batterId : b.nonStrikerId);
        }
      }
    }
  });

  it("brings in a new batter after each wicket and never reuses a dismissed one", () => {
    for (const m of matches) {
      for (const inn of m.innings) {
        const out = new Set<string>();
        for (const b of inn.balls) {
          expect(out.has(b.batterId)).toBe(false);
          expect(out.has(b.nonStrikerId)).toBe(false);
          expect(b.batterId).not.toBe(b.nonStrikerId);
          if (b.result === "W") out.add(b.batterId);
        }
      }
    }
  });

  it("aggressive batting scores faster and loses more wickets than defensive on average", () => {
    const mean = (s: BattingStrategy, key: "runs" | "wickets") => {
      const ms = matches.filter((m) => m.settings.strategy === s);
      const inns = ms.map((m) => m.innings.find((i) => i.battingTeamId === USER_TEAM_ID)!);
      return inns.reduce((a, i) => a + i[key], 0) / inns.length;
    };
    expect(mean("aggressive", "wickets")).toBeGreaterThan(mean("defensive", "wickets"));
    expect(mean("aggressive", "runs") / 30).toBeGreaterThan(mean("defensive", "runs") / 30);
  });
});

describe("strategy coach", () => {
  it("is deterministic and recommends players from the XI", () => {
    const a = analyzeTeam(home.players, "spin", "p01");
    expect(a).toEqual(analyzeTeam(home.players, "spin", "p01"));
    expect(a.battingOrder).toHaveLength(11);
    expect(new Set(a.battingOrder.map((s) => s.player.id)).size).toBe(11);
    expect(a.openingBowlers).toHaveLength(2);
    for (const s of a.openingBowlers) expect(XI_IDS).toContain(s.player.id);
  });

  it("prefers spinners to open on a spin friendly pitch", () => {
    const a = analyzeTeam(home.players, "spin", null);
    expect(a.openingBowlers.some((s) => s.player.bowlingKind === "spin")).toBe(true);
  });
});
