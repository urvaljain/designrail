import type { BowlingKind, Player, Role, Team } from "../types";

type Row = [
  id: string,
  name: string,
  role: Role,
  batting: number,
  bowling: number,
  fielding: number,
  form: number,
  hand: "R" | "L",
  bowlingStyle: string,
];

const SPIN = /spin|break|orthodox|wrist/i;

function build(rows: Row[]): Player[] {
  return rows.map(([id, name, role, batting, bowling, fielding, form, hand, bowlingStyle]) => ({
    id,
    name,
    role,
    batting,
    bowling,
    fielding,
    form,
    battingStyle: hand === "R" ? "Right hand bat" : "Left hand bat",
    bowlingStyle,
    bowlingKind: (SPIN.test(bowlingStyle) ? "spin" : "pace") as BowlingKind,
  }));
}

/** The 24 fictional cricketers available in the Squad Builder. */
export const PLAYERS: Player[] = build([
  // Batters
  ["p01", "Arjun Malhotra", "Batter", 88, 18, 79, 8, "R", "Right arm off break"],
  ["p02", "Kieran Ashby", "Batter", 84, 12, 83, 6, "L", "Right arm medium"],
  ["p03", "Ravi Deshpande", "Batter", 81, 24, 71, 9, "R", "Right arm leg break"],
  ["p04", "Tomas Whitcombe", "Batter", 77, 9, 88, 5, "R", "Right arm medium"],
  ["p05", "Imran Qadir", "Batter", 79, 15, 74, 7, "L", "Slow left arm orthodox"],
  ["p06", "Dylan Okafor", "Batter", 73, 21, 91, 8, "R", "Right arm medium fast"],
  ["p07", "Sameer Kulkarni", "Batter", 70, 11, 69, 4, "R", "Right arm off break"],
  // Wicketkeepers
  ["p08", "Nikhil Bhandari", "Wicketkeeper", 80, 5, 90, 7, "R", "Does not bowl"],
  ["p09", "Callum Rees", "Wicketkeeper", 72, 5, 86, 8, "L", "Does not bowl"],
  ["p10", "Farhan Siddiqui", "Wicketkeeper", 66, 5, 92, 5, "R", "Does not bowl"],
  // All-rounders
  ["p11", "Zane Hollister", "All-rounder", 76, 72, 80, 8, "R", "Right arm fast medium"],
  ["p12", "Varun Iyengar", "All-rounder", 68, 78, 73, 7, "L", "Slow left arm orthodox"],
  ["p13", "Marcus Delacroix", "All-rounder", 74, 69, 77, 6, "R", "Right arm medium fast"],
  ["p14", "Harsh Chaudhary", "All-rounder", 62, 76, 70, 9, "R", "Right arm off break"],
  ["p15", "Liam Petrakis", "All-rounder", 71, 64, 84, 5, "L", "Left arm medium"],
  ["p16", "Aditya Rane", "All-rounder", 58, 74, 76, 7, "R", "Right arm leg break"],
  // Pace bowlers
  ["p17", "Jasper Kingsley", "Bowler", 24, 89, 72, 8, "R", "Right arm fast"],
  ["p18", "Owais Rahmani", "Bowler", 31, 85, 68, 6, "L", "Left arm fast"],
  ["p19", "Brendan Mulvaney", "Bowler", 19, 81, 75, 9, "R", "Right arm fast medium"],
  ["p20", "Pranav Hegde", "Bowler", 27, 77, 66, 5, "R", "Right arm medium fast"],
  // Spin bowlers
  ["p21", "Yusuf Barakzai", "Bowler", 22, 87, 70, 7, "R", "Right arm leg break"],
  ["p22", "Kabir Sethi", "Bowler", 35, 82, 78, 8, "L", "Slow left arm orthodox"],
  ["p23", "Elliot Fairbairn", "Bowler", 18, 79, 64, 6, "R", "Right arm off break"],
  ["p24", "Devraj Pillai", "Bowler", 29, 75, 71, 4, "L", "Left arm wrist spin"],
]);

export const PLAYER_BY_ID: Record<string, Player> = Object.fromEntries(
  PLAYERS.map((p) => [p.id, p]),
);

function opponent(id: string, name: string, short: string, rows: Row[], captainIndex: number): Team {
  const players = build(rows);
  return { id, name, short, players, captainId: players[captainIndex]?.id ?? null };
}

