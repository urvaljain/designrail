export type Role = "Batter" | "Bowler" | "All-rounder" | "Wicketkeeper";
export type BowlingKind = "pace" | "spin";
export type Pitch = "batting" | "balanced" | "spin" | "pace";
export type BattingStrategy = "defensive" | "balanced" | "aggressive";

export interface Player {
  id: string;
  name: string;
  role: Role;
  batting: number; // 1 to 100
  bowling: number; // 1 to 100
  fielding: number; // 1 to 100
  form: number; // 1 to 10, recent form
  battingStyle: "Right hand bat" | "Left hand bat";
  bowlingStyle: string;
  bowlingKind: BowlingKind;
}

export interface Squad {
  selectedIds: string[];
  /** Batting order, a permutation of selectedIds. */
  battingOrder: string[];
  captainId: string | null;
  keeperId: string | null;
}

export interface SavedLineup extends Squad {
  savedAt: string;
}

export interface Team {
  id: string;
  name: string;
  short: string;
  /** Batting order. */
  players: Player[];
  captainId: string | null;
}

export type BallResult = "dot" | "1" | "2" | "3" | "4" | "6" | "W" | "wd";
export type DismissalKind = "bowled" | "caught" | "lbw";

export interface Ball {
  innings: 0 | 1;
  over: number; // 0 based over index
  legalBallInOver: number; // 1 to 6 for legal balls, the upcoming count for a wide
  result: BallResult;
  runs: number; // total runs added to the team score by this delivery
  batterId: string;
  nonStrikerId: string;
  bowlerId: string;
  dismissal?: { kind: DismissalKind; fielderId?: string };
  scoreAfter: number;
  wicketsAfter: number;
  commentary: string;
}

export interface BatterCard {
  playerId: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  out: boolean;
  howOut: string; // "not out", "did not bat", "c Rao b Iyer"
}

export interface BowlerCard {
  playerId: string;
  balls: number; // legal balls
  runs: number;
  wickets: number;
  wides: number;
  dots: number;
}

export interface Innings {
  battingTeamId: string;
  bowlingTeamId: string;
  runs: number;
  wickets: number;
  legalBalls: number;
  extras: number;
  balls: Ball[];
  overRuns: number[];
  overWickets: number[];
  batting: BatterCard[];
  bowling: BowlerCard[];
  target: number | null;
}

export interface MatchSettings {
  pitch: Pitch;
  strategy: BattingStrategy;
  opponentId: string;
  seed: number;
}

export interface MatchResult {
  winnerId: string | null; // null for a tie
  margin: string; // "by 12 runs", "by 4 wickets", "Match tied"
  summary: string;
}

export interface Match {
  settings: MatchSettings;
  home: Team;
  away: Team;
  tossWinnerId: string;
  battingFirstId: string;
  innings: [Innings, Innings];
  result: MatchResult;
}

export interface Insight {
  title: string;
  detail: string;
}
