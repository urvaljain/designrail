import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { BattingStrategy, Match, MatchSettings, Pitch, SavedLineup, Squad } from "./types";
import { OPPONENTS } from "./data/players";
import { emptySquad, sameSquad, squadToTeam, validateSquad } from "./lib/squad";
import { newSeed, simulateMatch } from "./lib/simulator";
import * as storage from "./lib/storage";
import { Nav, Logo, type Route } from "./components/Nav";
import { Home } from "./components/Home";
import { SquadBuilder } from "./components/SquadBuilder";
import { StrategyCoach } from "./components/StrategyCoach";
import { MatchSimulator, type LiveMatch } from "./components/MatchSimulator";
import { MatchInsights } from "./components/MatchInsights";
import { EmptyState, LinkButton, Toast, type ToastMessage } from "./components/ui";

const ROUTES: Record<string, Route> = {
  "": "home",
  squad: "squad",
  coach: "coach",
  match: "match",
  insights: "insights",
};

function parseHash(): { route: Route; params: URLSearchParams } {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [path = "", query = ""] = raw.split("?");
  return { route: ROUTES[path] ?? "notfound", params: new URLSearchParams(query) };
}

const PITCHES: Pitch[] = ["batting", "balanced", "spin", "pace"];
const STRATEGIES: BattingStrategy[] = ["defensive", "balanced", "aggressive"];

function restoreLastMatch(): Match | null {
  const stored = storage.loadLastMatch();
  if (!stored) return null;
  const opp = OPPONENTS.find((o) => o.id === stored.settings.opponentId);
  if (!opp || stored.lineup.battingOrder.length !== 11) return null;
  // Deterministic simulator: replaying the stored settings rebuilds the same match.
  return simulateMatch(squadToTeam(stored.lineup), opp, stored.settings);
}

