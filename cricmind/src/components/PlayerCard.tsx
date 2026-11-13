import { Check, Crown, Hand, Plus, Shield, Target, Zap } from "lucide-react";
import type { Player, Role } from "../types";
import { formLabel, primaryRating } from "../lib/squad";
import { Badge, RatingBar, cx } from "./ui";

export const ROLE_ICON: Record<Role, typeof Zap> = {
  Batter: Zap,
  Bowler: Target,
  "All-rounder": Shield,
  Wicketkeeper: Hand,
};

export function initials(name: string) {
  return name
    .split(" ")
    .map((s) => s[0])
    .join("")
    .slice(0, 2);
}

function FormPips({ form }: { form: number }) {
  return (
    <div className="flex items-center gap-1" aria-label={`Form ${form} of 10, ${formLabel(form)}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const filled = form >= (i + 1) * 2 - 0.5;
        return <span key={i} className={cx("h-1.5 w-3 rounded-full", filled ? (form >= 8 ? "bg-gold" : "bg-pitch") : "bg-ink-750")} />;
      })}
    </div>
  );
}

export function PlayerCard({
  player,
  selected,
  isCaptain,
  isKeeper,
  disabled,
  onToggle,
}: {
  player: Player;
  selected: boolean;
  isCaptain?: boolean;
  isKeeper?: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  const Icon = ROLE_ICON[player.role];
  const rating = primaryRating(player);
  const elite = rating >= 84;
  return (
    <article
      className={cx(
        "group relative flex flex-col overflow-hidden rounded-2xl border p-4 transition duration-300 ease-brand",
        selected ? "border-pitch/50 bg-ink-850" : "border-line bg-ink-900 hover:-translate-y-0.5 hover:border-line-strong",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className={cx(
              "grid size-11 shrink-0 place-items-center rounded-xl border title-4",
              selected ? "border-pitch/40 bg-pitch-deep text-pitch" : "border-line bg-ink-800 text-muted",
            )}
          >
            {initials(player.name)}
          </div>
          <div className="min-w-0">
            <h3 className="title-3 truncate text-fg">{player.name}</h3>
            <p className="caption-4 flex items-center gap-1 text-muted">
              <Icon aria-hidden className="size-3.5" />
              {player.role}
            </p>
          </div>
        </div>
        <div className="flex flex-col items-end">
          <span className={cx("heading-5 tabular-nums", elite ? "text-gold" : "text-fg")}>{rating}</span>
          <span className="caption-5 text-faint">rating</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-1">
        {isCaptain && (
          <Badge tone="gold">
            <Crown aria-hidden className="size-3" /> Captain
          </Badge>
        )}
        {isKeeper && <Badge tone="pitch">Keeper</Badge>}
        <Badge>{player.battingStyle === "Left hand bat" ? "LHB" : "RHB"}</Badge>
        <Badge>{player.bowlingStyle === "Does not bowl" ? "No bowling" : player.bowlingKind === "spin" ? "Spin" : "Pace"}</Badge>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <RatingBar label="BAT" value={player.batting} tone={player.batting >= 80 ? "gold" : "pitch"} />
        <RatingBar label="BOWL" value={player.bowling} tone={player.bowling >= 80 ? "gold" : player.bowling < 40 ? "muted" : "pitch"} />
        <RatingBar label="FIELD" value={player.fielding} tone={player.fielding >= 85 ? "gold" : "pitch"} />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-line pt-3">
        <div className="flex flex-col gap-1">
          <FormPips form={player.form} />
          <span className="caption-5 text-muted">{formLabel(player.form)}</span>
        </div>
        <p className="caption-5 max-w-[50%] truncate text-right text-faint" title={player.bowlingStyle}>
          {player.bowlingStyle}
        </p>
      </div>

      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          disabled={disabled && !selected}
          aria-pressed={selected}
          aria-label={selected ? `Remove ${player.name} from XI` : `Add ${player.name} to XI`}
          className={cx(
            "button-sm mt-3 flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 transition duration-300 ease-brand active:scale-[0.98] disabled:cursor-not-allowed",
            selected
              ? "border-pitch/40 bg-pitch-deep text-pitch hover:border-wicket/40 hover:bg-wicket-deep hover:text-wicket"
              : "border-line bg-ink-800 text-fg hover:border-pitch/40 hover:text-pitch disabled:text-faint disabled:hover:border-line",
          )}
        >
          {selected ? (
            <>
              <Check aria-hidden className="size-4" /> <span className="group-hover:hidden">In your XI</span>
              <span className="hidden group-hover:inline">Remove</span>
            </>
          ) : (
            <>
              <Plus aria-hidden className="size-4" /> {disabled ? "XI is full" : "Add to XI"}
            </>
          )}
        </button>
      )}
    </article>
  );
}
