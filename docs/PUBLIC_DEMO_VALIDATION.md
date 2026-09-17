# Public-demo validation record

**Validation date:** 2026-09-17 (Asia/Kolkata)

This is an evidence record for the repository state validated on the operator's
machine. It is not a promise that a temporary URL, a tunnel, or a host will
remain available.

## Deployment paths checked

| Path | Result | Evidence / limitation |
| --- | --- | --- |
| Production container | Built successfully | `docker compose -f docker-compose.production.yml build` completed. The image typechecks and builds the frontend and API during its Docker build. |
| Container runtime | Safe fail-closed | `http://localhost:5000/`, `/healthz`, and `/api/analyze` served. Docker Desktop rejected Bubblewrap namespace creation, so execution returned `sandbox_unavailable`; it did not execute code outside the sandbox. |
| Native Ubuntu WSL2 runtime | Real secured execution | The already-running native server on port 5001 completed JavaScript in Bubblewrap and returned stdout, wall time, CPU time, peak RSS, a calculated Green Score, and modeled energy/carbon. |
| Temporary public tunnel | Not validated as public in this session | The existing Quick Tunnel URL no longer opened in a browser (`ERR_FAILED`). It must not be presented as an active public demo URL. Start a new Quick Tunnel only after repeating the local checks in `PRODUCTION_SCOPE.md`. |

The WSL source checkout running on port 5001 was an older checkout, so its
successful execution evidence validates the documented native runtime mechanism,
not every current frontend change. The current Windows checkout's clean native
WSL build could not be completed because `/mnt/c` denied pnpm's executable-shim
`chmod`; use a Linux-native checkout such as the documented `/home/vishal/src/...`
path for that build.

## Browser checks

The current production container frontend was opened at
`http://localhost:5000/` in a normal browser.

- The homepage loaded and offered JavaScript, TypeScript, Python, C, C++, and
  Go.
- Submitting the supplied JavaScript sample produced static findings, privacy
  text, optimization recommendations, Measurement & Methodology, and a local
  History entry.
- Because the container sandbox was unavailable, runtime, CPU/RSS, Green Score,
  energy, and carbon were visibly marked **UNAVAILABLE**. The UI displayed the
  safe generic message “Secure execution is unavailable in this deployment”;
  it did not expose Docker host diagnostics.
- The current History screen displayed the **Clear local history** control.
  It was not clicked during this record because it deletes browser-local data;
  its implementation removes only `ecodev-history` after a browser confirmation.
- On the native WSL browser check, the same workflow completed in Bubblewrap
  with measured wall/CPU/RSS and a calculated Green Score; energy and carbon
  were visibly modeled rather than claimed as measurements.

## API and security checks

Native WSL API probes used bounded JavaScript inputs and returned:

| Case | Observed result |
| --- | --- |
| Valid source | `completed`, Bubblewrap, measured wall/CPU/RSS, calculated Green Score; energy/carbon modeled. |
| Unsupported language | HTTP 400 with the supported-language message. |
| Runtime exception | `runtime_error`; no host-path or host-configuration diagnostic was returned. |
| Infinite loop | `timeout` after about 5 seconds; Green Score and modeled metrics unavailable. |
| 40 KB stdout | `output_limit`; metrics unavailable. |
| >1 MB JSON body | HTTP 413, `Request body is too large.` |
| Allowed temporary origin | HTTP 204 preflight with that exact `Access-Control-Allow-Origin` value. |
| `https://evil.example` | HTTP 403, no wildcard CORS response. |

The production container returned `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and the configured
`Permissions-Policy`. Compose retains a read-only root filesystem, bounded
`/tmp`, memory/PID caps, and `no-new-privileges:true`; no privileged mode,
`SYS_ADMIN`, unconfined seccomp, or unsandboxed fallback was added.

## Dependency and hosting boundary

The validated workflow used no API key, external AI call, paid database,
analytics tracker, or third-party account. The local-rules coach is the default
when `OPENAI_API_KEY` is unset. EcoDev's only documented free public mechanism
is a time-limited Cloudflare Quick Tunnel to the operator's already-validated
local server; it is testing infrastructure, not permanent hosting. A permanent
public arbitrary-code service remains out of scope until an operator provides
isolated execution, TLS, monitoring, abuse controls, and a retention policy.
