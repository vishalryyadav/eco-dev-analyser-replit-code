# EcoDev production scope

EcoDev implements a real code-analysis workflow: source analysis, sandboxed execution where the host can provide a supported isolation runtime, runtime/CPU/RSS measurements, transparent energy/carbon estimation, optimization alternatives and trade-offs, comparison, security checks, optional AI coaching, VS Code integration, and desktop telemetry.

Important limits are explicit: arbitrary program semantics cannot be proven by lightweight heuristics; energy/carbon are estimates unless a hardware meter reports otherwise; laptop process telemetry requires a local desktop agent and is not available to an ordinary browser; and a mobile/desktop package is a client application, not a substitute for the hosted backend.

## Privacy and retention boundary

**Implementation fact:** the EcoDev API processes submitted source in request handling. It has no application database, server-side analysis history, or server-side report-history feature. Sandbox execution temporarily writes source into a private run workspace and removes that workspace after the run. Its in-memory rate limiter retains a client IP address and request count for its configured window (60 seconds by default), but not submitted source or results. The web app may retain up to 12 returned analysis-result objects in its own `localStorage` key until replacement, a user clear, or browser site-data removal.

**Configuration-dependent behavior:** code is sent to the API selected by the deployment. A local/self-hosted API keeps that network path under the operator's control; a public hosted API receives code at the public host. Reverse proxies, hosting platforms, operating-system logs, and deployment operators can impose retention outside this application and must document it themselves. The optional localhost desktop companion does not upload telemetry by itself.

**Known limitation:** a normal browser does not automatically receive whole-device telemetry, and analyzer energy/carbon values are modeled execution estimates rather than measurements of whole-laptop electricity. The included EcoDev features do not require paid API keys, subscriptions, or external AI services; that does not make a claim about a deployment's hosting costs.

## Deployment modes

**Primary controlled public-demo/runtime path:** native Ubuntu WSL2 with
Bubblewrap, serving the built frontend and API from one origin. This is the
only documented path in this repository that can provide real submitted-code
execution on the current operator machine. Docker Desktop remains useful for
the production build, UI, API, and fail-closed behavior checks, but its hardened
namespace policy can make Bubblewrap execution unavailable. Do not weaken that
policy; use the native WSL2 path for the demonstration instead.

| Mode | Intended use | Browser/API path | Execution evidence |
| --- | --- | --- | --- |
| Local development | Editing and feature work | Vite or local API endpoint | Depends on a correctly configured secure runner; never use an unsandboxed fallback. |
| Local/self-hosted | College demonstration on an operator-controlled machine | Same-origin frontend and API from the local host or WSL host | The supported native Ubuntu WSL2 path below can use Bubblewrap when its user namespaces are available. |
| Temporary free public demo | Time-limited evaluator access | A Cloudflare Quick Tunnel forwards an HTTPS URL to the already-validated local WSL server | Testing-only; the laptop, WSL server, and tunnel must stay running. It is not permanent hosting. |
| Permanent public hosting | A separately operated public service | HTTPS frontend/API with explicitly configured origins and retention policy | Requires independently maintained isolated execution, monitoring, abuse controls, TLS, and an operator-defined retention policy. EcoDev does not promise permanently free hosting. |

## How to run EcoDev for a college evaluation

**Server/operator requirements:** a Windows host with Ubuntu 24.04 WSL2 (or another Linux host), Node.js 24 with pnpm, Bubblewrap with working unprivileged user namespaces, and the JavaScript/TypeScript, Python, GCC, G++, and Go runtimes. Docker Desktop can build and serve the application, but it may reject Bubblewrap's nested namespaces; that condition must remain `sandbox_unavailable`, not be bypassed. The server operator starts the same-origin API/frontend using the native WSL2 command below and, only after its local browser check passes, may start the documented free temporary Quick Tunnel.

**Browser/end-user requirements:** a current desktop or mobile browser with JavaScript and `localStorage` enabled. End users need no account, API key, payment method, subscription, desktop agent, or locally installed compiler. Supported submitted languages are JavaScript, TypeScript, Python, C, C++, and Go. The normal browser sends selected code to the configured EcoDev API; it cannot automatically access whole-device telemetry. Analysis history is local to that browser and can be cleared from the History screen.

**Free-to-use status:** the included analyzer, local-rules coach, benchmarks, Green Score, sandbox workflow, and Laptop Saver use no paid API, external AI service, paid database, analytics tracker, or mandatory third-party account. This statement does not guarantee that a chosen hosting operator has no infrastructure cost.

