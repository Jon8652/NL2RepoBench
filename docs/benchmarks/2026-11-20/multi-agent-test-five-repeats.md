# Multi agent test: five attempts per setup and task

Updated 2026-11-20T09:12:53.214118+00:00. Additional batch: 36/36 finished. Combined data: 45/45 attempts finished. State: finished.

The configurations are Pi single agent, Pi lead plus two teammates (three total), and single-agent OpenHands. Nine attempts from the original 21-run comparison are repeat 1; repeats 2-5 are 36 new generations. Every attempt is retained.

## Average performance

Score averages use completed, available evaluations only. Valid n/5 is shown explicitly; an interrupted or skipped evaluation is unavailable, not silently scored zero. Completed n/5 includes the entire generation/workflow/evaluation attempt. Token means include every finished attempt with recorded usage, including failed attempts. SD is the sample standard deviation in percentage points.

| Task | Setup | Finished /5 | Valid scores /5 | Completed /5 | Mean passed | Available mean score | SD (pp) | Mean reported tokens |
|---|---|---:|---:|---:|---:|---:|---:|---:|
| jsonlines | Pi 1 | 5/5 | 5/5 | 5/5 | 18.40/27 | 68.15% | 6.20 | 5,115,121 |
| jsonlines | Pi 3 | 5/5 | 3/5 | 3/5 | 20.00/27 | 74.07% | 7.41 | 2,896,559 |
| jsonlines | OpenHands | 5/5 | 4/5 | 4/5 | 17.75/27 | 65.74% | 10.64 | 2,718,133 |
| schedule-master | Pi 1 | 5/5 | 5/5 | 5/5 | 26.60/81 | 32.84% | 2.56 | 3,324,875 |
| schedule-master | Pi 3 | 5/5 | 5/5 | 5/5 | 23.80/81 | 29.38% | 5.34 | 2,994,455 + unknown |
| schedule-master | OpenHands | 5/5 | 5/5 | 5/5 | 24.20/81 | 29.88% | 6.20 | 3,471,894 |
| tinydb | Pi 1 | 5/5 | 5/5 | 5/5 | 148.20/204 | 72.65% | 12.85 | 6,421,980 |
| tinydb | Pi 3 | 5/5 | 5/5 | 5/5 | 137.60/204 | 67.45% | 8.84 | 4,900,786 |
| tinydb | OpenHands | 5/5 | 5/5 | 5/5 | 142.60/204 | 69.90% | 5.43 | 4,966,908 |

## Conservative average across finished attempts

This derived comparison assigns zero to each finished attempt without an available completed evaluation. Pending runs are excluded. At completion the denominator is five for every setup/task. The individual unscored rows stay N/A, and the available-score means above retain their original definition. This column is a comparison assumption, not an official benchmark score.

| Task | Setup | Finished /5 | Unscored assumed zero | Conservative mean score |
|---|---|---:|---:|---:|
| jsonlines | Pi 1 | 5/5 | 0 | 68.15% |
| jsonlines | Pi 3 | 5/5 | 2 | 44.44% |
| jsonlines | OpenHands | 5/5 | 1 | 52.59% |
| schedule-master | Pi 1 | 5/5 | 0 | 32.84% |
| schedule-master | Pi 3 | 5/5 | 0 | 29.38% |
| schedule-master | OpenHands | 5/5 | 0 | 29.88% |
| tinydb | Pi 1 | 5/5 | 0 | 72.65% |
| tinydb | Pi 3 | 5/5 | 0 | 67.45% |
| tinydb | OpenHands | 5/5 | 0 | 69.90% |

## jsonlines: individual attempts

| Repeat | Pi 1 score | Pi 1 tokens | Pi 3 score | Pi 3 tokens | OpenHands score | OpenHands tokens |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 17/27 * | 4,026,604 | N/A (interrupted) | 3,288,571 | 22/27 | 2,823,757 |
| 2 | 17/27 * | 6,501,140 | N/A (interrupted) | 5,110,996 | 16/27 | 1,635,941 |
| 3 | 21/27 | 3,205,833 | 20/27 | 2,140,786 | N/A (interrupted) | 3,359,321 |
| 4 | 18/27 * | 3,930,548 | 22/27 | 2,107,658 | 17/27 | 3,035,892 |
| 5 | 19/27 * | 7,911,479 | 18/27 | 1,834,786 | 16/27 | 2,735,754 |

## schedule-master: individual attempts

