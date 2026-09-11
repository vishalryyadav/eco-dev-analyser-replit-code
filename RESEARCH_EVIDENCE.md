# EcoDev research evidence

EcoDev uses runtime measurements where the execution environment permits them and uses static heuristics for source-level recommendations. Research evidence is used to guide the design of those recommendations, not to claim that a paper's benchmark result is the measured result for a user's program.

## Evidence base

1. Pereira et al., **Ranking programming languages by energy efficiency**, Science of Computer Programming, 2021. The study benchmarked implementations across many languages and measured energy, execution time, and memory. It demonstrates why time, memory, and energy should be considered together rather than treating runtime as a perfect proxy for energy.
   DOI: https://doi.org/10.1016/j.scico.2021.102609

2. Jiménez et al., **Does the compiler or interpreter version influence the energy consumption of programming languages?**, Science of Computer Programming, 2025. The study used hardware-based energy measurement across compiler/interpreter versions and found that version changes do not guarantee lower energy consumption.
   DOI: https://doi.org/10.1016/j.scico.2025.103270

3. Pinto et al., **SPELLing out energy leaks: Aiding developers locate energy inefficient code**, Information and Software Technology. The work connects test execution and energy measurements to source-code locations and reports an empirical developer study in which participants using the technique improved energy efficiency.

4. Verdecchia et al., **Software development lifecycle for energy efficiency: Techniques and tools**, ACM Computing Surveys, 2019. The survey identifies source-code analysis, efficient data structures, programming practices, monitoring, and benchmarking as useful parts of an energy-efficiency workflow.
   DOI: https://doi.org/10.1145/3337773

5. Rivoire et al., **JouleSort: a balanced energy-efficiency benchmark**, SIGMOD 2007. The benchmark demonstrates that energy efficiency is a system-level property and that fair workload definitions and measurement methodology matter.
   DOI: https://doi.org/10.1145/1247480.1247522

6. Maquoi, **Energy CodeSumption**, FSE Companion 2025. The work explores linking energy-intensive execution to source-code constructs using test execution and hotspot analysis.

7. Goyal, Matathammal, and Vaidhyanathan, **EnCoDe: Energy Estimation of Source Code At Design-Time**, 2026. This recent work explores fine-grained design-time energy estimation from static source features and reports predictive models for Python code. It is useful evidence for future EcoDev research/model work, but EcoDev does not claim to reproduce its model.

8. Pulido et al., **Evaluating the Energy Efficiency of Optimization Techniques in C, Python, and Java**, Software: Practice and Experience, 2026. The study evaluates many optimization techniques and reinforces an important EcoDev rule: an optimization should be benchmarked because a source-level optimization does not automatically reduce energy in every workload/runtime.

## Product interpretation

- Runtime is measured when secure execution is available.
- CPU time and peak RSS are host measurements, not universal properties of the source code.
- Energy and carbon are explicitly estimates unless a direct hardware energy meter is integrated.
- Static complexity detection is heuristic and cannot prove arbitrary-program complexity.
- Optimization alternatives are decision support. Users should benchmark candidate code with representative inputs before adopting a change.
- Language-level research results are not treated as a universal ranking for every application.
