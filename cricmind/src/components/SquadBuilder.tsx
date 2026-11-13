import { useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Crown, Hand, RotateCcw, Save, Search, SearchX, Sparkles, X } from "lucide-react";
import { PLAYERS, PLAYER_BY_ID } from "../data/players";
import type { Role, SavedLineup, Squad } from "../types";
import { XI_SIZE, moveInOrder, primaryRating, sameSquad, toggleSelection, validateSquad } from "../lib/squad";
import { PlayerCard, initials } from "./PlayerCard";
import { Badge, Button, Card, LinkButton, SectionHeader, cx } from "./ui";

type RoleFilter = "All" | Role;
type SortKey = "rating" | "batting" | "bowling" | "form";
const ROLE_FILTERS: RoleFilter[] = ["All", "Batter", "Wicketkeeper", "All-rounder", "Bowler"];

export function SquadBuilder({
  squad,
  setSquad,
  lineup,
  onSave,
  onReset,
}: {
  squad: Squad;
  setSquad: (s: Squad) => void;
  lineup: SavedLineup | null;
  onSave: () => void;
  onReset: () => void;
}) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<RoleFilter>("All");
  const [sort, setSort] = useState<SortKey>("rating");
  const [confirmReset, setConfirmReset] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

  const validation = validateSquad(squad);
  const full = squad.selectedIds.length >= XI_SIZE;
  const unsaved = !lineup || !sameSquad(lineup, squad);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = PLAYERS.filter(
      (p) =>
        (role === "All" || p.role === role) &&
        (!q || p.name.toLowerCase().includes(q) || p.bowlingStyle.toLowerCase().includes(q) || p.battingStyle.toLowerCase().includes(q)),
    );
    const key = { rating: primaryRating, batting: (p: (typeof PLAYERS)[0]) => p.batting, bowling: (p: (typeof PLAYERS)[0]) => p.bowling, form: (p: (typeof PLAYERS)[0]) => p.form }[sort];
    return [...list].sort((a, b) => key(b) - key(a));
  }, [query, role, sort]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const id of squad.selectedIds) {
      const r = PLAYER_BY_ID[id]!.role;
      c[r] = (c[r] ?? 0) + 1;
    }
    return c;
  }, [squad.selectedIds]);

  const handleSave = () => {
    if (!validation.ready) {
      setShowErrors(true);
      return;
    }
    setShowErrors(false);
    onSave();
  };

  return (
    <div className="flex flex-col gap-8">
      <SectionHeader
        eyebrow="Squad Builder"
        title="Pick your XI"
        description="Choose 11 from 24 players, name a captain and a wicketkeeper, then set the batting order. Your picks save to this browser as you go."
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem] lg:items-start">
        {/* Player pool */}
        <section aria-label="Player pool" className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-2xl border border-line bg-ink-900 p-3 md:flex-row md:items-center">
            <label className="relative flex-1">
              <span className="sr-only">Search players</span>
              <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name or style, e.g. leg break"
                className="body-6 min-h-11 w-full rounded-xl border border-line bg-ink-850 py-2 pl-10 pr-3 text-fg placeholder:text-faint transition duration-300 ease-brand hover:border-line-strong focus:border-pitch/60 focus:outline-none"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="caption-4 text-muted">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="body-6 min-h-11 rounded-xl border border-line bg-ink-850 px-3 py-2 text-fg hover:border-line-strong focus:border-pitch/60 focus:outline-none"
              >
                <option value="rating">Role rating</option>
                <option value="batting">Batting</option>
                <option value="bowling">Bowling</option>
                <option value="form">Form</option>
              </select>
            </label>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by role">
            {ROLE_FILTERS.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={role === r}
                onClick={() => setRole(r)}
                className={cx(
                  "button-sm min-h-11 shrink-0 rounded-xl border px-3 py-2 transition duration-300 ease-brand active:scale-[0.98]",
                  role === r ? "border-pitch/50 bg-pitch-deep text-pitch" : "border-line bg-ink-900 text-muted hover:border-line-strong hover:text-fg",
                )}
              >
                {r === "All" ? "All players" : `${r}s`}
                {r !== "All" && counts[r] ? <span className="ml-2 tabular-nums text-fg">{counts[r]}</span> : null}
              </button>
            ))}
          </div>

          <p className="caption-5 text-muted" aria-live="polite">
            Showing {filtered.length} of {PLAYERS.length} players
          </p>

          {filtered.length === 0 ? (
            <Card className="flex flex-col items-center px-6 py-12 text-center">
              <SearchX aria-hidden className="size-6 text-faint" />
              <p className="title-3 mt-3">No players match “{query}”</p>
              <p className="body-6 mt-1 text-muted">Try a surname, a role, or a style such as “off break”.</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setQuery("");
                  setRole("All");
                }}
              >
                Clear filters
              </Button>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((p) => (
                <PlayerCard
                  key={p.id}
                  player={p}
                  selected={squad.selectedIds.includes(p.id)}
                  isCaptain={squad.captainId === p.id}
                  isKeeper={squad.keeperId === p.id}
                  disabled={full}
                  onToggle={() => setSquad(toggleSelection(squad, p.id))}
                />
              ))}
            </div>
          )}
        </section>

        {/* Lineup panel */}
        <aside aria-label="Your XI" className="flex flex-col gap-3 lg:sticky lg:top-24">
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="heading-6">Your XI</h2>
                <p className="caption-5 text-muted">
                  {lineup ? (unsaved ? "Unsaved changes" : `Saved ${new Date(lineup.savedAt).toLocaleString()}`) : "Not saved yet"}
                </p>
              </div>
              <span className={cx("heading-5 tabular-nums", squad.selectedIds.length === XI_SIZE ? "text-pitch" : "text-fg")}>
                {squad.selectedIds.length}
                <span className="text-faint">/11</span>
              </span>
            </div>
            <div className="mt-3 flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
              {Array.from({ length: XI_SIZE }, (_, i) => (
                <span key={i} className={cx("flex-1 transition-colors duration-300 ease-brand", i < squad.selectedIds.length ? "bg-pitch" : "bg-ink-750")} />
              ))}
            </div>

            {squad.battingOrder.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-line px-4 py-8 text-center">
                <Sparkles aria-hidden className="mx-auto size-5 text-gold" />
                <p className="title-4 mt-2">Start with your openers</p>
                <p className="caption-5 mt-1 text-muted">Add players from the pool. They appear here in batting order, and the first keeper you pick gets the gloves.</p>
              </div>
            ) : (
              <ol className="mt-4 flex flex-col gap-1" aria-label="Batting order">
                {squad.battingOrder.map((id, i) => {
                  const p = PLAYER_BY_ID[id]!;
                  const isC = squad.captainId === id;
                  const isK = squad.keeperId === id;
                  return (
                    <li key={id} className="flex items-center gap-2 rounded-xl bg-ink-850 py-1 pl-2 pr-1 animate-pop">
                      <span className="caption-3 w-4 text-right tabular-nums text-faint">{i + 1}</span>
                      <span aria-hidden className="caption-3 grid size-7 shrink-0 place-items-center rounded-lg bg-ink-750 text-muted">
                        {initials(p.name)}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="body-5 block truncate">{p.name}</span>
                        <span className="caption-5 block text-faint">{p.role}</span>
                      </span>
                      <button
                        type="button"
                        aria-pressed={isC}
                        aria-label={isC ? `${p.name} is captain` : `Make ${p.name} captain`}
                        onClick={() => setSquad({ ...squad, captainId: id })}
                        className={cx("grid size-8 place-items-center rounded-lg transition duration-300 ease-brand", isC ? "bg-gold-deep text-gold" : "text-faint hover:bg-ink-750 hover:text-gold")}
                      >
                        <Crown aria-hidden className="size-4" />
                      </button>
                      <button
                        type="button"
                        aria-pressed={isK}
                        aria-label={isK ? `${p.name} is wicketkeeper` : `Make ${p.name} wicketkeeper`}
                        onClick={() => setSquad({ ...squad, keeperId: id })}
                        className={cx("grid size-8 place-items-center rounded-lg transition duration-300 ease-brand", isK ? "bg-pitch-deep text-pitch" : "text-faint hover:bg-ink-750 hover:text-pitch")}
                      >
                        <Hand aria-hidden className="size-4" />
                      </button>
                      <div className="flex flex-col">
                        <button
                          type="button"
                          aria-label={`Move ${p.name} up the order`}
                          disabled={i === 0}
                          onClick={() => setSquad(moveInOrder(squad, id, -1))}
                          className="grid h-4 w-7 place-items-center rounded text-muted hover:text-fg disabled:opacity-30"
                        >
                          <ArrowUp aria-hidden className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Move ${p.name} down the order`}
                          disabled={i === squad.battingOrder.length - 1}
                          onClick={() => setSquad(moveInOrder(squad, id, 1))}
                          className="grid h-4 w-7 place-items-center rounded text-muted hover:text-fg disabled:opacity-30"
                        >
                          <ArrowDown aria-hidden className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove ${p.name}`}
                        onClick={() => setSquad(toggleSelection(squad, id))}
                        className="grid size-8 place-items-center rounded-lg text-faint transition duration-300 ease-brand hover:bg-wicket-deep hover:text-wicket"
                      >
                        <X aria-hidden className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
            <p className="caption-5 mt-3 flex flex-wrap items-center gap-2 text-faint">
              <Crown aria-hidden className="size-3.5 text-gold" /> captain
              <Hand aria-hidden className="size-3.5 text-pitch" /> keeper
              <ArrowUp aria-hidden className="size-3.5" /> reorder
            </p>
          </Card>

          {/* Validation */}
          {(validation.warnings.length > 0 || (showErrors && validation.errors.length > 0) || validation.ready) && (
            <Card className="flex flex-col gap-2 p-4" as="section">
              <h2 className="sr-only">Squad checks</h2>
              {validation.ready && validation.warnings.length === 0 && (
                <p className="body-5 flex items-start gap-2 text-pitch">
                  <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0" /> Balanced XI. Ready to save.
                </p>
              )}
              {showErrors &&
                validation.errors.map((e) => (
                  <p key={e} role="alert" className="body-6 flex items-start gap-2 text-wicket">
                    <X aria-hidden className="mt-0.5 size-4 shrink-0" /> {e}
                  </p>
                ))}
              {validation.warnings.map((w) => (
                <p key={w} className="body-6 flex items-start gap-2 text-gold">
                  <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" /> {w}
                </p>
              ))}
            </Card>
          )}
          {!validation.ready && !showErrors && squad.selectedIds.length > 0 && (
            <p className="caption-5 px-1 text-muted">{validation.errors[0]}</p>
          )}

          <div className="grid grid-cols-2 gap-2">
            <Button icon={Save} onClick={handleSave} disabled={!unsaved && validation.ready}>
              {!unsaved && validation.ready ? "Saved" : "Save lineup"}
            </Button>
            {confirmReset ? (
              <Button
                variant="danger"
                icon={RotateCcw}
                onClick={() => {
                  onReset();
                  setConfirmReset(false);
                  setShowErrors(false);
                }}
                onBlur={() => setConfirmReset(false)}
              >
                Confirm reset
              </Button>
            ) : (
              <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirmReset(true)} disabled={squad.selectedIds.length === 0 && !lineup}>
                Reset squad
              </Button>
            )}
          </div>
          {lineup && !unsaved && (
            <div className="grid grid-cols-2 gap-2 animate-rise">
              <LinkButton href="#/coach" variant="secondary" size="sm">
                Get strategy
              </LinkButton>
              <LinkButton href="#/match" variant="secondary" size="sm">
                Play a match
              </LinkButton>
            </div>
          )}
          {confirmReset && <p className="caption-5 px-1 text-wicket">This clears your picks and your saved lineup.</p>}
          {lineup && unsaved && (
            <Badge tone="gold" className="self-start">
              Coach and Quick Match use your last saved lineup
            </Badge>
          )}
        </aside>
      </div>
    </div>
  );
}
