import { PLAYER_BY_ID } from "../data/players";
import type { MatchSettings, SavedLineup, Squad } from "../types";

const KEYS = {
  draft: "cricmind.squad.draft.v1",
  lineup: "cricmind.squad.saved.v1",
  lastMatch: "cricmind.match.last.v1",
} as const;

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/** Drops unknown ids so a stale or edited save can never break the app. */
function sanitize<T extends Squad>(s: T | null): T | null {
  if (!s || !Array.isArray(s.selectedIds) || !Array.isArray(s.battingOrder)) return null;
  const selectedIds = s.selectedIds.filter((id) => PLAYER_BY_ID[id]).slice(0, 11);
  const order = s.battingOrder.filter((id) => selectedIds.includes(id));
  for (const id of selectedIds) if (!order.includes(id)) order.push(id);
  return {
    ...s,
    selectedIds,
    battingOrder: order,
    captainId: s.captainId && selectedIds.includes(s.captainId) ? s.captainId : null,
    keeperId: s.keeperId && selectedIds.includes(s.keeperId) ? s.keeperId : null,
  };
}

export const loadDraft = () => sanitize(read<Squad>(KEYS.draft));
export const saveDraft = (s: Squad) => write(KEYS.draft, s);

export const loadLineup = () => sanitize(read<SavedLineup>(KEYS.lineup));
export const saveLineup = (s: SavedLineup | null) => write(KEYS.lineup, s);

/**
 * The last match is stored as its settings and the lineup it used. Because the
 * simulator is deterministic, replaying them rebuilds the exact same match.
 */
export interface StoredMatch {
  settings: MatchSettings;
  lineup: Squad;
}
export const loadLastMatch = () => read<StoredMatch>(KEYS.lastMatch);
export const saveLastMatch = (m: StoredMatch | null) => write(KEYS.lastMatch, m);
