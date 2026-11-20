# NL2RepoBench

NL2RepoBench evaluates coding agents on **104 tasks**, each requiring a complete, runnable repository to be generated from a natural-language specification. Each task has an isolated Docker evaluation image containing the original repository tests.

This fork integrates the **Pi coding agent**, including headless ExtensionAPI support and a lead with two persistent teammates, alongside the existing OpenHands backend. Both use the same task definitions and evaluator; the scoring rules are unchanged.

## Supported backends

| Backend | Runtime | Agent setup |
|---|---|---|
| Pi | `@earendil-works/pi-coding-agent@1.5.2` | Single agent, or a lead with configurable teammates and extensions |
| OpenHands | OpenHands 0.56 | Existing headless CodeAct agent; this adapter exposes no Pi-style team setting |

Select a backend with `backend` in the JSON configuration or the `--backend` CLI option. Configurations without a backend continue to use OpenHands.

## Requirements

- Linux amd64, or Ubuntu under WSL 2. The validated Windows setup uses Docker Desktop with its Linux engine and Ubuntu integration enabled. Other CPU architectures are not validated; the generation image currently includes an x86-64 fd binary.
- Python 3.12 and Docker accessible from the same Linux/WSL user without `sudo`.
- For WSL, keep the checkout in the Linux filesystem, such as `~/projects/NL2RepoBench`.
- Network access for initial image/dependency downloads. Live Pi runs also need a model endpoint that supports the selected protocol and tool calls.

Node.js and npm run inside pinned Docker images for the Pi build and tests; a host Node.js installation is unnecessary. Run the commands below from the repository root in Linux/WSL.

## Pi setup and mock verification

Create a virtual environment and build the Pi image:

```bash
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python scripts/build_pi.py
```

Verify the integration without a model endpoint or key:

```bash
python scripts/test_pi.py
python scripts/smoke_pi.py --evaluate-fixture
```

The test script runs Python contracts, TypeScript checking, and real Pi SDK sessions against a local scripted model. The smoke script checks eight Docker/evaluator profiles: total agent counts 1-6, an external extension with flags and a startup command, and an uncapped default three-agent team. Mock generation containers use `--network none`; these checks make no real-model requests. Initial image/dependency downloads can still need network access.

To run just the team generation fixture:

```bash
python main.py --config config.pi.mock.team.json --task-root tests/fixtures
```

Rebuild the Pi image after changing runtime source or dependencies. The runner checks its version and source fingerprint before generation.

## Run one repository with Pi

Start with a local configuration and supply credentials through the environment:

```bash
cp config.pi.example.json config.pi.local.json
chmod 600 config.pi.local.json
export NL2REPO_API_KEY="YOUR_API_KEY"
export NL2REPO_BASE_URL="https://YOUR_ENDPOINT/v1"
```

Edit `config.pi.local.json` with the endpoint's exact model ID, context window, and per-response output limit. A nonempty `baseUrl` in the model entry takes precedence over `NL2REPO_BASE_URL`. `apiKeyEnv` names the environment variable holding the key. Local `.env` files are not loaded automatically; source one in the launching shell if you use it.

The checked-in example is a limited pilot: generation only, a 50,000-token shared cap, 60 responses, and a 900-second deadline. A full repository can require substantially more usage. The following **one-repository team example disables total-token stopping**, enables evaluation, and retains time and response safeguards. Replace `null` with a positive integer to impose a shared cumulative token ceiling.

```json
{
  "backend": "pi",
  "evaluate": true,
  "max_pool_size": 1,
  "pi": {
    "profile": "team",
    "mock": false,
    "teammates": 2,
    "max_active_teammates": 2,
    "task_timeout_seconds": 10800,
    "max_total_tokens": null,
    "max_turns": 200,
    "workflow_validation": "required",
    "python_packages": ["attrs==25.4.0", "pytest==8.4.2"]
  },
  "startPro": [
    {
      "moduleName": "YOUR_EXACT_MODEL_ID",
      "protocol": "openai-completions",
      "baseUrl": "",
      "apiKeyEnv": "NL2REPO_API_KEY",
      "contextWindow": 262144,
      "maxTokens": 8192,
      "reasoning": false,
      "proNameList": ["jsonlines"]
    }
  ]
}
```

The `contextWindow` and `maxTokens` values above are examples; set them for your model and endpoint. `python_packages` installs exact dependency pins before model calls; these pins were used for the `jsonlines` validation and can be changed for other tasks.

Launch the selected task:

```bash
python main.py --config config.pi.local.json
```

This creates **one repository**, runs the agent workflow, and then evaluates its output. For generation only, set `evaluate` to `false` or pass `--skip-evaluation`.

