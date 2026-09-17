# EcoDev privacy and data handling

## Implementation facts

- The browser sends submitted code to the configured EcoDev API for `/api/analyze`, `/api/coach`, or `/api/project/analyze` processing, only when the relevant user action is requested.
- The API has no application database or server-side analysis-history feature. Submitted source is processed in request memory; sandbox execution writes a private temporary source file, then removes its temporary workspace after the run.
- The API's in-memory rate limiter retains a client IP address and request count for its configured rate-limit window (60 seconds by default). It does not store submitted source or analysis results.
- The browser stores at most 12 returned analysis-result objects in `localStorage` under `ecodev-history`. Returned results can include stdout, stderr, findings, scores, and runtime/measurement metadata. The submitted request body is not separately retained by that browser-history feature. Entries remain until displaced by the 12-entry limit, cleared by the user, or removed with browser site data.
- A report is generated only when the user explicitly downloads it. The browser posts the result object to `/api/report`; the API returns the requested file and has no application-level server-side report-history feature.
- Clearing history removes only `ecodev-history` and updates the UI immediately. It does not clear downloaded reports, caches, or unrelated browser storage.
- The optional desktop companion binds only to `127.0.0.1`, serves telemetry only to a caller that requests its endpoint, and has no upload client or external telemetry service.

## Configuration-dependent behavior

Local/self-hosted EcoDev sends code to the API selected by that local deployment. Public hosted EcoDev sends code to the public host. The application cannot prove the retention practices of a reverse proxy, hosting platform, operating system, browser extension, or deployment operator. Operators must publish their own infrastructure log and retention policies.

## Limitations and user responsibilities

A normal browser cannot automatically enumerate whole-device telemetry. Analyzer energy/carbon results are modeled from scoped execution duration; they are not measurements of whole-laptop electricity. Users should clear local history when appropriate and manage downloaded reports and browser/site data through their browser controls.

EcoDev contains no analytics tracker, advertising SDK, user profiling feature, paid API requirement, subscription requirement, or external AI forwarding path. This does not make a claim about third-party hosting costs.
