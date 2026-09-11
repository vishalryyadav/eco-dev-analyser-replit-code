# Vercel deployment

The web client is built with Vite and outputs to `artifacts/ecodev/dist/public`.

Vercel uses the root `vercel.json` to build the web client from the monorepo and exposes the API through `api/index.ts`.

No Replit-only `PORT` or `BASE_PATH` environment variables are required for the production web build; the Vite configuration supplies safe defaults when those variables are absent.
