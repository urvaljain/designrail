import type {
  Ball,
  BallResult,
  BattingStrategy,
  BatterCard,
  BowlerCard,
  DismissalKind,
  Innings,
  Match,
  MatchResult,
  MatchSettings,
  Pitch,
  Player,
  Team,
} from "../types";

export const OVERS_PER_INNINGS = 5;
export const BALLS_PER_OVER = 6;
export const MAX_WICKETS = 10;
/** In a five over game every bowler is limited to one over. */
export const MAX_OVERS_PER_BOWLER = 1;

/* ------------------------------------------------------------------ */
/* Seedable PRNG (mulberry32). Same seed, same sequence, every time.   */
/* ------------------------------------------------------------------ */

export type Rng = () => number;

export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newSeed(): number {
  return Math.floor(Math.random() * 900000) + 100000;
}

/* ------------------------------------------------------------------ */
/* Rating modifiers                                                    */
/* ------------------------------------------------------------------ */

const formBoost = (form: number) => (form - 5) * 1.2;

export function effectiveBatting(p: Player, pitch: Pitch): number {
  const pitchBoost = pitch === "batting" ? 4 : 0;
  return p.batting + formBoost(p.form) + pitchBoost;
}

export function effectiveBowling(p: Player, pitch: Pitch): number {
  let pitchBoost = 0;
  if (pitch === "batting") pitchBoost = -3;
  if (pitch === "spin") pitchBoost = p.bowlingKind === "spin" ? 6 : -4;
  if (pitch === "pace") pitchBoost = p.bowlingKind === "pace" ? 6 : -4;
  return p.bowling + formBoost(p.form) + pitchBoost;
}

/**
 * Picks the five bowlers for a five over innings and the order they bowl in.
 * The two best open, the third best keeps the final over.
 */
export function pickBowlingAttack(players: Player[], pitch: Pitch): Player[] {
  const ranked = [...players].sort((a, b) => effectiveBowling(b, pitch) - effectiveBowling(a, pitch));
  const five = ranked.slice(0, OVERS_PER_INNINGS);
  const order = [0, 1, 3, 4, 2];
  return order.map((i) => five[i]).filter((p): p is Player => Boolean(p));
}

/* ------------------------------------------------------------------ */
/* Ball outcome model                                                  */
/* ------------------------------------------------------------------ */

type Weights = Record<BallResult, number>;

const BASE: Weights = { dot: 34, "1": 33, "2": 9, "3": 1, "4": 11, "6": 5, W: 5.5, wd: 3 };

const STRATEGY_MOD: Record<BattingStrategy, Partial<Weights>> = {
  defensive: { dot: 0.95, "1": 1.25, "2": 1.15, "4": 0.8, "6": 0.6, W: 0.55 },
  balanced: {},
  aggressive: { dot: 0.9, "1": 0.85, "4": 1.3, "6": 1.45, W: 2.1 },
};

export function outcomeWeights(args: {
  batter: Player;
  bowler: Player;
  pitch: Pitch;
  strategy: BattingStrategy;
  fieldingAvg: number;
}): Weights {
  const { batter, bowler, pitch, strategy, fieldingAvg } = args;
  const diff = (effectiveBatting(batter, pitch) - effectiveBowling(bowler, pitch)) / 100;
  const w: Weights = { ...BASE };

  w["4"] *= Math.exp(diff * 1.6);
  w["6"] *= Math.exp(diff * 2);
  w.W *= Math.exp(-diff * 1.8);
  w.dot *= Math.exp(-diff * 0.8);

  if (pitch === "batting") {
    w["4"] *= 1.15;
    w["6"] *= 1.15;
    w.W *= 0.85;
  }
  if (pitch === "spin" && bowler.bowlingKind === "spin") {
    w.W *= 1.15;
    w["6"] *= 0.9;
  }
  if (pitch === "pace" && bowler.bowlingKind === "pace") {
    w.W *= 1.15;
    w.dot *= 1.05;
  }

  // Sharper fielding sides cut off twos.
  w["2"] *= Math.max(0.6, 1 - (fieldingAvg - 75) / 150);

  for (const [k, m] of Object.entries(STRATEGY_MOD[strategy])) {
    w[k as BallResult] *= m as number;
  }
  return w;
}

