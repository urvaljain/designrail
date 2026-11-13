import { useState } from "react";
import type { Ball, Match, Player } from "../types";
import { economy, oversText, strikeRate } from "../lib/simulator";
import { cx } from "./ui";

export function teamName(match: Match, id: string) {
  return id === match.home.id ? match.home.name : match.away.name;
}

export function playerMap(match: Match) {
  return new Map<string, Player>([...match.home.players, ...match.away.players].map((p) => [p.id, p]));
}

export function BallChip({ ball, size = "md" }: { ball: Pick<Ball, "result" | "runs">; size?: "sm" | "md" }) {
  const label = ball.result === "dot" ? "•" : ball.result === "wd" ? "wd" : ball.result;
  const tone =
    ball.result === "W"
      ? "bg-wicket text-ink-950"
      : ball.result === "6"
        ? "bg-gold text-ink-950"
        : ball.result === "4"
          ? "bg-pitch text-pitch-ink"
          : ball.result === "wd"
            ? "border border-line text-muted"
            : ball.result === "dot"
              ? "bg-ink-750 text-faint"
              : "bg-ink-750 text-fg";
  return (
    <span
      className={cx("grid shrink-0 place-items-center rounded-full tabular-nums animate-pop", size === "md" ? "caption-3 size-8" : "caption-3 size-6", tone)}
      aria-label={ball.result === "W" ? "wicket" : ball.result === "wd" ? "wide" : `${ball.runs} run${ball.runs === 1 ? "" : "s"}`}
    >
      {label}
    </span>
  );
}

export function Scorecard({ match }: { match: Match }) {
  const [tab, setTab] = useState<0 | 1>(0);
  const players = playerMap(match);
  const inn = match.innings[tab];
  const name = (id: string) => players.get(id)?.name ?? id;
  const captainOf = (id: string) => (match.home.players.some((p) => p.id === id) ? match.home.captainId : match.away.captainId);

  return (
    <section aria-label="Scorecard" className="rounded-2xl border border-line bg-ink-900">
      <div role="tablist" aria-label="Innings" className="flex gap-1 border-b border-line p-2">
        {match.innings.map((i, idx) => (
          <button
            key={idx}
            role="tab"
            type="button"
            aria-selected={tab === idx}
            onClick={() => setTab(idx as 0 | 1)}
            className={cx(
              "title-4 min-h-11 flex-1 rounded-xl px-3 py-2 text-left transition duration-300 ease-brand md:flex-none",
              tab === idx ? "bg-ink-800 text-fg" : "text-muted hover:bg-ink-850 hover:text-fg",
            )}
          >
            {teamName(match, i.battingTeamId)}
            <span className="ml-2 tabular-nums text-muted">
              {i.runs}/{i.wickets}
            </span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto p-2 md:p-4" role="tabpanel">
        <table className="w-full min-w-[34rem] text-left">
          <caption className="sr-only">Batting, {teamName(match, inn.battingTeamId)}</caption>
          <thead>
            <tr className="caption-4 text-faint">
              <th scope="col" className="px-2 py-2 font-medium">Batter</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">R</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">B</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">4s</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">6s</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">SR</th>
            </tr>
          </thead>
          <tbody>
            {inn.batting.map((c) => {
              const dnb = c.howOut === "did not bat";
              return (
                <tr key={c.playerId} className={cx("border-t border-line/60", dnb && "text-faint")}>
                  <td className="px-2 py-2">
                    <span className="body-5 block">
                      {name(c.playerId)}
                      {captainOf(c.playerId) === c.playerId && <span className="caption-3 ml-1 text-gold">(c)</span>}
                    </span>
                    <span className={cx("caption-5", c.out ? "text-wicket" : "text-muted")}>{c.howOut}</span>
                  </td>
                  <td className="body-4 px-2 py-2 text-right tabular-nums">{dnb ? "" : c.runs}</td>
                  <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{dnb ? "" : c.balls}</td>
                  <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{dnb ? "" : c.fours}</td>
                  <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{dnb ? "" : c.sixes}</td>
                  <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{dnb ? "" : strikeRate(c.runs, c.balls).toFixed(1)}</td>
                </tr>
              );
            })}
            <tr className="border-t border-line">
              <td className="body-6 px-2 py-2 text-muted">Extras (wides)</td>
              <td className="body-4 px-2 py-2 text-right tabular-nums">{inn.extras}</td>
              <td colSpan={4} />
            </tr>
            <tr className="border-t border-line">
              <td className="body-4 px-2 py-2">Total</td>
              <td className="body-1 px-2 py-2 text-right tabular-nums" colSpan={5}>
                {inn.runs}/{inn.wickets} <span className="body-6 text-muted">({oversText(inn.legalBalls)} overs)</span>
              </td>
            </tr>
          </tbody>
        </table>

        <table className="mt-6 w-full min-w-[34rem] text-left">
          <caption className="sr-only">Bowling, {teamName(match, inn.bowlingTeamId)}</caption>
          <thead>
            <tr className="caption-4 text-faint">
              <th scope="col" className="px-2 py-2 font-medium">Bowler</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">O</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Dots</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">R</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">W</th>
              <th scope="col" className="px-2 py-2 text-right font-medium">Econ</th>
            </tr>
          </thead>
          <tbody>
            {inn.bowling.map((c) => (
              <tr key={c.playerId} className="border-t border-line/60">
                <td className="body-5 px-2 py-2">
                  {name(c.playerId)}
                  {c.wides > 0 && <span className="caption-5 ml-2 text-faint">{c.wides} wd</span>}
                </td>
                <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{oversText(c.balls)}</td>
                <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{c.dots}</td>
                <td className="body-6 px-2 py-2 text-right tabular-nums">{c.runs}</td>
                <td className={cx("body-4 px-2 py-2 text-right tabular-nums", c.wickets > 0 && "text-pitch")}>{c.wickets}</td>
                <td className="body-6 px-2 py-2 text-right tabular-nums text-muted">{economy(c.runs, c.balls).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
