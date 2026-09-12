# Vercel deployment

## Prerequisites

Install Node.js 20 or newer, then enable pnpm:

```powershell
corepack enable
corepack prepare pnpm@latest --activate
```

Install dependencies from the repository root:

```powershell
pnpm install --frozen-lockfile
```

## Local website

Run the Vite frontend directly:

```powershell
pnpm --filter @workspace/ecodev dev
```

Open `http://localhost:5173` in a browser. Build the frontend with:

```powershell
pnpm --filter @workspace/ecodev build
```

The output is written to `artifacts/ecodev/dist`.

## Vercel web deployment

Connect the GitHub repository to Vercel and keep the project root at the repository root. The root `vercel.json` installs the monorepo dependencies, builds the Vite web client, serves `artifacts/ecodev/dist`, and exposes the API through `api/index.ts`.

The configured build settings are:

- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter @workspace/ecodev build`
- Output directory: `artifacts/ecodev/dist`

No Replit-only `PORT` or `BASE_PATH` environment variables are required for the production web build; the Vite configuration supplies safe defaults when those variables are absent.

### Important execution limitation

Vercel can host the frontend and API routes, but its serverless runtime is not the secure execution worker. The `/api/analyze` endpoint will provide static analysis and will truthfully return `sandbox_unavailable` unless the deployment supplies Bubblewrap or Firejail with permitted Linux user namespaces. Do not add an unsandboxed fallback.

For real compiler/runtime measurements, deploy the Linux image in `deploy/Dockerfile.sandbox` to a Linux container host. The image includes Bubblewrap, GCC, G++, Go, Python, GNU `time`, the API, and the built frontend.

## Full local production container

Install Docker Desktop with the WSL 2 backend, copy `.env.example` to `.env`, then run from the repository root:

```powershell
Copy-Item .env.example .env
docker compose -f docker-compose.production.yml up --build
```

Open `http://localhost:5000`. Verify the API with:

```powershell
Invoke-WebRequest http://localhost:5000/healthz
```

The host must support Bubblewrap's required Linux user namespaces. If it does not, keep static analysis enabled and use a dedicated Linux execution worker instead of weakening the sandbox.