function pick(weights: Weights, r: number): BallResult {
  const entries = Object.entries(weights) as [BallResult, number][];
  const total = entries.reduce((s, [, v]) => s + v, 0);
  let x = r * total;
  for (const [k, v] of entries) {
    x -= v;
    if (x < 0) return k;
  }
  return "dot";
}

/** The side that is chasing adapts to the required rate. The user's side keeps its chosen plan. */
export function chasingStrategy(required: number, ballsLeft: number, wickets: number): BattingStrategy {
  const rrr = ballsLeft > 0 ? (required / ballsLeft) * 6 : 99;
  if (rrr > 11) return "aggressive";
  if (rrr < 6 && wickets >= 6) return "defensive";
  return "balanced";
}

/* ------------------------------------------------------------------ */
/* Innings simulation                                                  */
/* ------------------------------------------------------------------ */

const lastName = (p: Player) => p.name.split(" ").slice(-1)[0] ?? p.name;

function commentaryFor(result: BallResult, batter: Player, bowler: Player, n: number, extra = ""): string {
  const b = lastName(batter);
  const bw = lastName(bowler);
  const pickLine = (lines: string[]) => lines[n % lines.length] ?? lines[0]!;
  switch (result) {
    case "dot":
      return pickLine([`${bw} beats ${b} outside off. No run.`, `Solid block from ${b}. Dot ball.`, `${b} defends back to ${bw}.`]);
    case "1":
      return pickLine([`${b} works it into the leg side for one.`, `Pushed to cover, they take a quick single.`, `${b} drops it soft and scampers through.`]);
    case "2":
      return pickLine([`${b} finds the gap at deep midwicket. Two runs.`, `Driven wide of long off, they come back for two.`]);
    case "3":
      return `${b} times it into the deep and the outfield slows it. Three runs.`;
    case "4":
      return pickLine([`Four. ${b} cuts ${bw} through point.`, `Four. Driven on the up past mid off.`, `Four. ${b} flicks it fine off the pads.`]);
    case "6":
      return pickLine([`Six. ${b} clears long on with a clean swing.`, `Six. Picked up over midwicket and into the stands.`]);
    case "wd":
      return `Wide. ${bw} drifts down the leg side.`;
    case "W":
      return `Out. ${b} ${extra}.`;
  }
}

interface InningsInput {
  batting: Team;
  bowling: Team;
  pitch: Pitch;
  /** Fixed strategy, or null to adapt (used by the chasing opponent). */
  strategy: BattingStrategy | null;
  target: number | null;
  inningsIndex: 0 | 1;
  rng: Rng;
}

