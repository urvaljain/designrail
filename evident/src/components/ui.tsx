import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/cn";

/* Primitives in the shadcn/ui style: plain components, variants as class maps, tokens from globals.css. */

const buttonBase =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
const buttonVariants = {
  primary: "bg-accent text-accent-fg hover:bg-accent-hover",
  secondary: "border border-line-strong bg-surface text-ink hover:bg-sunken",
  ghost: "text-accent-ink underline-offset-4 hover:underline",
  danger: "border border-bad bg-surface text-bad hover:bg-bad-soft",
} as const;
type Variant = keyof typeof buttonVariants;

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, external, ...props }: ComponentProps<typeof Link> & { variant?: Variant; external?: boolean }) {
  if (external) {
    const { href, children, ...rest } = props;
    return (
      <a href={String(href)} target="_blank" rel="noopener noreferrer" className={cn(buttonBase, buttonVariants[variant], className)} {...(rest as ComponentProps<"a">)}>
        {children}
        <span className="sr-only"> (opens in a new tab)</span>
      </a>
    );
  }
  return <Link className={cn(buttonBase, buttonVariants[variant], className)} {...props} />;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-card border border-line bg-surface p-5", className)} {...props} />;
}

export function CardTitle({ className, as: Tag = "h2", ...props }: ComponentProps<"h2"> & { as?: "h2" | "h3" }) {
  return <Tag className={cn("text-lg font-semibold leading-snug", className)} {...props} />;
}

const tones = {
  neutral: "bg-sunken text-ink border-line",
  accent: "bg-accent-soft text-accent-ink border-transparent",
  good: "bg-good-soft text-good border-transparent",
  warn: "bg-warn-soft text-warn border-transparent",
  bad: "bg-bad-soft text-bad border-transparent",
  info: "bg-info-soft text-info border-transparent",
} as const;
export type Tone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: ComponentProps<"span"> & { tone?: Tone }) {
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone], className)} {...props} />;
}

export function Notice({ tone = "info", title, children, className, role }: { tone?: Tone; title?: string; children: ReactNode; className?: string; role?: "alert" | "status" }) {
  return (
    <div role={role} className={cn("rounded-card border px-4 py-3 text-sm", tones[tone], className)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

const control = "block w-full rounded-control border border-line-strong bg-surface px-3 py-2 text-base text-ink placeholder:text-muted min-h-11";

export function Field({ label, hint, htmlFor, children, className }: { label: string; hint?: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-sm font-semibold">
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cn(control, "min-h-32", className)} {...props} />;
}
export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
}

export function PageHeader({ title, lead, actions }: { title: string; lead?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {lead ? <p className="mt-2 text-muted">{lead}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-card border border-dashed border-line-strong bg-surface px-6 py-10 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <div className="mx-auto mt-2 max-w-md text-muted">{children}</div>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** The signature element: a verbatim quote with where it came from. Marker yellow is used nowhere else. */
export function EvidenceQuote({ quote, source, className }: { quote: string; source: string; className?: string }) {
  return (
    <figure className={cn("text-sm", className)}>
      <blockquote>
        <mark>{quote}</mark>
      </blockquote>
      <figcaption className="mt-1 font-mono text-xs text-muted">{source}</figcaption>
    </figure>
  );
}

export function Meter({ value, label, tone = "accent" }: { value: number; label: string; tone?: "accent" | "good" | "warn" | "bad" }) {
  const bar = { accent: "bg-accent", good: "bg-good", warn: "bg-warn", bad: "bg-bad" }[tone];
  return (
    <div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} aria-label={label}>
        <div className={cn("h-full rounded-full", bar)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

export function Stat({ label, value, note }: { label: string; value: ReactNode; note?: string }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <p className="text-sm text-muted">{label}</p>
      <p className="display mt-1 text-3xl font-semibold tabular-nums">{value}</p>
      {note ? <p className="mt-1 text-xs text-muted">{note}</p> : null}
    </div>
  );
}

export function DemoBadge() {
  return (
    <Badge tone="info" title="This listing is synthetic demo data. The company and role are fictional.">
      Demo data
    </Badge>
  );
}

export function FlashMessages({ error, notice }: { error?: string; notice?: string }) {
  if (!error && !notice) return null;
  return (
    <div className="mb-5 space-y-2">
      {error ? (
        <Notice tone="bad" role="alert">
          {error}
        </Notice>
      ) : null}
      {notice ? (
        <Notice tone="good" role="status">
          {notice}
        </Notice>
      ) : null}
    </div>
  );
}
