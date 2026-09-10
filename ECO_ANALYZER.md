# EcoDev real analyzer

The Analyzer page now calls `POST /api/analyze` with the exact source text from the editor. Static analysis and execution are separate concerns.

## Supported languages

JavaScript, TypeScript, Python, C, C++, and Go.

## Measurements vs estimates

- **Runtime / wall time**: measured by the server process for a sandbox invocation when execution is available.
- **CPU time**: measured from GNU `time -v` output when the runtime image provides it; otherwise the service falls back to wall time only for successful runs.
- **Peak memory**: measured from maximum resident set size when GNU `time -v` is available.
- **Time/space complexity**: static structural inference. It is never presented as measured runtime.
- **Energy**: estimated as `CPU seconds × configured CPU-package watts`.
- **Carbon**: estimated as `energy kWh × configured carbon intensity (gCO2e/kWh)`.

The defaults are deliberately explicit and configurable:

- `ECODEV_CPU_WATTS=25`
- `ECODEV_CARBON_G_PER_KWH=400`
- `ECODEV_EXEC_TIMEOUT_MS=5000`
- `ECODEV_EXEC_MEMORY_MB=256`
- `ECODEV_EXEC_PIDS=32`

An actual hardware energy meter can replace the model later; until then, energy/carbon values must remain labelled estimates.

## Sandbox

The service prefers Bubblewrap (`bwrap`) and then Firejail. Both paths clear the inherited environment, disable networking, create a private writable workspace, apply memory/process limits, and kill over-timeout processes. Temporary source files are removed after each run.

If neither sandbox runtime is installed, the API **fails closed for code execution** and returns static analysis plus a `sandbox_unavailable` execution status. Do not set `ECODEV_ALLOW_UNSANDBOXED_EXECUTION=true` in production; that switch exists only for controlled local development.

The server never forwards shell text supplied by users to a host shell. User source is written as a file and the executor only invokes fixed compiler/runtime argument lists for supported languages.

## Optimization comparison

Send `compareCode` to `/api/analyze` to benchmark a candidate implementation against the baseline in the same request. The response reports runtime, memory, and estimated-carbon deltas. Results are tied to the two exact source submissions.

## Limitations

Static complexity inference is intentionally conservative and heuristic. It cannot prove arbitrary program complexity. Benchmark results are environment-specific and should be treated as workload measurements, not universal performance guarantees.
