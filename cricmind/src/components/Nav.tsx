import { useEffect, useState } from "react";
import { cx } from "./ui";

export type Route = "home" | "squad" | "coach" | "match" | "insights" | "notfound";

export const NAV_ITEMS: { route: Exclude<Route, "notfound">; label: string; href: string }[] = [
  { route: "home", label: "Home", href: "#/" },
  { route: "squad", label: "Squad Builder", href: "#/squad" },
  { route: "coach", label: "Strategy Coach", href: "#/coach" },
  { route: "match", label: "Quick Match", href: "#/match" },
  { route: "insights", label: "Insights", href: "#/insights" },
];

export function Logo() {
  return (
    <a href="#/" className="flex items-center gap-2 rounded-lg" aria-label="CricMind AI home">
      <svg aria-hidden viewBox="0 0 32 32" className="size-8">
        <rect width="32" height="32" rx="8" fill="#101828" />
        <circle cx="16" cy="16" r="8.5" fill="none" stroke="#34D399" strokeWidth="2.5" />
        <path d="M10.5 12.5c3.5 2 7.5 2 11 0M10.5 19.5c3.5-2 7.5-2 11 0" fill="none" stroke="#C9A85C" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <span className="title-3 text-fg">
        CricMind <span className="text-pitch">AI</span>
      </span>
    </a>
  );
}

export function Nav({ route, squadCount }: { route: Route; squadCount: number }) {
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [route]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <div className="sticky top-0 z-40 px-4 pt-4">
        <nav
          aria-label="Main"
          className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-line/80 bg-ink-900/75 py-2 pl-3 pr-2 backdrop-blur-xl"
        >
          <Logo />
          <ul className="hidden items-center gap-1 lg:flex">
            {NAV_ITEMS.slice(1).map((item) => {
              const current = route === item.route;
              return (
                <li key={item.route}>
                  <a
                    href={item.href}
                    aria-current={current ? "page" : undefined}
                    className={cx(
                      "title-4 flex items-center gap-2 rounded-lg px-3 py-2 transition duration-300 ease-brand",
                      current ? "bg-ink-800 text-fg" : "text-muted hover:bg-ink-850 hover:text-fg",
                    )}
                  >
                    {item.label}
                    {item.route === "squad" && (
                      <span className={cx("caption-3 tabular-nums rounded-md px-1.5", squadCount === 11 ? "bg-pitch-deep text-pitch" : "bg-ink-750 text-muted")}>
                        {squadCount}/11
                      </span>
                    )}
                  </a>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="grid size-11 place-items-center rounded-xl text-fg transition duration-300 ease-brand hover:bg-ink-800 lg:hidden"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden className="relative block h-3 w-5">
              <span className={cx("absolute left-0 top-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-brand", open && "translate-y-[5px] rotate-45")} />
              <span className={cx("absolute bottom-0 left-0 h-0.5 w-5 rounded-full bg-current transition-transform duration-500 ease-brand", open && "-translate-y-[5px] -rotate-45")} />
            </span>
          </button>
        </nav>
      </div>

      <div
        id="mobile-menu"
        className={cx(
          "fixed inset-0 z-30 bg-ink-950/95 px-4 pt-24 backdrop-blur-2xl transition-opacity duration-500 ease-brand lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        aria-hidden={!open}
      >
        <ul className="mx-auto flex max-w-6xl flex-col gap-1">
          {NAV_ITEMS.map((item, i) => {
            const current = route === item.route;
            return (
              <li
                key={item.route}
                className={cx("transition duration-500 ease-brand", open ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0")}
                style={{ transitionDelay: open ? `${Math.min(i * 60, 400)}ms` : "0ms" }}
              >
                <a
                  href={item.href}
                  tabIndex={open ? 0 : -1}
                  aria-current={current ? "page" : undefined}
                  className={cx("heading-5 flex items-center justify-between rounded-xl px-4 py-3", current ? "bg-ink-800 text-pitch" : "text-fg hover:bg-ink-850")}
                >
                  {item.label}
                  {item.route === "squad" && <span className="caption-3 tabular-nums text-muted">{squadCount}/11</span>}
                </a>
              </li>
            );
          })}
        </ul>
      </div>
    </>
  );
}
