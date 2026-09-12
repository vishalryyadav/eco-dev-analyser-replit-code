# EcoDev real analyzer

EcoDev turns submitted source code into a measurable engineering report. The analyzer uses the exact source text received by `POST /api/analyze`; it does not use fixed demo runtime or memory numbers.

## Supported languages

JavaScript, TypeScript, Python, C, C++, and Go.

## Measurements vs estimates

- **Runtime / wall time**: measured by the server process for a sandbox invocation when secure execution is available.
- **CPU time**: measured from GNU `time -v` output when the runtime image provides it; otherwise the successful-run value may fall back to wall time and is labelled accordingly.
- **Peak memory**: measured from maximum resident set size when GNU `time -v` is available.
- **Time/space complexity**: static structural inference. It is not a measurement and cannot prove arbitrary-program complexity.
- **Energy**: estimated from measured process CPU time (or measured wall time when CPU telemetry is unavailable) and a documented low/high CPU-package power scenario.
- **Carbon**: estimated as energy in kWh multiplied by a documented low/high grid carbon-intensity scenario.

Defaults are explicit and configurable:

- `ECODEV_CPU_WATTS_LOW=15` and `ECODEV_CPU_WATTS_HIGH=45`
- `ECODEV_CARBON_G_PER_KWH_LOW=100` and `ECODEV_CARBON_G_PER_KWH_HIGH=800`
- `ECODEV_EXEC_TIMEOUT_MS=5000`
- `ECODEV_EXEC_MEMORY_MB=256`
- `ECODEV_EXEC_PIDS=32`

EcoDev never labels modeled energy/carbon as directly measured. The API returns a scenario range, midpoint, input telemetry, methodology, and source links. Configure measured device power and location/time-specific grid data to narrow the range. SCI also requires a functional unit and embodied emissions for a complete SCI score; this per-run report does not claim to be a full SCI score.

## Benchmarking

`benchmarkIterations` accepts 1–5 runs. For more than one run, EcoDev reports the median wall/CPU result and the maximum observed RSS among completed runs. This reduces the effect of one noisy sample while keeping execution bounded.

## Optimization profiles

`preferences.profile` can be `balanced`, `fast`, `memory`, `green`, `reliable`, `secure`, or `scalable`. The API ranks the same concrete alternatives differently according to the requested engineering goal. An optional `preferences.instruction` is preserved in the response so clients can show the user's decision context. Rankings do not prove semantic equivalence; candidate code should be tested before adoption.

## Sandbox

The service prefers Bubblewrap (`bwrap`) and then Firejail. Both paths clear the inherited environment, disable networking, create a private writable workspace, apply memory/process limits, and kill over-timeout processes. Temporary source files are removed after each run.

If neither sandbox runtime is installed, the API **fails closed for code execution** and returns static analysis plus a `sandbox_unavailable` execution status. There is no production switch for bypassing the sandbox.

The server never forwards shell text supplied by users to a host shell. User source is written as a file and the executor only invokes fixed compiler/runtime argument lists for supported languages.

## VS Code and desktop companion

- `integrations/vscode` provides a VS Code extension with explicit on-demand analysis and optional on-save analysis. It can send a selected file/selection to the EcoDev API using the configured endpoint and optimization profile.
- `integrations/desktop-agent` is a localhost-only companion that provides CPU/load, memory, battery state when available, top-process context, and practical power-management recommendations. It binds to `127.0.0.1` and does not upload telemetry by itself.

The browser cannot safely enumerate arbitrary operating-system processes or VS Code activity. Device-wide monitoring therefore belongs in the local companion, not in a website pretending to have OS access.

## Green-computing model

EcoDev uses the Green Software Foundation concepts of energy efficiency, carbon awareness, and hardware efficiency as design guidance. Operational energy/carbon is only one part of impact; hardware lifecycle and utilization also matter. The Software Carbon Intensity (SCI) standard is an appropriate future measurement target because it reports carbon per functional unit rather than only a raw total.

References:

- Green Software Foundation — Green Software Practitioner concepts: https://learn.greensoftware.foundation/introduction/
- Green Software Foundation — Energy Efficiency: https://learn.greensoftware.foundation/energy-efficiency/
- Green Software Foundation — Hardware Efficiency: https://learn.greensoftware.foundation/hardware-efficiency/
- Green Software Foundation — Software Carbon Intensity: https://greensoftware.foundation/standards/sci/

## Limitations

Static complexity inference is intentionally heuristic. Benchmark results are environment- and workload-specific, so an improvement on one machine or input distribution is not a universal guarantee. Security-sensitive, performance-critical, or production changes should be reviewed and tested independently.
