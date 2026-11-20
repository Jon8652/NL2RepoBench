# Multi agent test: Pi 1-6 and OpenHands

All 21 authorized generation attempts are finished: 20 available repository scores, 1 interrupted/unscored evaluation, and 60,493,753 reported tokens across all attempts.

The unscored Pi 3 jsonlines attempt completed generation and team workflow, but its generated Reader repeatedly restarts a list iterator. The proven infinite evaluation loop was stopped, with original source, raw evaluator output and interruption evidence retained. Its raw legacy zero is not a valid finished score. Pi 1 jsonlines also has a verified recovered subprocess OOM warning; its unchanged repository was graded normally.

Updated: 2026-11-19T23:47:11.042471+00:00. State: finished. Finished: 21/21. Active jobs: 0/2.

Each Pi count includes the lead. OpenHands uses one CodeAct agent.

## Repository test results

| Harness | jsonlines /27 | schedule-master /81 | tinydb /204 |
|---|---:|---:|---:|
| Pi 1 | 17/27 (62.96%) * | 28/81 (34.57%) | 165/204 (80.88%) |
| Pi 2 | 20/27 (74.07%) | 21/81 (25.93%) | 148/204 (72.55%) |
| Pi 3 | N/A (failed/skipped) | 24/81 (29.63%) | 154/204 (75.49%) |
| Pi 4 | 18/27 (66.67%) | 25/81 (30.86%) | 153/204 (75.00%) |
| Pi 5 | 20/27 (74.07%) | 17/81 (20.99%) | 162/204 (79.41%) |
| Pi 6 | 21/27 (77.78%) | 17/81 (20.99%) | 107/204 (52.45%) |
| OpenHands | 22/27 (81.48%) | 27/81 (33.33%) | 148/204 (72.55%) |

## Reported total tokens

| Harness | jsonlines | schedule-master | tinydb | Total finished attempts |
|---|---:|---:|---:|---:|
| Pi 1 | 4,026,604 | 2,993,467 | 2,922,347 | 9,942,418 |
| Pi 2 | 5,350,913 | 336,466 | 2,136,277 | 7,823,656 |
| Pi 3 | 3,288,571 | 3,799,336 | 2,927,488 | 10,015,395 |
| Pi 4 | 3,278,134 | 1,090,317 | 4,111,606 | 8,480,057 |
| Pi 5 | 2,109,423 | 858,206 | 3,935,740 | 6,903,369 |
| Pi 6 | 2,013,668 | 662,238 | 4,178,329 | 6,854,235 |
| OpenHands | 2,823,757 | 2,610,364 | 5,040,502 | 10,474,623 |

* Recovered subprocess OOM warning retained; native agent/runtime completion was verified. † Generation/workflow/evaluation failure remains visible; any displayed test score does not imply a successful workflow.

## Execution status

| Repository | Harness | Generation | Team | Evaluation |
|---|---|---|---|---|
| jsonlines | Pi 1 | completed | not_applicable | completed |
| jsonlines | Pi 2 | completed | completed | completed |
| jsonlines | Pi 3 | completed | completed | interrupted |
| jsonlines | Pi 4 | completed | completed | completed |
| jsonlines | Pi 5 | completed | completed | completed |
| jsonlines | Pi 6 | completed | completed | completed |
| jsonlines | OpenHands | completed | not_applicable | completed |
| schedule-master | Pi 1 | completed | not_applicable | completed |
| schedule-master | Pi 2 | completed | completed | completed |
| schedule-master | Pi 3 | completed | completed | completed |
| schedule-master | Pi 4 | completed | completed | completed |
| schedule-master | Pi 5 | completed | completed | completed |
| schedule-master | Pi 6 | completed | completed | completed |
| schedule-master | OpenHands | completed | not_applicable | completed |
| tinydb | Pi 1 | completed | not_applicable | completed |
| tinydb | Pi 2 | completed | completed | completed |
| tinydb | Pi 3 | completed | completed | completed |
| tinydb | Pi 4 | completed | completed | completed |
| tinydb | Pi 5 | completed | completed | completed |
| tinydb | Pi 6 | completed | completed | completed |
| tinydb | OpenHands | completed | not_applicable | completed |

## Controls and interpretation