| Repeat | Pi 1 score | Pi 1 tokens | Pi 3 score | Pi 3 tokens | OpenHands score | OpenHands tokens |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 28/81 | 2,993,467 | 24/81 | 3,799,336 | 27/81 | 2,610,364 |
| 2 | 23/81 | 3,835,744 | 24/81 | 2,128,899 | 29/81 | 3,469,993 |
| 3 | 28/81 | 6,192,019 | 25/81 | 4,571,249 | 27/81 | 7,450,504 |
| 4 | 27/81 | 1,966,496 | 17/81 | 2,178,047 | 17/81 | 1,283,435 |
| 5 | 27/81 | 1,636,650 | 29/81 | 2,294,742 + unknown | 21/81 | 2,545,173 |

## tinydb: individual attempts

| Repeat | Pi 1 score | Pi 1 tokens | Pi 3 score | Pi 3 tokens | OpenHands score | OpenHands tokens |
|---|---:|---:|---:|---:|---:|---:|
| 1 | 165/204 | 2,922,347 | 154/204 | 2,927,488 | 148/204 | 5,040,502 |
| 2 | 102/204 | 9,463,074 | 138/204 | 11,801,493 | 146/204 | 5,472,943 |
| 3 | 162/204 | 11,063,030 | 144/204 | 2,997,413 | 150/204 | 4,854,969 |
| 4 | 153/204 | 3,722,404 | 145/204 | 2,947,170 | 123/204 | 1,996,833 |
| 5 | 159/204 | 4,939,044 | 107/204 | 3,830,368 | 146/204 | 7,469,295 |

## Failures and warnings

- jsonlines / Pi 1 / repeat 1: recovered subprocess OOM warning retained; native completion was verified and the unchanged repository was graded.
- jsonlines / Pi 3 / repeat 1: evaluation interrupted/unscored; confirmed generated-code nontermination.
- jsonlines / Pi 1 / repeat 2: recovered subprocess OOM warning retained; native completion was verified and the unchanged repository was graded.
- jsonlines / Pi 3 / repeat 2: evaluation interrupted/unscored; confirmed generated-code nontermination.
- tinydb / Pi 1 / repeat 2: evaluator reported 61 errors; its pre-existing parsing logic remains unchanged.
- jsonlines / OpenHands / repeat 3: evaluation interrupted/unscored; confirmed generated-code nontermination.
- tinydb / OpenHands / repeat 4: evaluator reported 5 errors; its pre-existing parsing logic remains unchanged.
- jsonlines / Pi 1 / repeat 4: recovered subprocess OOM warning retained; native completion was verified and the unchanged repository was graded.
- jsonlines / Pi 1 / repeat 5: recovered subprocess OOM warning retained; native completion was verified and the unchanged repository was graded.
- schedule-master / Pi 3 / repeat 5: reported usage is a lower bound; unknown provider work is not estimated.
- tinydb / Pi 3 / repeat 5: evaluator reported 61 errors; its pre-existing parsing logic remains unchanged.

### Interrupted evaluation evidence

- jsonlines / Pi 3 / repeat 1: Reader._read_line recreates iter(self._fp) on each read (line 300); finite list input repeats its first element indefinitely. Generated source and evaluator were left unchanged; no replacement model calls.
- jsonlines / Pi 3 / repeat 2: Reader.read creates a new _iter_lines generator at line 282; _iter_lines restarts the finite list/tuple at lines 216-221. Public-API bounded probe with two input lines produced [1,1,1,1] instead of terminating after [1,2]. Generated source and evaluator were left unchanged; no replacement model calls.
- jsonlines / OpenHands / repeat 3: Reader.read recreates iter(self._fp) on each read at line 261; finite lists restart at their first item. Public-API bounded probe with two input lines produced [1,1,1,1] instead of terminating after [1,2]. Generated source and evaluator were left unchanged; no replacement model calls.

### Recovered transport interruptions

- schedule-master / Pi 3 / repeat 5: Stream transport interruption; exact remote/network cause unknown. The existing run resumed and completed. The reviewer response reported UND_ERR_SOCKET. The completed run scored 29/81. Recorded usage is 2,294,742 tokens plus unknown provider work from the interrupted response; token means remain lower bounds.

## Controls and interpretation

