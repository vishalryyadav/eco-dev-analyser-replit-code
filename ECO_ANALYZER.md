# EcoDev real analyzer

EcoDev turns submitted source code into a measurable engineering report. The analyzer uses the exact source text received by `POST /api/analyze`; it does not use fixed demo runtime or memory numbers.

## Supported languages

JavaScript, TypeScript, Python, C, C++, and Go.

## Privacy and data handling

**Implementation fact:** submitted source is sent to the configured EcoDev API for analysis, project scanning, or the local-rules coach. This implementation does not write submitted source to an application database or server-side analysis-history store. When sandbox execution is requested, the source is written to a private temporary workspace and removed after the run. The in-memory rate limiter retains a client IP address and request count for its configured window (60 seconds by default), but not source or results.

**Browser retention:** the web app stores up to 12 returned analysis-result objects in the browser's `localStorage` key `ecodev-history`. These objects can include findings, scores, returned stdout/stderr, and runtime/measurement metadata; they do not include the original submitted request body as a separate history item. Entries remain until they are displaced by the 12-entry limit, cleared by the user, or removed with browser site data. The History screen's **Clear local history** action removes only this key immediately. Downloaded reports and normal browser cache/storage are controlled separately by the user/browser.

**Results and reports:** analysis results are returned to the caller. Selecting a report download sends the result object to `POST /api/report` solely to create that response; this implementation does not retain a server-side report history.

**Configuration-dependent behavior:** a local/self-hosted deployment sends source to the API the user/operator configured; a public deployment sends source to that public API host. EcoDev cannot establish an external host, reverse proxy, platform, operating-system, or operator log-retention policy. Do not assume submitted code never leaves a device unless the actual deployment establishes that property.

**Laptop Saver:** a normal web browser does not automatically obtain whole-device telemetry. The optional companion binds to `127.0.0.1` and has no upload client; its snapshot is returned only to a local caller that requests it. Analyzer energy/carbon values are modeled execution estimates, not whole-laptop electricity measurements.

The included analyzer, sandbox workflow, local-rules coach, benchmarks, Green Score, and Laptop Saver do not require paid API keys, subscriptions, or external AI services. This is not a statement about a deployment operator's hosting costs.

## Measurements vs estimates

- **Runtime / wall time**: measured sandbox-run wall time for a secure invocation; it includes secure-runner and sandbox overhead, not only user-program instructions.
- **CPU time**: measured from GNU `time -v` output when the runtime image provides it; otherwise it is reported as unavailable. Only the energy model may use measured sandbox-run wall time as its fallback duration.
- **Peak memory**: measured from maximum resident set size when GNU `time -v` is available.
- **Time/space complexity**: static structural inference. It is not a measurement and cannot prove arbitrary-program complexity.
- **Energy**: estimated from measured process CPU time (or measured wall time when CPU telemetry is unavailable) and a documented low/high CPU-package power scenario.
- **Carbon**: estimated as energy in kWh multiplied by a documented low/high grid carbon-intensity scenario.

Defaults are explicit and configurable:

- `ECODEV_CPU_WATTS_LOW=15` and `ECODEV_CPU_WATTS_HIGH=45`
- `ECODEV_CARBON_G_PER_KWH_LOW=100` and `ECODEV_CARBON_G_PER_KWH_HIGH=800`
- `ECODEV_EXEC_TIMEOUT_MS=5000`
- `ECODEV_EXEC_MEMORY_MB=256`
- `ECODEV_EXEC_PIDS=128`

EcoDev never labels modeled energy/carbon as directly measured. The API returns a scenario range, midpoint, input telemetry, methodology, and source links. Configure measured device power and location/time-specific grid data to narrow the range. SCI also requires a functional unit and embodied emissions for a complete SCI score; this per-run report does not claim to be a full SCI score.

## Benchmarking

`benchmarkIterations` accepts 1–5 runs. For more than one run, EcoDev reports the median wall/CPU result and the maximum observed RSS among completed runs. This reduces the effect of one noisy sample while keeping execution bounded. The built-in suite only marks a language `IMPLEMENTED` when it has a real deterministic workload; the other supported languages are explicitly `UNAVAILABLE`, never filled with synthetic numbers. Built-in cases accept only their documented `inputSizes` and generate the workload deterministically from that size.

For a before/after candidate, `representativeInputs` may contain 1–8 bounded stdin strings. EcoDev repeats each input case, compares stdout and exit status, validates JSON structurally when output is JSON, and can check declared deterministic expected output in the harness. `VERIFIED` means deterministic agreement for the supplied cases only; `PARTIAL` and `UNAVAILABLE` never establish semantic equivalence. Savings are suppressed unless both sides have three completed, measured runs, valid telemetry, and `VERIFIED` correctness.

## Static structural analysis

Static analysis is separate from sandbox execution and reports `INFERRED` source-structure evidence plus a `CALCULATED` static score. For JavaScript, TypeScript, Python, C, C++, and Go, EcoDev recognizes common declarations, conditionals, loops, structurally nested loops, directly detectable recursion, selected language-native sorting and membership calls, repeated scans in loops, and allocation-like constructs. It does not compile the submission for theorem-level analysis or prove exact algorithmic complexity.

Complexity labels such as `O(n²)-like inferred` describe an upper-bound-shaped pattern observed in the source, not an exact runtime guarantee: loop bounds can be constant, data-dependent, or short-circuit; library behavior and input distributions can differ. Findings therefore include evidence, an inference/limitation, confidence, recommendation, and whether a benchmark is required. Recommendations are directions to validate, never guaranteed savings. Measured performance claims require completed sandbox benchmarks with representative workloads.

## Optimization profiles

`preferences.profile` can be `balanced`, `fast`, `memory`, `green`, `reliable`, `secure`, or `scalable`. The API ranks the same concrete alternatives differently according to the requested engineering goal. The Analyzer also exposes optional 0–100 custom weights for performance, memory, energy, carbon, readability, maintainability, security, reliability, scalability, and portability; these weights are sent as `preferences.weights`. An optional `preferences.instruction` is preserved in the response so clients can show the user's decision context. Rankings are described as the best match for the selected priorities, never as an objective best, and do not prove semantic equivalence; candidate code should be tested before adoption.

## Sandbox

The service prefers Bubblewrap (`bwrap`) and then Firejail. Both paths clear the inherited environment, disable networking, create a private writable workspace, apply memory/process limits, and kill over-timeout processes. The production container also pins a global TypeScript compiler so TypeScript is available inside the isolated runner. Temporary source files are removed after each run.

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