Benchmark comparison is evidence of observed behavior for the supplied workload and sandbox environment; it is not proof that an optimization is universally better for all workloads. EcoDev only publishes before/after savings after three completed measured runs and deterministic correctness validation for the supplied cases.

Production deployment should use a dedicated isolated execution provider for untrusted public traffic. The local Bubblewrap/Firejail runner is intended for environments where those tools are installed and correctly configured. Vercel Sandbox is a suitable production-grade alternative because it runs each sandbox inside an isolated Firecracker microVM with network and credential isolation. See RESEARCH_EVIDENCE.md for the evidence used by the product.

## Minimum public deployment checklist

EcoDev can serve its built frontend and API from the same HTTPS origin, or serve
the frontend separately and configure the API with the exact frontend origin.
Before publishing a URL, set the following deliberately:

- **Frontend and API:** build `artifacts/ecodev`; either serve it from the API
  container or set `ECODEV_API_ORIGIN` in the frontend build to the HTTPS API.
- **HTTPS:** terminate TLS at the public edge and redirect HTTP to HTTPS. Do not
  expose a development server or an unauthenticated plain-HTTP API to the
  internet.
- **CORS:** set `ECODEV_CORS_ORIGIN` to a comma-separated allow-list such as
  `https://demo.example.edu`. Wildcard origins are intentionally ignored. The
  same origin works without a CORS entry.
- **Proxy trust:** leave `ECODEV_TRUST_PROXY=0` when the API is directly
  reachable. Set it to `1` only when a reverse proxy you operate is immediately
  in front of the API; this preserves accurate client IPs for rate limiting and
  HTTPS protocol detection.
- **Request and execution limits:** retain the 1 MB JSON request limit, per-code
  and project/report payload limits, 5-second execution timeout (or another
  bounded value), 32 KB combined captured output limit, individual generated-file
  limit, process/memory limits, rate limiting, and
  `ECODEV_EXEC_CONCURRENCY` at a small value (default `1`). A busy runner returns
  `sandbox_busy` instead of building an unbounded queue.
- **Sandbox and temporary storage:** install and validate Bubblewrap or Firejail,
  retain network and environment isolation, and keep the container read-only with
  a bounded `/tmp`. Set `ECODEV_WORK_ROOT` to a dedicated, sized tmpfs (the
  production Compose file uses `/tmp`, capped at 512 MB) so compiler artifacts
  cannot consume host disk. `ECODEV_EXEC_FILE_SIZE_KB` bounds a single generated
  file but is not a substitute for that filesystem quota. Do not enable host
  execution when the sandbox is unavailable.
- **Container privileges:** the supplied Compose file deliberately does not use
  `SYS_ADMIN`, privileged mode, or an unconfined seccomp profile. Validate that
  Bubblewrap can create the required namespaces on the target kernel. If it
  cannot, execution must remain fail-closed; do not restore broad privileges just
  to make nested sandboxing work.
- **Operations:** set `NODE_ENV=production`, keep `OPENAI_API_KEY` unset for the
  free local-rules coach unless an owner intentionally accepts third-party API
  cost and data handling, and monitor logs and resource usage.

### Public-use limitation

This repository is appropriate for a controlled college demonstration after its
container and limits have been validated on the target host. Bubblewrap inside a
single application container is not, by itself, a claim of safety for arbitrary
internet traffic: namespace support, kernel policy, container privileges,
compiler/runtime attack surface, cgroup enforcement, disk exhaustion, and
multi-tenant isolation are host-level concerns. A public arbitrary-code service
should use a dedicated, independently maintained isolated-execution platform or
microVM layer, plus operational monitoring and abuse controls. EcoDev does not
provide those external production controls in this local/free project.

### Native Ubuntu WSL2 presentation/demo mode

For the controlled college demo, use the native Ubuntu-24.04 WSL2 server. It
uses the existing API and built frontend, and runs submitted programs only in
Bubblewrap. This is the supported local presentation path because the validated
WSL kernel permits unprivileged user namespaces, while the current Docker
Desktop container seccomp policy rejects Bubblewrap's nested user namespace.

Docker Desktop is not required for this mode. Do not weaken its container
security with privileged mode, `SYS_ADMIN`, `seccomp:unconfined`, a setuid
runner, or Bubblewrap fallbacks. The native server retains Bubblewrap network
and environment isolation, execution timeout, memory/process/file limits,
output limit, request validation, rate limiting, and fail-closed behavior.

