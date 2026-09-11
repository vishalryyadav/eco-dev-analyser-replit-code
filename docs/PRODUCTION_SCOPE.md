# EcoDev production scope

EcoDev implements a real code-analysis workflow: source analysis, sandboxed execution where the host can provide a supported isolation runtime, runtime/CPU/RSS measurements, transparent energy/carbon estimation, optimization alternatives and trade-offs, comparison, security checks, optional AI coaching, VS Code integration, and desktop telemetry.

Important limits are explicit: arbitrary program semantics cannot be proven by lightweight heuristics; energy/carbon are estimates unless a hardware meter reports otherwise; laptop process telemetry requires a local desktop agent and is not available to an ordinary browser; and a mobile/desktop package is a client application, not a substitute for the hosted backend.

Production deployment should use a dedicated isolated execution provider for untrusted public traffic. The local Bubblewrap/Firejail runner is intended for environments where those tools are installed and correctly configured. Vercel Sandbox is a suitable production-grade alternative because it runs each sandbox inside an isolated Firecracker microVM with network and credential isolation. See RESEARCH_EVIDENCE.md for the evidence used by the product.
