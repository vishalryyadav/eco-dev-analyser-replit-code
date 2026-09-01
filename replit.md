# EcoDev Code Analyzer

EcoDev helps software engineers compare code approaches through complexity, resource-efficiency, and practical green-computing tradeoffs.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ecodev/src/App.tsx` — frontend routes, local analyzer logic, demo monitor data, and localStorage persistence
- `artifacts/ecodev/src/index.css` — EcoDev theme tokens and responsive visual system
- `artifacts/ecodev/vite.config.ts` — Vite entry configured for the root preview path
- `attached_assets/Pasted-convert-this-code-into-app-and-give-app-download-link-l_1788241320083.txt` — original Python/PySide6 prototype and product brief

## Architecture decisions

- The first release is frontend-only so the analyzer is immediately usable without account setup or a server database.
- Analyzer history, theme preference, and monitoring settings persist locally in the browser.
- The local monitor surface is explicitly presented as readiness/demo data; real laptop-wide process inspection belongs in a future desktop companion.

## Product

- Overview of current efficiency posture, saved analyzer activity, and local monitor samples
- Code analyzer with JavaScript, TypeScript, and Python examples, complexity estimates, findings, alternatives, and tradeoffs
- Searchable saved history with per-analysis and bulk local export
- Learn page with research-backed methodology notes and a review loop for evaluating optimization decisions
- Settings for monitoring readiness, automatic save, thresholds, privacy posture, and local data reset

## User preferences

- Attractive, simple green interface inspired by Amazon's green accent.
- Prioritize practical accuracy, tradeoffs, and user choice over prescriptive optimization advice.

## Gotchas

- This browser version estimates code behavior and does not replace production profiling or a desktop process monitor.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
