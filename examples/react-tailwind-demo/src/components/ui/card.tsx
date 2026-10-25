import type { ReactNode } from "react";

export interface CardProps {
  title: string;
  description?: string;
  children: ReactNode;
}

export function Card({ title, description, children }: CardProps) {
  return (
    <section className="rounded-md border border-border bg-surface p-lg" aria-labelledby={`${title}-heading`}>
      <h2 id={`${title}-heading`} className="text-lg font-semibold text-text">
        {title}
      </h2>
      {description ? <p className="mt-xs text-sm text-text-muted">{description}</p> : null}
      <div className="mt-md flex flex-col gap-md">{children}</div>
    </section>
  );
}
