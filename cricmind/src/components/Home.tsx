import { useEffect, useRef, useState } from "react";
import { ArrowRight, BrainCircuit, Crown, Play, Target, Users } from "lucide-react";
import { PLAYER_BY_ID } from "../data/players";
import { analyzeTeam } from "../lib/strategy";
import { PlayerCard, initials } from "./PlayerCard";
import { Badge, Card, LinkButton, cx } from "./ui";

const PREVIEW_IDS = ["p01", "p11", "p21"];
const PREVIEW_XI = ["p01", "p02", "p08", "p03", "p11", "p12", "p13", "p17", "p19", "p21", "p22"];

const STEPS = [
  { icon: Users, title: "Build your XI", body: "Pick 11 from 24 rated players. Name a captain and a keeper, then set the batting order. Your squad saves in this browser." },
  { icon: BrainCircuit, title: "Read the pitch", body: "The Strategy Coach scores your XI on four pitch types and suggests openers, a captain, your bowling plan and how hard to bat." },
  { icon: Play, title: "Play five overs", body: "Choose an opponent and a plan, then bowl it ball by ball. Ratings, form and a seeded roll decide every delivery." },
];

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Large tagline where each word lights up as it crosses a line in the viewport. */
function TaglineReveal() {
  const lines = [["Think", "cricket."], ["Play", "smarter."]];
  const words = lines.flat();
  const refs = useRef<(HTMLSpanElement | null)[]>([]);
  const [lit, setLit] = useState<boolean[]>(() => words.map(() => false));
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      setLit(words.map(() => true));
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const i = Number((e.target as HTMLElement).dataset.i);
          setLit((prev) => (prev[i] ? prev : prev.map((v, j) => (j === i ? true : v))));
          obs.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -35% 0px", threshold: 1 },
    );
    refs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);

  let k = 0;
  return (
    <section aria-label="Tagline" className="py-24">
      <p className="heading-2 mx-auto max-w-[680px] text-center md:heading-1">
        {lines.map((line, li) => (
          <span key={li} className="block">
            {line.map((w) => {
              const i = k++;
              return (
                <span
                  key={w}
                  ref={(el) => {
                    refs.current[i] = el;
                  }}
                  data-i={i}
                  className={cx("inline-block transition-colors duration-700 ease-brand", lit[i] ? (li === 1 && w === "smarter." ? "text-pitch" : "text-fg") : "text-fg/30")}
                  style={{ transitionDelay: `${(i % 2) * 120}ms` }}
                >
                  {w}&nbsp;
                </span>
              );
            })}
          </span>
        ))}
      </p>
    </section>
  );
}

// The preview callout is produced by the real Strategy Coach for this sample XI.
const PREVIEW_READ = analyzeTeam(PREVIEW_XI.map((id) => PLAYER_BY_ID[id]!), "spin", "p11");
const lastName = (n: string) => n.split(" ").slice(-1)[0];

function BuilderPreview() {
  const [a, b] = PREVIEW_READ.openingBowlers;
  return (
    <div className="relative" aria-label="Preview of the Squad Builder" role="img">
      <Card className="p-3">
        <div className="flex items-center justify-between px-1 pb-3">
          <span className="title-4">Squad Builder</span>
          <Badge tone="pitch">11/11 · Ready</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_14rem]">
          <div className="grid gap-2">
            {PREVIEW_IDS.slice(0, 2).map((id, i) => (
              <div key={id} className={cx(i === 1 && "hidden sm:block")}>
                <PlayerCard player={PLAYER_BY_ID[id]!} selected isCaptain={id === "p11"} />
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-ink-850 p-3">
            <p className="caption-3 uppercase tracking-widest text-faint">Batting order</p>
            <ol className="mt-2 flex flex-col gap-1">
              {PREVIEW_XI.map((id, i) => {
                const p = PLAYER_BY_ID[id]!;
                return (
                  <li key={id} className="flex items-center gap-2 rounded-lg px-1 py-0.5">
                    <span className="caption-5 w-4 text-right tabular-nums text-faint">{i + 1}</span>
                    <span className="caption-3 grid size-5 place-items-center rounded bg-ink-750 text-muted">{initials(p.name)}</span>
                    <span className="caption-4 truncate">{p.name}</span>
                    {id === "p11" && <Crown aria-hidden className="ml-auto size-3 text-gold" />}
                    {id === "p08" && <span className="caption-3 ml-auto text-pitch">WK</span>}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </Card>
      <div className="absolute -bottom-12 -left-4 hidden rounded-xl border border-line bg-ink-850 px-4 py-3 shadow-2xl shadow-black/60 md:block">
        <p className="caption-4 flex items-center gap-2 text-pitch">
          <Target aria-hidden className="size-3.5" /> Strategy Coach
        </p>
        <p className="body-5 mt-1">
          Open with {lastName(a!.player.name)} and {lastName(b!.player.name)} on a spin friendly pitch.
        </p>
      </div>
    </div>
  );
}

export function Home({ hasLineup }: { hasLineup: boolean }) {
  return (
    <div className="flex flex-col">
      <section className="grid items-center gap-12 pb-16 pt-8 lg:grid-cols-[1fr_1.05fr] lg:pt-16">
        <div className="animate-rise">
          <Badge tone="gold">Cricket strategy game</Badge>
          <h1 className="heading-3 hero-gradient-text mt-6 max-w-[680px] md:heading-1">
            Pick the XI.
            <br />
            Read the pitch.
            <br />
            Win the last over.
          </h1>
          <p className="body-3 mt-6 max-w-[680px] text-muted">
            CricMind AI lets you build a squad from 24 rated players, get a tactical plan from a rules based Strategy Coach,
            and play a five over match decided ball by ball.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <LinkButton href="#/squad" size="lg" iconRight={ArrowRight}>
              {hasLineup ? "Edit your XI" : "Build your XI"}
            </LinkButton>
            <LinkButton href="#/match" size="lg" variant="secondary" icon={Play}>
              Simulate match
            </LinkButton>
          </div>
          <p className="caption-5 mt-4 text-faint">No account needed. Your squad stays in this browser.</p>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <BuilderPreview />
        </div>
      </section>

      <section aria-labelledby="how" className="border-t border-line py-16">
        <h2 id="how" className="heading-4">
          How it works
        </h2>
        <ol className="mt-8 grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <Card className="h-full p-6">
                <div className="flex items-center justify-between">
                  <span className="grid size-10 place-items-center rounded-xl border border-line bg-ink-800 text-pitch">
                    <s.icon aria-hidden className="size-5" />
                  </span>
                  <span className="caption-3 tabular-nums text-faint">Step {i + 1}</span>
                </div>
                <h3 className="heading-6 mt-6">{s.title}</h3>
                <p className="body-6 mt-2 text-muted">{s.body}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <TaglineReveal />

      <section className="flex flex-col items-center gap-4 border-t border-line py-16 text-center">
        <h2 className="heading-4">Your first XI takes about two minutes</h2>
        <p className="body-3 max-w-xl text-muted">Pick eleven, save, and the Strategy Coach and Quick Match open up.</p>
        <LinkButton href="#/squad" size="lg" iconRight={ArrowRight}>
          {hasLineup ? "Edit your XI" : "Build your XI"}
        </LinkButton>
      </section>
    </div>
  );
}
