# Six-language sandbox validation

`artifacts/api-server/src/services/six-language-sandbox.test.ts` is a deterministic integration validation of the same `executeCode` path used by `POST /api/analyze`. It does not execute submitted source in the API process and never provides a host-execution fallback.

## Matrix

| Language | Fixed program | Configured path |
| --- | --- | --- |
| JavaScript | prints `ecodev-js-ok` | Node runtime |
| TypeScript | compiles then prints `ecodev-ts-ok` | configured TypeScript compiler, then Node |
| Python | prints `ecodev-py-ok` | `python3 -I` |
| C | compiles then prints `ecodev-c-ok` | `gcc`, then compiled binary |
| C++ | compiles then prints `ecodev-cpp-ok` | `g++`, then compiled binary |
| Go | builds then prints `ecodev-go-ok` | `go build`, then compiled binary |

Each successful case checks completion, exit status, exact stdout, the measured sandbox-run wall time, and CPU/RSS only when GNU `time -v` provides those fields. It also verifies that the existing result metadata classifies wall time as `MEASURED`, missing CPU/RSS as `UNAVAILABLE`, and energy/carbon as `MODELED / ESTIMATED`.

The suite additionally checks a JavaScript runtime error, a bounded JavaScript timeout, the combined-output limit, and unsupported-language normalization. It does not weaken the timeout, process, output, memory, networking, or sandbox restrictions.

## Sandbox and skip behavior

The runtime chooses Bubblewrap first and Firejail second, exactly as production does. If neither secure sandbox is available, or a required configured compiler/runtime is unavailable, the affected case is reported as skipped with the actual reason. A skipped case is not a pass and must not be reported as validated execution.

Bubblewrap also requires a host/container policy that permits unprivileged user namespaces. In a deployment that denies those namespaces (including the hardened Docker Desktop run used for this validation), every executable matrix case is correctly `SKIPPED` as sandbox unavailable; do not loosen `no-new-privileges`, PID, memory, output, or timeout limits to change that outcome.

`measured: true` means only that the secure execution completed. Wall time is measured for the sandbox invocation. CPU time and peak RSS are measured only when GNU `time -v` telemetry is present. Modeled energy/carbon remain estimates; whole-laptop electricity is unavailable.

## Reproduce

Run in the supported Ubuntu/WSL2 or production container environment after dependencies are installed:

```bash
corepack pnpm --filter @workspace/api-server exec node \
  --experimental-strip-types --test src/services/six-language-sandbox.test.ts
```

For a production-like container validation, build the existing Docker image, start it with its existing limits, and run the same test command inside that environment. Do not add a host-execution fallback if Bubblewrap or Firejail cannot initialize.