- Same configured Qwen/Qwen3.5-397B-A17B-FP8 endpoint, 262144 context, and 8192 output limit. No cumulative token ceiling. Three-hour generation timeout; 200 shared Pi responses or 200 OpenHands controller iterations.
- Two repository jobs run concurrently. Pi permits two active teammates. Pi 1 and Pi 3 configurations and role prompts are byte-identical to their source-cohort profiles; default three-agent logic is unchanged.
- Generation resources: Pi uses one container limited to 2 CPUs and 4 GiB. OpenHands uses separate controller and sandbox containers, each limited to 2 CPUs and 4 GiB.
- Repeats retain each framework's pinned runtime images and dependency setup. Within each task, both harnesses use the same public specification and pinned evaluator image, with the same bridge-network/egress settings. Framework prompts/tools differ. Pi leaves temperature unspecified; OpenHands keeps its default 0.
- Runtime, adapter, evaluator and prompts are frozen throughout. The pre-existing evaluator dependency handoff/output parsing remains unchanged. Confirmed generated-code nontermination is stopped and reported unscored with evidence retained.
- No selective replacement or automatic whole-repository rerun. Original failure evidence and raw evaluator records are retained. The original Pi 3 jsonlines evaluator interruption is not a valid zero score.
- Means over available scores are conditional on evaluation completion. Read them with valid-score counts and completion rates, especially when one setup has fewer than five scores. Five attempts are still a small sample.
- Tokens are accumulated reported usage, including repeated input context and output across all actors; usage and prices not supplied by the provider are not invented.

Total reported tokens in the additional 36-run cohort so far: 153,621,121. Combined 45-attempt dataset: 184,053,557.

## Attempt identifiers

