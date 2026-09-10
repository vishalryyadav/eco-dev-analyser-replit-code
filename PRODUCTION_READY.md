# EcoDev production readiness

This branch adds the missing product layers around the core analyzer: developer preferences, VS Code integration, a localhost desktop companion, desktop app shell, production request hardening, repeatable benchmarking, green-computing documentation, and a reproducible sandbox image.

## Deployment checklist

### Web/API

- Set `ECODEV_EXEC_TIMEOUT_MS`, `ECODEV_EXEC_MEMORY_MB`, and `ECODEV_EXEC_PIDS` for the risk level of the deployment.
- Set `ECODEV_CORS_ORIGIN` to the exact allowed web origins in production. Leaving it empty disables cross-origin access and is the safest same-origin default.
- Set `ECODEV_RATE_LIMIT` and `ECODEV_RATE_WINDOW_MS` to match expected legitimate traffic and infrastructure capacity.
- Do not disable the sandbox or add an unsandboxed escape hatch.
- Verify Bubblewrap is available and that the deployment platform permits the required Linux user namespaces. If not, use a dedicated code-execution worker rather than running untrusted source in the web process.

### Measurement

For serious benchmark comparisons, use `benchmarkIterations` from 2 to 5 and compare identical workloads. Runtime, CPU, and RSS are host measurements; energy and carbon remain modeled until a direct power measurement is available.

### Developer workflow

The VS Code extension supports on-demand analysis and opt-in on-save analysis. Configure an API endpoint and a profile (`balanced`, `fast`, `memory`, `green`, `reliable`, `secure`, `scalable`). Source code is not sent anywhere until the extension invokes the configured endpoint.

The desktop companion binds only to `127.0.0.1` and provides best-effort CPU/load, memory, battery, process, and power-management context. It must be installed and enabled explicitly by the user. The Electron shell is intentionally configured without Node integration in renderer pages.

### Green-computing reporting

EcoDev's recommendations are framed around three reduction levers emphasized by the Green Software Foundation: energy efficiency, carbon awareness, and hardware efficiency. The SCI methodology is the longer-term target for reporting carbon intensity per functional unit rather than presenting raw carbon totals alone.

References:

- https://learn.greensoftware.foundation/introduction/
- https://learn.greensoftware.foundation/energy-efficiency/
- https://learn.greensoftware.foundation/hardware-efficiency/
- https://greensoftware.foundation/standards/sci/

## Release definition

A release is production-ready only after the deployment-specific smoke test demonstrates:

1. Real submitted programs produce different measurements/results.
2. JavaScript, TypeScript, Python, C, C++, and Go compile/run or return a truthful sandbox-unavailable result.
3. Infinite loops and memory-heavy workloads are stopped by limits.
4. Network and host-file access are unavailable to submitted code.
5. Compiler/runtime errors reach the user without exposing server secrets.
6. Before/after comparison runs both exact source submissions independently.
7. VS Code commands work against the configured API.
8. The desktop agent is optional and does not upload telemetry by itself.
9. The CI pipeline is green for API, extension, and desktop-agent checks.