Supported Pi transports are `openai-completions` (OpenAI-compatible Chat Completions), `openai-responses`, and `anthropic-messages`. Configure reasoning and compatibility options for the endpoint in use; see the [Pi integration guide](docs/pi-integration.md).

### Configuration controls

| Setting | Meaning |
|---|---|
| `startPro[].proNameList` | Selected task directories under `test_files`; `jsonlines` selects one repository |
| `max_pool_size` | Concurrent benchmark jobs, independent of teammate count |
| `pi.profile` | `team` for the lead and teammates, or `single` for the lead alone |
| `pi.teammates` | Teammates excluding the lead; minimum one. Defaults to the explicit role count, or two without custom roles |
| `pi.max_active_teammates` | Maximum concurrently active teammates |
| `pi.max_total_tokens` | Shared cumulative usage across all actors and responses; `null` disables token stopping |
| `pi.max_turns` / `pi.task_timeout_seconds` | Shared response limit and task deadline |
| `pi.workflow_validation` | `off`, `report`, or `required`; required validation rejects incomplete teamwork |
| `startPro[].contextWindow` / `maxTokens` | Per-request model context and output settings, separate from cumulative usage |

Token ceilings are checked at response boundaries; in-flight responses can overshoot. Native Pi history is the default, and batched file writes are enabled. Role token allocations are optional and advisory unless strict enforcement is explicitly enabled. See the guide for role definitions, dependencies, resource limits, and budget settings.

## Teams and ExtensionAPI

The default team consists of a **lead, implementer, and reviewer** using the selected model. They share the generated repository while retaining separate persistent conversations and session files. The implementer hands off its work before the reviewer begins; the lead collects both reports. The bundled extension provides delegation, peer messaging, a task board, blocking waits, and explicit teammate completion. Required workflow validation checks the recorded reports, tasks, sessions, and message delivery separately from code quality.

Use `pi.profile: "single"` for a single-agent baseline. Set `pi.teammates: 1` for two total agents: the implementer produces the repository and the lead handles review after its report. The default three-agent roles, prompts, dependency handoff and completion logic are preserved.

For larger teams, provide named `roles` with either an inline `prompt` or a `prompt_file` and optional `tools` / `start_after` dependencies. If `teammates` is omitted, it is inferred from the role count. `lead_prompt` or `lead_prompt_file` customizes lead responsibilities in either profile. Use one role per teammate for a straightforward fixed team; role names are arbitrary, and dependent roles can wait for multiple prerequisites.