export function simulateInnings(input: InningsInput): Innings {
  const { batting, bowling, pitch, target, inningsIndex, rng } = input;
  const order = batting.players;
  const attack = pickBowlingAttack(bowling.players, pitch);
  const fieldingAvg = bowling.players.reduce((s, p) => s + p.fielding, 0) / Math.max(1, bowling.players.length);
  const keeper = bowling.players.find((p) => p.role === "Wicketkeeper");

  const batCards = new Map<string, BatterCard>();
  const bowlCards = new Map<string, BowlerCard>();
  const card = (p: Player) => {
    let c = batCards.get(p.id);
    if (!c) {
      c = { playerId: p.id, runs: 0, balls: 0, fours: 0, sixes: 0, out: false, howOut: "not out" };
      batCards.set(p.id, c);
    }
    return c;
  };
  const bcard = (p: Player) => {
    let c = bowlCards.get(p.id);
    if (!c) {
      c = { playerId: p.id, balls: 0, runs: 0, wickets: 0, wides: 0, dots: 0 };
      bowlCards.set(p.id, c);
    }
    return c;
  };

  let striker = order[0]!;
  let nonStriker = order[1]!;
  let nextIn = 2;
  card(striker);
  card(nonStriker);

  let runs = 0;
  let wickets = 0;
  let legalBalls = 0;
  let extras = 0;
  const balls: Ball[] = [];
  const overRuns: number[] = [];
  const overWickets: number[] = [];

  const chaseWon = () => target !== null && runs >= target;

  for (let over = 0; over < OVERS_PER_INNINGS; over++) {
    if (wickets >= MAX_WICKETS || chaseWon()) break;
    const bowler = attack[over % attack.length]!;
    let legalInOver = 0;
    overRuns[over] = 0;
    overWickets[over] = 0;
    bcard(bowler);

    while (legalInOver < BALLS_PER_OVER) {
      const strategy =
        input.strategy ??
        (target !== null
          ? chasingStrategy(target - runs, OVERS_PER_INNINGS * BALLS_PER_OVER - legalBalls, wickets)
          : "balanced");
      const result = pick(outcomeWeights({ batter: striker, bowler, pitch, strategy, fieldingAvg }), rng());
      const bc = bcard(bowler);
      const sc = card(striker);
      const n = balls.length;

      if (result === "wd") {
        runs += 1;
        extras += 1;
        bc.runs += 1;
        bc.wides += 1;
        overRuns[over]! += 1;
        balls.push({
          innings: inningsIndex,
          over,
          legalBallInOver: legalInOver + 1,
          result,
          runs: 1,
          batterId: striker.id,
          nonStrikerId: nonStriker.id,
          bowlerId: bowler.id,
          scoreAfter: runs,
          wicketsAfter: wickets,
          commentary: commentaryFor(result, striker, bowler, n),
        });
        if (chaseWon()) break;
        continue;
      }

      legalInOver += 1;
      legalBalls += 1;
      bc.balls += 1;
      sc.balls += 1;

      if (result === "W") {
        const r = rng();
        let kind: DismissalKind;
        if (bowler.bowlingKind === "spin") kind = r < 0.25 ? "lbw" : r < 0.5 ? "bowled" : "caught";
        else kind = r < 0.2 ? "lbw" : r < 0.5 ? "bowled" : "caught";
        let fielder: Player | undefined;
        if (kind === "caught") {
          const fielders = bowling.players.filter((p) => p.id !== bowler.id);
          fielder =
            keeper && bowler.bowlingKind === "pace" && rng() < 0.3
              ? keeper
              : fielders[Math.floor(rng() * fielders.length)];
        }
        const howOut =
          kind === "caught" && fielder
            ? fielder.id === bowler.id
              ? `c & b ${lastName(bowler)}`
              : `c ${lastName(fielder)} b ${lastName(bowler)}`
            : kind === "lbw"
              ? `lbw b ${lastName(bowler)}`
              : `b ${lastName(bowler)}`;
        wickets += 1;
        bc.wickets += 1;
        bc.dots += 1;
        overWickets[over]! += 1;
        sc.out = true;
        sc.howOut = howOut;
        const ball: Ball = {
          innings: inningsIndex,
          over,
          legalBallInOver: legalInOver,
          result,
          runs: 0,
          batterId: striker.id,
          nonStrikerId: nonStriker.id,
          bowlerId: bowler.id,
          dismissal: fielder ? { kind, fielderId: fielder.id } : { kind },
          scoreAfter: runs,
          wicketsAfter: wickets,
          commentary: commentaryFor(result, striker, bowler, n, howOut),
        };
        balls.push(ball);
        if (wickets >= MAX_WICKETS || nextIn >= order.length) break;
        // The incoming batter takes strike.
        striker = order[nextIn++]!;
        card(striker);
        continue;
      }

      const r = result === "dot" ? 0 : Number(result);
      runs += r;
      sc.runs += r;
      bc.runs += r;
      overRuns[over]! += r;
      if (r === 0) bc.dots += 1;
      if (r === 4) sc.fours += 1;
      if (r === 6) sc.sixes += 1;
      balls.push({
        innings: inningsIndex,
        over,
        legalBallInOver: legalInOver,
        result,
        runs: r,
        batterId: striker.id,
        nonStrikerId: nonStriker.id,
        bowlerId: bowler.id,
        scoreAfter: runs,
        wicketsAfter: wickets,
        commentary: commentaryFor(result, striker, bowler, n),
      });
      if (r % 2 === 1) [striker, nonStriker] = [nonStriker, striker];
      if (chaseWon()) break;
    }

    // Batters change ends at the end of a completed over.
    if (legalInOver === BALLS_PER_OVER) [striker, nonStriker] = [nonStriker, striker];
  }

  const battingCards: BatterCard[] = order.map(
    (p) =>
      batCards.get(p.id) ?? {
        playerId: p.id,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        out: false,
        howOut: "did not bat",
      },
  );

  return {
    battingTeamId: batting.id,
    bowlingTeamId: bowling.id,
    runs,
    wickets,
    legalBalls,
    extras,
    balls,
    overRuns,
    overWickets,
    batting: battingCards,
    bowling: attack.map((p) => bowlCards.get(p.id)).filter((c): c is BowlerCard => Boolean(c)),
    target,
  };
}

