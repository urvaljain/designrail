# CricMind AI

Think cricket. Play smarter.

A lightweight cricket strategy web app: build an XI from 24 fictional players, get a tactical read from a rules based Strategy Coach, and play a seeded five over match with a full scorecard and match insights.

React + Vite + TypeScript, Tailwind CSS, Lucide icons and browser localStorage. No backend.

```bash
npm install
npm run dev      # local dev server
npm test         # simulator and strategy engine tests
npm run build    # typecheck and production build
```

## Layout

- `src/data/players.ts`: 24 players and 3 opponent teams
- `src/lib/simulator.ts`: seedable PRNG and five over match engine (pure, deterministic)
- `src/lib/strategy.ts`: Strategy Coach rules engine, with an `ExplanationLayer` hook for a future serverless LLM explanation endpoint
- `src/lib/insights.ts`: post match observations derived from simulated deliveries
- `src/lib/squad.ts`: selection rules and validation
- `src/lib/storage.ts`: localStorage persistence (draft, saved lineup, last match as seed + settings)
- `src/components/`: screens and UI primitives