Mock examples are available for [two agents](config.pi.mock.two-agent.json) and [four agents](config.pi.mock.large-team.json). The smoke suite covers total agent counts 1-6; the [current live validation](docs/benchmarks/2026-11-20/README.md) also exercised all six sizes. See [team sizes and custom prompts](docs/pi-integration.md#team-sizes-and-custom-prompts) for configuration details.

Custom extensions can register tools, event hooks, flags, and noninteractive commands through Pi's public ExtensionAPI. For example, add these fields to the `pi` object, replacing the extension path and options with your own:

```json
{
  "extensions": [{"path": "./extensions/my-mode", "scope": "all"}],
  "extension_options": {"my-registered-flag": true},
  "startup_commands": ["/my-mode"]
}
```

Extension paths resolve relative to the configuration file; scopes are `lead`, `members`, or `all`. Dependency-bearing extensions can be prepared with `python scripts/prepare_pi_extension.py ./extensions/my-mode`. The host is headless: interactive TUI widgets and dialogs are unavailable, and session-replacement commands are unsupported. See [extension loading and supported capabilities](docs/pi-integration.md#custom-extensions) for packaging details.

## Results and saved repositories

```text
test_files/<task>/                 Task specification and evaluation metadata
workspaces/<run-id>/workspace/     Generated repository and start.md
workspaces/<run-id>/artifacts/     Pi manifest, usage, team events, and sessions
workspaces/<run-id>/evaluation/    Separate evaluator copies and test logs
result/<run-id>.json               Aggregated result for one job
```

Each job receives a unique run ID. Pi results distinguish generation, extension loading, team workflow, and evaluation status. **Normal completion does not require all repository tests to pass.** `score` and `test_score` contain the number of passed tests, not a percentage; `post_process_result.pytest_results` contains the counts used to calculate the pass rate. Skipped evaluation has a null score.

The evaluator operates on a fresh copy so the original generated repository is preserved. Re-evaluate a completed saved run without calling a model, replacing `YOUR_RUN_ID` with its result identifier:

```bash
python only_test.py --run-id YOUR_RUN_ID
```

Diagnostic evaluation of failed/incomplete generation requires `--allow-incomplete` and preserves its failure status. The local Pi config (`config.pi.local.json`), `.env` files, generated repositories, logs, and results are ignored by Git.

## OpenHands compatibility

Existing `config.json` model/task configurations remain supported:

```bash
python main.py --backend openhands --config config.json
```

The adapter uses `template/config.template.toml` for its agent and sandbox settings. It fills the benchmark model group from `moduleName`, `baseUrl`/`base_url`, and `apiKeyEnv` or legacy `sk`. Use environment variables for credentials where possible.

The original image references use `docker.all-hands.dev`. In the recorded comparison that hostname did not resolve, so the official OpenHands 0.56 images were obtained from GHCR:

- `ghcr.io/all-hands-ai/openhands:0.56`
- `ghcr.io/all-hands-ai/runtime:0.56-nikolaik`

For the standard adapter, changing registries requires updating `APP_IMAGE` and `RUNTIME_IMAGE` in `openhands/openhands_app.py`. The [comparison report](docs/openhands-pi-jsonlines-comparison.md) records the immutable digests and isolated driver used to match model limits, retain trajectories, and disable browser tools. The standard OpenHands template otherwise enables browsing; live Pi has shell network access but no dedicated browser tool by default.

## Verified integration results

As of **20 November 2026**, the current source passed **45 Python contract tests, 62 Pi SDK mock tests, and TypeScript checking**. A source-only publication check excluded local credentials and run artifacts while reusing the pinned installed Node dependencies read-only.

All eight offline Docker smoke/evaluator profiles also passed at **1/1** using synthetic responses; no live model calls were made during publication preparation.

The current live validation used `Qwen/Qwen3.5-397B-A17B-FP8` on `jsonlines`, `schedule-master` and `tinydb`:

- The [21-run sweep](docs/benchmarks/2026-11-20/multi-agent-test.md) covers Pi with 1-6 total agents and single-agent OpenHands once per repository.
- The [five-attempt study](docs/benchmarks/2026-11-20/multi-agent-test-five-repeats.md) contains 45 records for Pi single agent, Pi three agents and OpenHands. Nine are selected baselines from the sweep; 36 are new generations.
- Across both reports, **57 unique live generations completed their native agent lifecycle**, and Pi team workflows passed independent validation. **54 evaluations produced scores; three were interrupted/unscored** after confirmed infinite loops in generated code.

These are available-evaluation mean pass rates. Parentheses show scored attempts out of five; the detailed report also shows a separate conservative mean assigning zero to unscored attempts without changing the original records.

| Repository | Pi single agent | Pi three agents | OpenHands single agent |
|---|---:|---:|---:|
| jsonlines | 68.15% (5/5) | 74.07% (3/5) | 65.74% (4/5) |
| schedule-master | 32.84% (5/5) | 29.38% (5/5) | 29.88% (5/5) |
| tinydb | 72.65% (5/5) | 67.45% (5/5) | 69.90% (5/5) |

There was no consistent quality advantage from adding agents under this model, role design and budgets. Single-agent Pi had the highest mean on two tasks; Pi three-agent's higher available mean on `jsonlines` uses only three scored attempts. The exploratory 1-6-agent sweep has one attempt per cell. These small samples do not establish equivalence or general performance on the full benchmark.

Reported tokens include repeated input context and all actors. One recovered streamed-response disconnect leaves Pi three-agent `schedule-master` usage and its token mean as lower bounds. Four single-agent `jsonlines` runs retained verified recovered-subprocess-OOM warnings; their repositories were graded normally. Unknown usage and prices are not invented.

See the [study overview, controls and portable data](docs/benchmarks/2026-11-20/README.md) for all individual results, average token usage, variability, image/source hashes and retained issues. Configured limits were a 262,144-token context, 8,192-token output maximum, no cumulative token ceiling, three hours per generation, and 200 shared Pi responses or OpenHands controller iterations. Those response/iteration units differ.

## Evaluator limitations

The shared evaluator's scoring rules remain unchanged. It has no per-test timeout, so nonterminating generated code can hang grading. A manually stopped pytest run can leave a raw zero/completed record without a final summary; the published comparisons retain the known cases as interrupted/unscored. This annotation is not an automatic feature of the normal runner.

Dependency-file removal before evaluation and legacy collection-error parsing also remain unchanged. Keep generation/workflow status separate from code quality, and address evaluator termination/summary handling before a large unattended sweep.

## Further documentation

- [Pi setup, configuration, extensions, and artifacts](docs/pi-integration.md)
- [Current validation and five-attempt results](docs/benchmarks/2026-11-20/README.md)
- [Historical mock validation and development record](docs/pi-validation.md)
- [Historical first completed Pi repository](docs/pi-one-repository-validation.md)
- [Historical first OpenHands/Pi comparison](docs/openhands-pi-jsonlines-comparison.md)
