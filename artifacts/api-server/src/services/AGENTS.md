# EcoDev Project Rules

EcoDev is an existing Green Code Analyzer and Laptop Energy Saver project.

CRITICAL RULES:

1. NEVER rebuild the project from scratch.
2. NEVER replace the existing frontend unnecessarily.
3. Preserve working features and architecture.
4. Modify only files relevant to the current task.
5. Never fabricate production measurements.
6. Never use Math.random() or hard-coded fake benchmark values for production metrics.
7. Every numerical result must be classified as:
   MEASURED
   CALCULATED
   DATASET_DERIVED
   RESEARCH_BASED
   INFERRED
   ESTIMATED
   UNAVAILABLE
8. User code must never execute directly inside the main backend process.
9. Docker is the primary sandbox on Windows.
10. Disable network access for submitted code by default.
11. Apply execution timeout, memory limits, CPU limits, process limits and output limits.
12. If a metric cannot be reliably measured, return UNAVAILABLE.
13. Do not change unrelated functionality.
14. After each change, run the smallest relevant test.
15. Do not claim a feature works without actually testing it.
16. Do not invent citations, research papers, APIs, or data sources.
17. Keep a clear distinction between measured energy and modeled/calculated energy.
18. Do not claim ISO certification.
19. SCI-related calculations must document boundary, functional unit, E, I, M, R, formula, assumptions and limitations.
20. Prefer simple reliable implementations over unnecessary complexity.