export default function App() {
  const [{ route, params }, setLocation] = useState(parseHash);
  const [squad, setSquadState] = useState<Squad>(() => storage.loadDraft() ?? storage.loadLineup() ?? emptySquad());
  const [lineup, setLineup] = useState<SavedLineup | null>(() => {
    const l = storage.loadLineup();
    return l && validateSquad(l).ready ? l : null;
  });
  const [pitch, setPitch] = useState<Pitch>("balanced");
  const [settings, setSettings] = useState<MatchSettings>({ pitch: "balanced", strategy: "balanced", opponentId: "deccan", seed: newSeed() });
  const [live, setLive] = useState<LiveMatch | null>(null);
  const [lastMatch, setLastMatch] = useState<Match | null>(restoreLastMatch);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const mainRef = useRef<HTMLElement>(null);

  const notify = useCallback((text: string, tone?: ToastMessage["tone"]) => setToast({ id: Date.now(), text, tone }), []);
  const clearToast = useCallback(() => setToast(null), []);

  // Hash routing with focus management for keyboard and screen reader users.
  useEffect(() => {
    const onHash = () => {
      setLocation(parseHash());
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => mainRef.current?.focus({ preventScroll: true }));
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Coach "Simulate with this plan" hands its pitch and strategy over in the URL.
  useEffect(() => {
    if (route !== "match") return;
    const p = params.get("pitch") as Pitch | null;
    const s = params.get("strategy") as BattingStrategy | null;
    if ((p && PITCHES.includes(p)) || (s && STRATEGIES.includes(s))) {
      setSettings((prev) => ({ ...prev, pitch: p && PITCHES.includes(p) ? p : prev.pitch, strategy: s && STRATEGIES.includes(s) ? s : prev.strategy }));
      if (live && live.revealed >= live.match.innings[0].balls.length + live.match.innings[1].balls.length) setLive(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, params]);

  useEffect(() => {
    const titles: Record<Route, string> = {
      home: "CricMind AI · Think cricket. Play smarter.",
      squad: "Squad Builder · CricMind AI",
      coach: "Strategy Coach · CricMind AI",
      match: "Quick Match · CricMind AI",
      insights: "Match Insights · CricMind AI",
      notfound: "Page not found · CricMind AI",
    };
    document.title = titles[route];
  }, [route]);

  const setSquad = useCallback((s: Squad) => {
    setSquadState(s);
    storage.saveDraft(s);
  }, []);

  const saveLineup = () => {
    const l: SavedLineup = { ...squad, savedAt: new Date().toISOString() };
    if (storage.saveLineup(l)) notify("Lineup saved. Strategy Coach and Quick Match are ready.");
    else notify("Could not save. Browser storage is full or blocked.", "wicket");
    setLineup(l);
    setLive(null);
  };

  const resetSquad = () => {
    const e = emptySquad();
    setSquad(e);
    setLineup(null);
    storage.saveLineup(null);
    setLive(null);
    notify("Squad cleared.");
  };

  /** Coach actions update both the draft and the saved lineup, which stays valid. */
  const applyToLineup = (patch: Partial<Squad>, message: string) => {
    if (!lineup) return;
    const next: SavedLineup = { ...lineup, ...patch, savedAt: new Date().toISOString() };
    setLineup(next);
    storage.saveLineup(next);
    setSquad({ ...squad, ...patch, selectedIds: next.selectedIds });
    notify(message);
  };

  const onComplete = useCallback(
    (m: Match) => {
      if (!lineup) return;
      setLastMatch(m);
      storage.saveLastMatch({ settings: m.settings, lineup: { selectedIds: m.home.players.map((p) => p.id), battingOrder: m.home.players.map((p) => p.id), captainId: m.home.captainId, keeperId: lineup.keeperId } });
    },
    [lineup],
  );

  const startNewMatch = () => {
    setLive(null);
    setSettings((s) => ({ ...s, seed: newSeed() }));
    window.location.hash = "#/match";
  };

  const unsaved = useMemo(() => !!lineup && !sameSquad(lineup, squad), [lineup, squad]);

  return (
    <div className="min-h-dvh">
      <a href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }} className="button-sm fixed left-4 top-4 z-50 -translate-y-24 rounded-lg bg-pitch px-3 py-2 text-pitch-ink focus:translate-y-0">
        Skip to content
      </a>
      <Nav route={route} squadCount={squad.selectedIds.length} />
      <main id="main" ref={mainRef} tabIndex={-1} className="mx-auto max-w-6xl px-4 pb-24 pt-8 outline-none md:pt-12">
        <div key={route} className="animate-rise">
          {route === "home" && <Home hasLineup={!!lineup} />}
          {route === "squad" && <SquadBuilder squad={squad} setSquad={setSquad} lineup={lineup} onSave={saveLineup} onReset={resetSquad} />}
          {route === "coach" && (
            <StrategyCoach
              lineup={lineup}
              unsaved={unsaved}
              pitch={pitch}
              setPitch={setPitch}
              onApplyOrder={(battingOrder) => applyToLineup({ battingOrder }, "Batting order updated and saved.")}
              onApplyCaptain={(captainId) => applyToLineup({ captainId }, "Captain updated and saved.")}
            />
          )}
          {route === "match" && <MatchSimulator lineup={lineup} live={live} setLive={setLive} settings={settings} setSettings={setSettings} onComplete={onComplete} />}
          {route === "insights" && <MatchInsights match={lastMatch} onNewMatch={startNewMatch} />}
          {route === "notfound" && (
            <EmptyState
              icon={ArrowLeft}
              title="That page is out of bounds"
              description="The link you followed does not lead anywhere in CricMind AI. Head back to the home screen or your squad."
              action={
                <>
                  <LinkButton href="#/">Back to home</LinkButton>
                  <LinkButton href="#/squad" variant="secondary">
                    Open Squad Builder
                  </LinkButton>
                </>
              }
            />
          )}
        </div>
      </main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 md:flex-row md:items-center md:justify-between">
          <Logo />
          <p className="caption-5 max-w-md text-faint">
            All players and teams are fictional. Your squad and last match are stored only in this browser’s local storage, and nothing is sent to a server.
          </p>
        </div>
      </footer>
      <Toast toast={toast} onDone={clearToast} />
    </div>
  );
}