/** Three fictional opponents for the Quick Match Simulator, listed in batting order. */
export const OPPONENTS: Team[] = [
  opponent(
    "harbour",
    "Harbour Hawks",
    "HHK",
    [
      ["h01", "Rohan Varghese", "Batter", 78, 14, 72, 7, "R", "Right arm medium"],
      ["h02", "Sean Gallagher", "Batter", 74, 10, 75, 6, "L", "Right arm off break"],
      ["h03", "Mehul Joshi", "Batter", 76, 20, 70, 6, "R", "Right arm leg break"],
      ["h04", "Ty Abernathy", "Wicketkeeper", 69, 5, 85, 7, "R", "Does not bowl"],
      ["h05", "Andile Mokoena", "All-rounder", 67, 70, 78, 6, "R", "Right arm fast medium"],
      ["h06", "Gaurav Thakkar", "All-rounder", 63, 72, 71, 5, "L", "Slow left arm orthodox"],
      ["h07", "Felix Strand", "All-rounder", 60, 66, 74, 7, "R", "Right arm medium fast"],
      ["h08", "Ishaan Mehra", "Bowler", 28, 78, 69, 6, "R", "Right arm off break"],
      ["h09", "Cormac Doyle", "Bowler", 22, 80, 66, 7, "R", "Right arm fast"],
      ["h10", "Waqar Hamdani", "Bowler", 18, 76, 63, 5, "L", "Left arm fast medium"],
      ["h11", "Nitin Bose", "Bowler", 15, 74, 65, 6, "R", "Right arm leg break"],
    ],
    4,
  ),
  opponent(
    "deccan",
    "Deccan Comets",
    "DCM",
    [
      ["d01", "Karthik Subramaniam", "Batter", 83, 16, 74, 8, "R", "Right arm off break"],
      ["d02", "Aaron Pellegrini", "Batter", 80, 12, 80, 7, "L", "Right arm medium"],
      ["d03", "Siddharth Nair", "Batter", 79, 22, 72, 6, "R", "Right arm leg break"],
      ["d04", "Omari Baptiste", "All-rounder", 75, 71, 79, 8, "R", "Right arm fast medium"],
      ["d05", "Rahul Ganguli", "Wicketkeeper", 73, 5, 88, 6, "R", "Does not bowl"],
      ["d06", "Theo Lindqvist", "All-rounder", 68, 73, 76, 7, "L", "Left arm medium fast"],
      ["d07", "Manav Khurana", "All-rounder", 61, 77, 70, 6, "R", "Right arm leg break"],
      ["d08", "Ricardo Fonseca", "Bowler", 26, 84, 68, 7, "R", "Right arm fast"],
      ["d09", "Vikrant Solanki", "Bowler", 21, 81, 64, 8, "L", "Slow left arm orthodox"],
      ["d10", "Hamish Carr", "Bowler", 19, 79, 70, 5, "R", "Right arm fast medium"],
      ["d11", "Junaid Effendi", "Bowler", 17, 78, 62, 6, "R", "Right arm off break"],
    ],
    0,
  ),
  opponent(
    "coastal",
    "Coastal Monarchs",
    "CMN",
    [
      ["c01", "Darius Wellington", "Batter", 86, 14, 77, 7, "L", "Right arm medium"],
      ["c02", "Abhay Rathore", "Batter", 82, 18, 73, 8, "R", "Right arm off break"],
      ["c03", "Jonah Whitfield", "All-rounder", 78, 74, 81, 7, "R", "Right arm fast medium"],
      ["c04", "Prakash Menon", "Batter", 80, 10, 70, 6, "R", "Right arm leg break"],
      ["c05", "Gideon Marsh", "Wicketkeeper", 75, 5, 89, 7, "R", "Does not bowl"],
      ["c06", "Tariq Lodhi", "All-rounder", 70, 79, 75, 8, "L", "Slow left arm orthodox"],
      ["c07", "Rory Calloway", "All-rounder", 66, 75, 78, 6, "R", "Right arm medium fast"],
      ["c08", "Sunil Achrekar", "Bowler", 25, 86, 67, 7, "R", "Right arm leg break"],
      ["c09", "Mateo Arranz", "Bowler", 23, 87, 69, 8, "R", "Right arm fast"],
      ["c10", "Bilal Jatoi", "Bowler", 20, 83, 66, 6, "L", "Left arm fast"],
      ["c11", "Quentin Harlow", "Bowler", 16, 80, 63, 7, "R", "Right arm off break"],
    ],
    2,
  ),
];

export const OPPONENT_INFO: Record<string, { difficulty: "Steady" | "Strong" | "Elite"; blurb: string }> = {
  harbour: { difficulty: "Steady", blurb: "Workmanlike side with a deep spin option and a middle order that bats to the end." },
  deccan: { difficulty: "Strong", blurb: "Classy top three and a varied attack that leans on a quick and a left arm spinner." },
  coastal: { difficulty: "Elite", blurb: "Big hitting openers and the sharpest new ball pair in the competition." },
};
