import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");
export { cx };

type Variant = "primary" | "secondary" | "ghost" | "danger" | "gold";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-pitch text-pitch-ink hover:bg-[#4ee0aa] disabled:bg-ink-800 disabled:text-faint",
  secondary: "bg-ink-800 text-fg border border-line hover:bg-ink-750 hover:border-line-strong disabled:text-faint",
  ghost: "text-muted hover:text-fg hover:bg-ink-800 disabled:text-faint",
  danger: "bg-wicket-deep text-wicket border border-wicket/30 hover:border-wicket/60",
  gold: "bg-gold-deep text-gold border border-gold/30 hover:border-gold/60",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

export function Button({ variant = "primary", size = "md", icon: Icon, iconRight: IconRight, className, children, ...rest }: ButtonProps) {
  const sizes = {
    sm: "button-sm px-3 py-2 gap-2 rounded-lg",
    md: "button-md px-3 py-2 gap-2 rounded-xl min-h-11",
    lg: "button-md px-6 py-3 gap-2 rounded-xl min-h-12",
  }[size];
  return (
    <button
      type="button"
      className={cx(
        "inline-flex select-none items-center justify-center whitespace-nowrap transition duration-300 ease-brand active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100",
        sizes,
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />}
      {children}
      {IconRight && <IconRight aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />}
    </button>
  );
}

export function LinkButton({ href, variant = "primary", size = "md", icon: Icon, iconRight: IconRight, className, children }: {
  href: string;
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  const sizes = {
    sm: "button-sm px-3 py-2 gap-2 rounded-lg",
    md: "button-md px-3 py-2 gap-2 rounded-xl min-h-11",
    lg: "button-md px-6 py-3 gap-2 rounded-xl min-h-12",
  }[size];
  return (
    <a
      href={href}
      className={cx("inline-flex items-center justify-center whitespace-nowrap transition duration-300 ease-brand active:scale-[0.98]", sizes, VARIANTS[variant], className)}
    >
      {Icon && <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />}
      {children}
      {IconRight && <IconRight aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />}
    </a>
  );
}

export function Badge({ tone = "neutral", children, className }: { tone?: "neutral" | "pitch" | "gold" | "wicket"; children: ReactNode; className?: string }) {
  const tones = {
    neutral: "bg-ink-800 text-muted border-line",
    pitch: "bg-pitch-deep text-pitch border-pitch/25",
    gold: "bg-gold-deep text-gold border-gold/25",
    wicket: "bg-wicket-deep text-wicket border-wicket/25",
  };
  return <span className={cx("caption-3 inline-flex items-center gap-1 rounded-md border px-2 py-0.5", tones[tone], className)}>{children}</span>;
}

export function Card({ children, className, as: As = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "aside" }) {
  return <As className={cx("rounded-2xl border border-line bg-ink-900", className)}>{children}</As>;
}

export function RatingBar({ label, value, tone = "pitch" }: { label: string; value: number; tone?: "pitch" | "gold" | "muted" }) {
  const fill = { pitch: "bg-pitch", gold: "bg-gold", muted: "bg-faint" }[tone];
  return (
    <div className="grid grid-cols-[2.5rem_1fr_1.75rem] items-center gap-2">
      <span className="caption-4 text-faint">{label}</span>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-750" role="meter" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx("h-full w-full origin-left rounded-full transition-transform duration-500 ease-brand", fill)} style={{ transform: `scaleX(${value / 100})` }} />
      </div>
      <span className="caption-3 text-right tabular-nums text-fg">{value}</span>
    </div>
  );
}

export function SectionHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="caption-3 mb-2 uppercase tracking-widest text-pitch">{eyebrow}</p>}
        <h1 className="heading-4 md:heading-3">{title}</h1>
        {description && <p className="body-3 mt-2 text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description: string; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center px-6 py-16 text-center animate-rise">
      <div className="mb-4 grid size-12 place-items-center rounded-xl border border-line bg-ink-800 text-pitch">
        <Icon aria-hidden className="size-6" />
      </div>
      <h2 className="heading-6">{title}</h2>
      <p className="body-6 mt-2 max-w-md text-muted">{description}</p>
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </Card>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cx("animate-shimmer rounded-lg bg-ink-800", className)} />;
}

/** Accessible single choice group rendered as selectable tiles. */
export function ChoiceGroup<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = "grid-cols-2 md:grid-cols-4",
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string; icon?: LucideIcon }[];
  columns?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const onKey = (e: React.KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = (i + dir + options.length) % options.length;
    onChange(options[next]!.value);
    refs.current[next]?.focus();
  };
  return (
    <fieldset>
      <legend className="title-4 mb-2 text-muted">{label}</legend>
      <div role="radiogroup" aria-label={label} className={cx("grid gap-2", columns)}>
        {options.map((o, i) => {
          const active = o.value === value;
          const Icon = o.icon;
          return (
            <button
              key={o.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={active}
              tabIndex={active || (idx < 0 && i === 0) ? 0 : -1}
              onClick={() => onChange(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className={cx(
                "flex min-h-11 flex-col items-start gap-1 rounded-xl border px-3 py-3 text-left transition duration-300 ease-brand active:scale-[0.98]",
                active ? "border-pitch/60 bg-pitch-deep" : "border-line bg-ink-850 hover:border-line-strong hover:bg-ink-800",
              )}
            >
              <span className={cx("title-4 flex items-center gap-2", active ? "text-pitch" : "text-fg")}>
                {Icon && <Icon aria-hidden className="size-4" />}
                {o.label}
              </span>
              {o.hint && <span className="caption-5 text-muted">{o.hint}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export interface ToastMessage {
  id: number;
  text: string;
  tone?: "pitch" | "wicket";
}

export function Toast({ toast, onDone }: { toast: ToastMessage | null; onDone: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t1 = setTimeout(() => setVisible(false), 2600);
    const t2 = setTimeout(onDone, 3000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [toast, onDone]);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {toast && (
        <div
          className={cx(
            "body-5 rounded-xl border px-4 py-3 shadow-2xl shadow-black/50 transition duration-300 ease-brand",
            toast.tone === "wicket" ? "border-wicket/40 bg-wicket-deep text-wicket" : "border-pitch/30 bg-ink-850 text-fg",
            visible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0",
          )}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "pitch" | "gold" }) {
  return (
    <div className="rounded-xl border border-line bg-ink-850 px-4 py-3">
      <p className="caption-4 text-faint">{label}</p>
      <p className={cx("heading-6 mt-1 tabular-nums", tone === "pitch" && "text-pitch", tone === "gold" && "text-gold")}>{value}</p>
      {sub && <p className="caption-5 mt-1 text-muted">{sub}</p>}
    </div>
  );
}