| Task | Setup | Repeat | Status | Run ID |
|---|---|---:|---|---|
| jsonlines | Pi 1 | 1 | completed | jsonlines-pi-1-updated-qwen-10a172a707004c57b2e0b1fab89d7138 |
| jsonlines | Pi 1 | 2 | completed | jsonlines-pi-1-repeat-2-qwen-5c56fc603008464597971fe5e1ef2b1b |
| jsonlines | Pi 1 | 3 | completed | jsonlines-pi-1-repeat-3-qwen-bd2176f699c948c7bf4787c188f6d039 |
| jsonlines | Pi 1 | 4 | completed | jsonlines-pi-1-repeat-4-qwen-53503cb0d46044de9284f574f0b9ea9f |
| jsonlines | Pi 1 | 5 | completed | jsonlines-pi-1-repeat-5-qwen-7d04e311c2884cb587a78a1e6153c5bc |
| jsonlines | Pi 3 | 1 | failed | jsonlines-pi-3-updated-qwen-e40ba9fda87f4901bbfd795e5bff3ece |
| jsonlines | Pi 3 | 2 | failed | jsonlines-pi-3-repeat-2-qwen-d483b8961c294edba770b8f7c23e42c5 |
| jsonlines | Pi 3 | 3 | completed | jsonlines-pi-3-repeat-3-qwen-db0c99f196e54eb8ac0cf2931207840f |
| jsonlines | Pi 3 | 4 | completed | jsonlines-pi-3-repeat-4-qwen-d370520273f547d293607daec558dd93 |
| jsonlines | Pi 3 | 5 | completed | jsonlines-pi-3-repeat-5-qwen-4f735b0ee0e7470bafa05f5bcbcb90f0 |
| jsonlines | OpenHands | 1 | completed | jsonlines-openhands-updated-qwen-d277bc6a05d340dcaceda907602adafb |
| jsonlines | OpenHands | 2 | completed | jsonlines-openhands-repeat-2-qwen-f38faee40a8445a581bd76224fcbb9fa |
| jsonlines | OpenHands | 3 | failed | jsonlines-openhands-repeat-3-qwen-055601a5556a47be88fc5ff2d73fac74 |
| jsonlines | OpenHands | 4 | completed | jsonlines-openhands-repeat-4-qwen-a9de038e1b55457cafd01853e798dfe1 |
| jsonlines | OpenHands | 5 | completed | jsonlines-openhands-repeat-5-qwen-1ef041410f2f4fddb6e6910043fe1916 |
| schedule-master | Pi 1 | 1 | completed | schedule-master-pi-1-updated-qwen-2aac1639b00b4b8bb86fef01349b8438 |
| schedule-master | Pi 1 | 2 | completed | schedule-master-pi-1-repeat-2-qwen-5dd0fd1227a64c02b48a769d894c2374 |
| schedule-master | Pi 1 | 3 | completed | schedule-master-pi-1-repeat-3-qwen-7805c813bf674c08ac31f7de7f54ea3d |
| schedule-master | Pi 1 | 4 | completed | schedule-master-pi-1-repeat-4-qwen-9a25439d740d43bd9947aa94c9614d3d |
| schedule-master | Pi 1 | 5 | completed | schedule-master-pi-1-repeat-5-qwen-c1e7ac7a5e4a4b569e9546d9b09fdd3c |
| schedule-master | Pi 3 | 1 | completed | schedule-master-pi-3-updated-qwen-61c52d17fd2b4f689ca265f9d91edd4b |
| schedule-master | Pi 3 | 2 | completed | schedule-master-pi-3-repeat-2-qwen-5ff1bf539bbf4bdca82b3bf987d95e46 |
| schedule-master | Pi 3 | 3 | completed | schedule-master-pi-3-repeat-3-qwen-ff6d5c7bfbb143b99e7e6ff6e4f8cf5e |
| schedule-master | Pi 3 | 4 | completed | schedule-master-pi-3-repeat-4-qwen-50356b59fb954febaa99b55e6e741f42 |
| schedule-master | Pi 3 | 5 | completed | schedule-master-pi-3-repeat-5-qwen-9d877da0b55b41dea7d53b350a6a35c5 |
| schedule-master | OpenHands | 1 | completed | schedule-master-openhands-updated-qwen-f9f00851e4914e10b589a79167f2896c |
| schedule-master | OpenHands | 2 | completed | schedule-master-openhands-repeat-2-qwen-e02338e5a11e47bd87d6267bee3104b5 |
| schedule-master | OpenHands | 3 | completed | schedule-master-openhands-repeat-3-qwen-f72fc79465ac40b09d2de416b6a7f224 |
| schedule-master | OpenHands | 4 | completed | schedule-master-openhands-repeat-4-qwen-23fa3257a5e14482b90bdb6746bbe080 |
| schedule-master | OpenHands | 5 | completed | schedule-master-openhands-repeat-5-qwen-aa513bbec3f84722a2cab1a6ea3b6678 |
| tinydb | Pi 1 | 1 | completed | tinydb-pi-1-updated-qwen-2fd4df100c074939b2c1b22130f5f2f9 |
| tinydb | Pi 1 | 2 | completed | tinydb-pi-1-repeat-2-qwen-371cf18a6aa54072afefc678bc6d8a6b |
| tinydb | Pi 1 | 3 | completed | tinydb-pi-1-repeat-3-qwen-21ec217f65914fdba86ddc375374c3c5 |
| tinydb | Pi 1 | 4 | completed | tinydb-pi-1-repeat-4-qwen-fc2a2fa4b9d54b29968c82143374a000 |
| tinydb | Pi 1 | 5 | completed | tinydb-pi-1-repeat-5-qwen-12123f78d35248c6a0b7bbfc116123c7 |
| tinydb | Pi 3 | 1 | completed | tinydb-pi-3-updated-qwen-26c939ad17314f98b456615ddf0bf282 |
| tinydb | Pi 3 | 2 | completed | tinydb-pi-3-repeat-2-qwen-00df79238b8e4aee9d55cfa4236765a1 |
| tinydb | Pi 3 | 3 | completed | tinydb-pi-3-repeat-3-qwen-3a72ec2a6cfa4d229a87eae7dbc04a01 |
| tinydb | Pi 3 | 4 | completed | tinydb-pi-3-repeat-4-qwen-26da05fd968746afbaa6dd7f2d3edfc9 |
| tinydb | Pi 3 | 5 | completed | tinydb-pi-3-repeat-5-qwen-4928eff262664995a28857f1e6d9f53e |
| tinydb | OpenHands | 1 | completed | tinydb-openhands-updated-qwen-1896d6453bc8453baf3a9a19b4eec9f2 |
| tinydb | OpenHands | 2 | completed | tinydb-openhands-repeat-2-qwen-e751009643624cb3886382d0df929002 |
| tinydb | OpenHands | 3 | completed | tinydb-openhands-repeat-3-qwen-7f98960e13884646b579271e5d61ef5a |
| tinydb | OpenHands | 4 | completed | tinydb-openhands-repeat-4-qwen-05739aac42a84904ab94ec9b658b4b2b |
| tinydb | OpenHands | 5 | completed | tinydb-openhands-repeat-5-qwen-cf556045c4a6483ba97ae408b1665815 |

## Supporting data

[All 45 attempts](data/repeated-attempts.csv), [nine summary cells](data/repeated-averages.csv), [JSON snapshot](data/results.json), and [publication verification](verification.json). See the [study overview](README.md) for scope and limitations. Raw repositories, logs and native sessions remain local.
