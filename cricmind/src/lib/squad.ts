import { PLAYER_BY_ID } from "../data/players";
import type { Player, Squad, Team } from "../types";

export const XI_SIZE = 11;

export const emptySquad = (): Squad => ({ selectedIds: [], battingOrder: [], captainId: null, keeperId: null });

export const squadPlayers = (squad: Squad): Player[] =>
  squad.battingOrder.map((id) => PLAYER_BY_ID[id]).filter((p): p is Player => Boolean(p));

export const overall = (p: Player) => Math.round(p.batting * 0.4 + p.bowling * 0.4 + p.fielding * 0.2);

/** The rating that matters most for the player's role, used for the headline number on cards. */
export function primaryRating(p: Player): number {
  switch (p.role) {
    case "Batter":
      return Math.round(p.batting * 0.8 + p.fielding * 0.2);
    case "Bowler":
      return Math.round(p.bowling * 0.8 + p.fielding * 0.2);
    case "Wicketkeeper":
      return Math.round(p.batting * 0.6 + p.fielding * 0.4);
    case "All-rounder":
      return Math.round(p.batting * 0.45 + p.bowling * 0.45 + p.fielding * 0.1);
  }
}

export const formLabel = (form: number) =>
  form >= 9 ? "In peak form" : form >= 7 ? "Good form" : form >= 5 ? "Steady" : "Out of form";

export const isBowlingOption = (p: Player) => p.bowling >= 60;
export const isFrontlineBatter = (p: Player) => p.batting >= 70;

export interface Validation {
  errors: string[];
  warnings: string[];
  ready: boolean;
}

export function validateSquad(squad: Squad): Validation {
  const players = squadPlayers(squad);
  const errors: string[] = [];
  const warnings: string[] = [];
  const n = players.length;

  if (n < XI_SIZE) errors.push(`Pick ${XI_SIZE - n} more player${XI_SIZE - n === 1 ? "" : "s"} to complete your XI.`);
  if (n > XI_SIZE) errors.push(`Remove ${n - XI_SIZE} player${n - XI_SIZE === 1 ? "" : "s"}. An XI has exactly 11.`);
  if (!squad.captainId || !squad.selectedIds.includes(squad.captainId)) errors.push("Choose a captain from your selected players.");
  if (!squad.keeperId || !squad.selectedIds.includes(squad.keeperId)) errors.push("Choose a wicketkeeper from your selected players.");

  if (n > 0) {
    const bowlers = players.filter(isBowlingOption);
    const batters = players.filter(isFrontlineBatter);
    const spin = bowlers.filter((p) => p.bowlingKind === "spin").length;
    const pace = bowlers.filter((p) => p.bowlingKind === "pace").length;
    const keeper = squad.keeperId ? PLAYER_BY_ID[squad.keeperId] : undefined;

    if (n === XI_SIZE) {
      if (bowlers.length < 5)
        warnings.push(`Only ${bowlers.length} genuine bowling option${bowlers.length === 1 ? "" : "s"}. Five overs need five bowlers, so part timers will bowl.`);
      if (batters.length < 5) warnings.push(`Only ${batters.length} batters rated 70 or above. The middle order may collapse.`);
      if (spin === 0) warnings.push("No specialist spinner. You will struggle on a spin friendly pitch.");
      if (pace === 0) warnings.push("No pace bowler. You will struggle on a pace friendly pitch.");
    }
    if (keeper && keeper.role !== "Wicketkeeper")
      warnings.push(`${keeper.name} is not a specialist keeper. Expect more missed chances behind the stumps.`);
  }

  return { errors, warnings, ready: errors.length === 0 };
}

export function toggleSelection(squad: Squad, id: string): Squad {
  if (squad.selectedIds.includes(id)) {
    return {
      selectedIds: squad.selectedIds.filter((x) => x !== id),
      battingOrder: squad.battingOrder.filter((x) => x !== id),
      captainId: squad.captainId === id ? null : squad.captainId,
      keeperId: squad.keeperId === id ? null : squad.keeperId,
    };
  }
  if (squad.selectedIds.length >= XI_SIZE) return squad;
  const p = PLAYER_BY_ID[id];
  const keeperId = squad.keeperId ?? (p?.role === "Wicketkeeper" ? id : null);
  return { ...squad, selectedIds: [...squad.selectedIds, id], battingOrder: [...squad.battingOrder, id], keeperId };
}

export function moveInOrder(squad: Squad, id: string, delta: -1 | 1): Squad {
  const order = [...squad.battingOrder];
  const i = order.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= order.length) return squad;
  [order[i], order[j]] = [order[j]!, order[i]!];
  return { ...squad, battingOrder: order };
}

export const USER_TEAM_ID = "user";

export function squadToTeam(squad: Squad): Team {
  return { id: USER_TEAM_ID, name: "Your XI", short: "YOU", players: squadPlayers(squad), captainId: squad.captainId };
}

export const sameSquad = (a: Squad, b: Squad) =>
  a.captainId === b.captainId &&
  a.keeperId === b.keeperId &&
  a.battingOrder.join() === b.battingOrder.join();