/* ------------------------------------------------------------------ */
/* Match                                                               */
/* ------------------------------------------------------------------ */

export function decideResult(first: Innings, second: Innings, teams: Record<string, Team>): MatchResult {
  const target = first.runs + 1;
  const chaser = teams[second.battingTeamId]!;
  const setter = teams[first.battingTeamId]!;
  if (second.runs >= target) {
    const w = MAX_WICKETS - second.wickets;
    const ballsLeft = OVERS_PER_INNINGS * BALLS_PER_OVER - second.legalBalls;
    const margin = `by ${w} wicket${w === 1 ? "" : "s"}`;
    return {
      winnerId: chaser.id,
      margin,
      summary: `${chaser.name} won ${margin}${ballsLeft > 0 ? ` with ${ballsLeft} ball${ballsLeft === 1 ? "" : "s"} to spare` : ""}`,
    };
  }
  if (second.runs === first.runs) {
    return { winnerId: null, margin: "Match tied", summary: "Match tied. Both sides finished level." };
  }
  const r = first.runs - second.runs;
  const margin = `by ${r} run${r === 1 ? "" : "s"}`;
  return { winnerId: setter.id, margin, summary: `${setter.name} won ${margin}` };
}

/**
 * Simulates a full five over match. Pure and deterministic: the same teams and
 * settings (including the seed) always produce the same match.
 * `home` is the user's XI; the chosen batting strategy applies to them.
 */
export function simulateMatch(home: Team, away: Team, settings: MatchSettings): Match {
  const rng = createRng(settings.seed);
  const tossWinner = rng() < 0.5 ? home : away;
  const tossLoser = tossWinner === home ? away : home;
  // On a flat deck the toss winner bats first. Otherwise they chase.
  const battingFirst = settings.pitch === "batting" ? tossWinner : tossLoser;
  const battingSecond = battingFirst === home ? away : home;

  const strategyFor = (t: Team, chasing: boolean): BattingStrategy | null =>
    t.id === home.id ? settings.strategy : chasing ? null : "balanced";

  const first = simulateInnings({
    batting: battingFirst,
    bowling: battingSecond,
    pitch: settings.pitch,
    strategy: strategyFor(battingFirst, false),
    target: null,
    inningsIndex: 0,
    rng,
  });
  const second = simulateInnings({
    batting: battingSecond,
    bowling: battingFirst,
    pitch: settings.pitch,
    strategy: strategyFor(battingSecond, true),
    target: first.runs + 1,
    inningsIndex: 1,
    rng,
  });

  return {
    settings,
    home,
    away,
    tossWinnerId: tossWinner.id,
    battingFirstId: battingFirst.id,
    innings: [first, second],
    result: decideResult(first, second, { [home.id]: home, [away.id]: away }),
  };
}

/* ------------------------------------------------------------------ */
/* Display helpers                                                     */
/* ------------------------------------------------------------------ */

export const oversText = (legalBalls: number) => `${Math.floor(legalBalls / 6)}.${legalBalls % 6}`;

export const runRate = (runs: number, legalBalls: number) =>
  legalBalls === 0 ? 0 : (runs / legalBalls) * 6;

export const strikeRate = (runs: number, balls: number) => (balls === 0 ? 0 : (runs / balls) * 100);

export const economy = (runs: number, balls: number) => (balls === 0 ? 0 : (runs / balls) * 6);