- One fresh generation attempt per task/configuration; all attempts retained, with no paid automatic reruns.
- Same Qwen endpoint, task text and evaluator base within each repository; framework tools, prompts and runtime images differ.
- Pi's default three-agent role prompts and scheduling are unchanged. Four-to-six-agent roles partition source/support work; schedule-specific role scopes use only its public specification.
- Pi has 200 shared responses; OpenHands has 200 controller iterations. These are different units. Both have a 3-hour generation limit and no cumulative token cap.
- Pi does not explicitly set temperature; OpenHands retains its default temperature 0.
- The shared evaluator dependency handoff and output parsing remain unchanged. Reported error counts are the original evaluator values.
- Verified recovered subprocess OOMs remain visible warnings. Genuine process/runtime/workflow failures remain visible alongside any available test results.
- Confirmed generated-code nonterminating evaluations are stopped and labelled interrupted/unscored. Raw evaluator outputs and operator-interruption evidence are retained; no source repair, grader modification, or paid replacement run is performed.
- Reported usage may omit provider work from interrupted requests; unknown amounts and prices are not invented.
- Two repository jobs run concurrently; timing can be affected by shared endpoint load.

Generation resources: Pi uses one container limited to 2 CPUs and 4 GiB. OpenHands uses separate controller and sandbox containers, each limited to 2 CPUs and 4 GiB. Every attempt uses a fresh workspace.

## Attempt identifiers

| Repository | Harness | Run ID |
|---|---|---|
| jsonlines | Pi 1 | jsonlines-pi-1-updated-qwen-10a172a707004c57b2e0b1fab89d7138 |
| jsonlines | Pi 2 | jsonlines-pi-2-updated-qwen-fff065ccb85c4cf693c9dce5cbbc0d65 |
| jsonlines | Pi 3 | jsonlines-pi-3-updated-qwen-e40ba9fda87f4901bbfd795e5bff3ece |
| jsonlines | Pi 4 | jsonlines-pi-4-updated-qwen-7f5c085fb2044a09871d232f2c4c648f |
| jsonlines | Pi 5 | jsonlines-pi-5-updated-qwen-ba474273455c4281b3f15f0e11f53522 |
| jsonlines | Pi 6 | jsonlines-pi-6-updated-qwen-8212a10065a241b799866dff598c960b |
| jsonlines | OpenHands | jsonlines-openhands-updated-qwen-d277bc6a05d340dcaceda907602adafb |
| schedule-master | Pi 1 | schedule-master-pi-1-updated-qwen-2aac1639b00b4b8bb86fef01349b8438 |
| schedule-master | Pi 2 | schedule-master-pi-2-updated-qwen-4a7d456dbe764a8199d9b786b32b646f |
| schedule-master | Pi 3 | schedule-master-pi-3-updated-qwen-61c52d17fd2b4f689ca265f9d91edd4b |
| schedule-master | Pi 4 | schedule-master-pi-4-updated-qwen-eab525ebae954129b8d27eef7e481a69 |
| schedule-master | Pi 5 | schedule-master-pi-5-updated-qwen-4a5e4bea81a94050a1975326f4d29a4b |
| schedule-master | Pi 6 | schedule-master-pi-6-updated-qwen-9460e10ce01d438995611b3804a8a215 |
| schedule-master | OpenHands | schedule-master-openhands-updated-qwen-f9f00851e4914e10b589a79167f2896c |
| tinydb | Pi 1 | tinydb-pi-1-updated-qwen-2fd4df100c074939b2c1b22130f5f2f9 |
| tinydb | Pi 2 | tinydb-pi-2-updated-qwen-788ca885e7d44f41a3407a92d0472310 |
| tinydb | Pi 3 | tinydb-pi-3-updated-qwen-26c939ad17314f98b456615ddf0bf282 |
| tinydb | Pi 4 | tinydb-pi-4-updated-qwen-cfd0a8f677894ac4b1fc54936b2e53dd |
| tinydb | Pi 5 | tinydb-pi-5-updated-qwen-0e01fd26140545fa9ac1138bb011a19f |
| tinydb | Pi 6 | tinydb-pi-6-updated-qwen-2831a3dc50fa4708a0ea2591c7c9f710 |
| tinydb | OpenHands | tinydb-openhands-updated-qwen-1896d6453bc8453baf3a9a19b4eec9f2 |

## Recorded data and validation

- Detailed results: [comparison CSV](data/initial-sweep.csv), [per-actor usage](data/initial-per-actor.csv), and [comparison JSON](data/results.json).
- [Publication verification](verification.json) records the frozen-control/native-usage checks and retained raw-result hashes. The [JSON snapshot](data/results.json) contains both cohorts without local paths or credentials. One attempt per task/setup does not establish a stable ranking; the separate repeat study measures variability for Pi 1, Pi 3 and OpenHands.

Publication snapshot: [study overview](README.md). Raw repositories, logs and native sessions remain local; aggregate values and run IDs are preserved.
