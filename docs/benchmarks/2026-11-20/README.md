# Pi and OpenHands validation: 20 November 2026

This snapshot records the current integration after flexible team sizes, runtime hardening and verified subprocess-OOM recovery. All runs used the configured `Qwen/Qwen3.5-397B-A17B-FP8` endpoint. Credentials and the private endpoint are omitted.

## Scope and reports

- [Initial 21-run comparison](multi-agent-test.md): Pi with 1-6 total agents and single-agent OpenHands, once each on `jsonlines`, `schedule-master` and `tinydb`. This is an exploratory team-size sweep.
- [Five-attempt comparison](multi-agent-test-five-repeats.md): five attempts for Pi single agent, Pi three agents and single-agent OpenHands on each task. Its 45 records comprise nine selected baselines from the 21-run sweep and 36 additional generations.
- Together the reports cover **57 unique live repository generations**, with **54 scored evaluations and three interrupted/unscored evaluations**. The overlapping nine baselines must not be counted twice.

All 57 generations completed their native agent lifecycle. Pi team runs passed independent checks of actor sessions, task completion and delivered reports/messages. Repository-test pass rates measure generated-code quality separately.

## Available-score means

The parentheses show scored attempts out of the five scheduled attempts. Means exclude unscored evaluations; the full report also shows a separate conservative mean assigning zero to each unscored attempt. Individual unscored results stay N/A.

| Repository | Pi single agent | Pi three agents | OpenHands single agent |
|---|---:|---:|---:|
| jsonlines | 68.15% (5/5) | 74.07% (3/5) | 65.74% (4/5) |
| schedule-master | 32.84% (5/5) | 29.38% (5/5) | 29.88% (5/5) |
| tinydb | 72.65% (5/5) | 67.45% (5/5) | 69.90% (5/5) |

There is no consistent quality improvement from adding agents under this Qwen model, role design and budgets. Single-agent Pi had the highest mean on `schedule-master` and `tinydb`. Three-agent Pi had the highest available-score mean on `jsonlines`, with only three of five evaluations completed. The 1-6-agent sweep has one attempt per cell, so it does not establish a scaling law. Five attempts on three repositories do not establish statistical equivalence or a general conclusion about other models and team designs.

Three-agent Pi used fewer reported tokens than single-agent Pi on these tasks. Read that alongside quality, evaluation completion and the lower-bound usage flag; it was not uniformly cheaper than OpenHands.

## Controls

- Configured context: 262,144 tokens; maximum output per response: 8,192 tokens.
- No cumulative token ceiling; a configured three-hour generation limit for each repository.
- Pi: 200 shared assistant responses across actors. OpenHands: 200 controller iterations. These are different units.
- At most two repository jobs at a time and two active Pi teammates. Agent totals include the lead. Larger teams add configured roles rather than providing unrestricted six-way parallelism.
- The standard three-agent lead/implementer/reviewer strategy is unchanged. Its reviewer starts after implementation. These runs use the harness's configured completion-focused role prompts, not a claim about every possible Pi strategy.
- Runtime, Python adapter, public task text, role prompts and evaluator images were frozen across the cohorts. Within each task the two harnesses used the same specification and evaluator image, with bridge networking and shell egress. Dedicated browser tools were disabled.
- Pi leaves temperature unspecified; the pinned OpenHands baseline uses its default 0. Framework tools, prompts and generation environments differ.
- Pi uses one 2-CPU/4-GiB generation container. OpenHands uses a controller and sandbox container, each limited to 2 CPUs/4 GiB.
- The source fingerprints and immutable image identities are in [results.json](data/results.json). Runs were made from the working tree before the publication commit; match content fingerprints rather than treating the recorded base Git revision as the complete source snapshot.

## Failures and accounting

Two Pi-three-agent `jsonlines` attempts and one OpenHands `jsonlines` attempt generated readers that restarted a finite list iterator on every read. Generation had completed, but evaluation looped indefinitely. Only the confirmed looping evaluator containers were stopped. The reports preserve N/A, interruption evidence, generated-source hashes, all reported usage and the original raw-result hashes. No source repair or replacement generation was performed.

The unchanged evaluator has no per-test timeout and can return a raw zero/completed record when an externally stopped pytest run has no final summary. Such a record is not a completed test score. The report annotations identify the three known interruptions; this is reporting logic, not a new automatic guard in the benchmark runner.

One reviewer response in Pi's final `schedule-master` team run ended with `UND_ERR_SOCKET`. The existing recovery path resumed the same run, which completed at 29/81. The exact remote/network cause is unknown. Its reported 2,294,742 tokens omit unknown provider work from the interrupted response; token totals and means are therefore lower bounds where marked.

Four single-agent Pi `jsonlines` runs retained a recovered-subprocess-OOM warning. Each had a clean container/attach exit and independently verified native completion before grading. Raw OOM flags and original container verdicts remain visible. This policy does not consult test scores or waive a main-process OOM, timeout, invalid trace or incomplete workflow.

## Offline validation for publication

The current source passed 45 Python contracts, 62 Pi SDK mock tests and TypeScript checking. All eight Docker smoke/evaluator profiles passed at 1/1: total agent counts 1-6, an external extension with registered options/startup command, and an uncapped default three-agent team. These are synthetic checks with no live model calls; their usage is not part of the live-result totals.

## Reproduction and publication

See the [integration guide](../../pi-integration.md) for setup, model credentials, team configuration and mock-only verification. The stock OpenHands adapter's defaults differ from the isolated comparison launcher; these tables describe the recorded configurations, not an automatic guarantee that a default `config.json` reproduces them.

Public data contains aggregates, run IDs, counters and content hashes. Private configuration, actual endpoint/key, local absolute paths, generated repositories and raw traces are excluded. CSV copies retain the original score/token values. [verification.json](verification.json) includes source-export checksums, publication checksums and the raw-result hashes used by the completed validation.

The existing evaluator dependency handoff and pytest error-count parsing remain unchanged. Fix its termination/summary handling before relying on a large unattended sweep. These results are integration validation and a small model-specific comparison, not full-benchmark scores.