The current machine already has a process on port 5000, so this guide reserves
**port 5001** for the native demo. If port 5000 is free, replace `5001` below
with `5000` consistently. The frontend and API are served from the same origin;
no CORS wildcard or temporary hostname is configured.

From Windows, open Ubuntu WSL2:

```powershell
wsl -d Ubuntu-24.04
```

In Ubuntu, run the following in one terminal. The project-local Node runtime is
placed first on `PATH`; do not use a Windows Node executable inside WSL.

```bash
cd /home/vishal/src/eco-dev-analyser-replit-code
export PATH="$HOME/.local/ecodev-node/v24.21.0/bin:$HOME/.local/bin:$PATH"
node --version
pnpm --version
bwrap --version
gcc --version
g++ --version
go version
python3 --version
unshare -Ur true

# Build the existing production frontend and API. This does not start a Vite dev server.
corepack pnpm run build

# Keep this terminal open for the presentation.
PORT=5001 NODE_ENV=production ECODEV_WORK_ROOT=/tmp \
  node artifacts/api-server/dist/index.mjs
```

In a second Ubuntu terminal, verify health and one real secured execution before
opening any public tunnel:

```bash
curl http://127.0.0.1:5001/healthz
curl -H 'Content-Type: application/json' \
  --data-binary '{"code":"console.log(2 + 3)","language":"javascript","execute":true}' \
  http://127.0.0.1:5001/api/analyze
```

Continue only when the result shows `execution.status: "completed"`,
`measured: true`, Bubblewrap, measured wall/CPU/RSS values, modeled
energy/carbon, and a calculated Green Score. Do not proceed for
`sandbox_unavailable`, `sandbox_busy`, a timeout, or any other non-completed
result.

#### Local browser check

On this WSL2 setup, Windows localhost forwarding for the native process is not
enabled. Obtain WSL's current address and open it in a Windows browser:

```bash
hostname -I | awk '{print $1}'
```

Open `http://<printed-WSL-IP>:5001/`, select JavaScript, enter
`console.log(2 + 3)`, and choose **Analyze**. Confirm Program completed,
Bubblewrap, measured runtime/CPU/RSS, modeled energy/carbon, calculated Green
Score, output, findings, and recommendations. The optional Before vs After
panel requires both programs to complete with comparable telemetry. Laptop
Saver intentionally reports device-level telemetry as unavailable unless the
owner has installed the optional local companion.

#### Cloudflare Quick Tunnel: controlled college demonstration

Run `cloudflared` **inside the same Ubuntu WSL terminal environment** so its
`127.0.0.1` is the verified native server. It is intentionally not a permanent
hostname and must never be copied into source or environment files.

For each Quick Tunnel session, copy the HTTPS URL printed by `cloudflared` and
restart the native server with that exact URL in the process environment. This
keeps the API's exact-origin guard enabled despite Cloudflare terminating HTTPS
before forwarding to the local HTTP service. Do not add the temporary URL to
`.env.example`, source code, or a committed `.env` file:

```bash
export ECODEV_CORS_ORIGIN="https://<current-trycloudflare-host>"
PORT=5001 NODE_ENV=production ECODEV_WORK_ROOT=/tmp \
  node artifacts/api-server/dist/index.mjs
```

The frontend uses same-origin `/api/*` requests. `ECODEV_CORS_ORIGIN` is only
the explicit temporary origin allow-list entry needed by the API's origin guard;
it is not a wildcard and it does not expose a separate API host.

If `cloudflared` is not installed, obtain the Linux amd64 binary or package only
from Cloudflare's official Downloads page, install it according to the official
instructions, then verify `cloudflared --version`. Do not download an
unofficial binary or run an unreviewed install script.

After the local browser check passes, in a third Ubuntu terminal run:

```bash
cloudflared tunnel --url http://127.0.0.1:5001
```

Copy the temporary `https://…trycloudflare.com` URL printed by `cloudflared`.
Open it from another device/browser and repeat the JavaScript analysis. The
laptop must remain running and the WSL server and tunnel terminals must remain
open. A Quick Tunnel is temporary, testing-only infrastructure—not a permanent
public deployment. Stop the tunnel with `Ctrl+C`, then stop the WSL server with
`Ctrl+C` when the presentation ends.
