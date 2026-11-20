"""Run Pi in one isolated container per benchmark task."""

import json
import os
import shutil
import subprocess
from functools import partial
from pathlib import Path

from docker_self.batch_container import docker_command, run_batch_container
from runner import Job, evaluate_result, evaluation_enabled, model_tasks, new_run_id, positive_int, run_batch
from .config import resolve_model, resolve_options, write_runtime_config
from .session_summary import summarize_run
from .provenance import runtime_fingerprint


def _image_info(image):
    try:
        data = json.loads(docker_command(["image", "inspect", image], stdout=subprocess.PIPE,
                                        stderr=subprocess.PIPE, timeout=30).stdout)[0]
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        raise RuntimeError("Build the Pi image first: python scripts/build_pi.py") from exc
    labels = data["Config"].get("Labels") or {}
    if labels.get("org.nl2repobench.pi-version") != "1.5.2":
        raise ValueError("Pi image must declare the pinned Pi version 1.5.2")
    if labels.get("org.nl2repobench.runtime-sha256") != runtime_fingerprint():
        raise ValueError("Pi image is stale; rebuild with python scripts/build_pi.py")
    return {"tag": image, "id": data["Id"], "digests": data.get("RepoDigests", []), "labels": labels}



def _recovered_subprocess_oom(result, summary, options):
    """Verify a clean Pi completion despite Docker's sticky earlier OOM flag.

    Never infer recovery from repository tests or waive another failure. The shared
    lifecycle helper remains conservative for backends without Pi's native proof.
    """
    state = result.get("container_state")
    if (result.get("generation_status") != "failed" or result.get("oom_killed") is not True
            or result.get("error") != "Container was killed by the out-of-memory killer"
            or result.get("cleanup_error") or not isinstance(state, dict)):
        return False
    if (state.get("Status") != "exited" or state.get("Running") is not False
            or state.get("Dead") or state.get("Paused") or state.get("Restarting")
            or state.get("OOMKilled") is not True or state.get("Error") != ""):
        return False
    if any(type(code) is not int or code != 0 for code in
           (result.get("exit_code"), result.get("attach_exit_code"), state.get("ExitCode"))):
        return False
    if (summary.get("runtime_generation_status") != "completed"
            or summary.get("extension_status") != "loaded"
            or any(summary.get(key) for key in ("runtime_error", "budget_error", "role_budget_errors", "trace_errors"))):
        return False

    actors = summary.get("actors")
    expected = options["teammates"] + 1 if options["profile"] == "team" else 1
    if not isinstance(actors, list) or len(actors) != expected:
        return False
    if any(not isinstance(actor, dict) or actor.get("settled") is not True
           or actor.get("last_stop_reason") not in ("stop", "toolUse") or actor.get("errors")
           or not isinstance(actor.get("id"), str) or not actor["id"] for actor in actors):
        return False
    names = {actor["id"] for actor in actors}
    if len(names) != len(actors) or "lead" not in names:
        return False
    team = summary.get("team") or {}
    if not isinstance(team, dict):
        return False
    expected_workflow = ("not_applicable" if options["profile"] == "single" else
                         "not_checked" if options["workflow_validation"] == "off" else "completed")
    return team.get("status") == expected_workflow and not team.get("errors")

def _run_task(run_id, test_data, model, secret_env, options, image, evaluate):
    run_dir = Path("workspaces").resolve() / run_id
    workspace = run_dir / "workspace"
    workspace.mkdir(parents=True)
    shutil.copyfile(test_data.md, workspace / "start.md")
    for name in ("pi-home", "artifacts", "home"):
        (run_dir / name).mkdir()
    config_path = write_runtime_config(options, model, run_dir)
    arguments = ["--init", "--user", f"{os.getuid()}:{os.getgid()}",
                 "--cpus", str(options["cpus"]), "--memory", options["memory"],
                 "--pids-limit", str(options["pids_limit"]), "--cap-drop", "ALL",
                 "--security-opt", "no-new-privileges", "--env", "HOME=/run-home",
                 "--env", "PI_CODING_AGENT_DIR=/pi-home", "--env", "PI_OFFLINE=1",
                 "--env", "NL2REPO_MODEL_API_KEY", "--add-host", "host.docker.internal:host-gateway"]
    if options["mock"]:
        arguments += ["--network", "none"]
    for source, target, mode in [(workspace, "/workspace", "rw"), (run_dir / "pi-home", "/pi-home", "rw"),
                                 (run_dir / "artifacts", "/artifacts", "rw"), (run_dir / "home", "/run-home", "rw"),
                                 (run_dir / "resources", "/resources", "ro"), (config_path, "/runtime.json", "ro")]:
        arguments += ["--mount", f"type=bind,source={source},target={target}" + (",readonly" if mode == "ro" else "")]
    arguments += [image["id"], "/runtime.json"]
    result = run_batch_container(arguments, "pi-" + run_id, run_dir, options["task_timeout_seconds"],
                                 env=dict(os.environ, **secret_env))
    summary = summarize_run(run_dir / "artifacts", options)
    recovered_oom = _recovered_subprocess_oom(result, summary, options)
    result["container_generation_status"] = result["generation_status"]
    result["recovered_subprocess_oom"] = recovered_oom
    if recovered_oom:
        result["generation_status"] = "completed"
        result["container_error"] = result.pop("error")
        result.setdefault("warnings", []).append(
            "Recovered subprocess OOM: Docker recorded an earlier OOM event, but the container and "
            "attach exited 0 and Pi's native runtime, actor sessions and configured workflow checks completed. "
            "The OOM flag and original container verdict are retained.")
    result.update(summary, task_uuid=run_id, workspace_path=str(workspace), config_path=str(config_path), image=image)
    if result.get("runtime_generation_status") != "completed" and result["generation_status"] == "completed":
        result["generation_status"] = "failed"
    if result["generation_status"] != "timeout" and result.get("runtime_generation_status") in ("timeout", "cancelled"):
        result["generation_status"] = result["runtime_generation_status"]
    result["stop_reason"] = {"timeout": "runtime_limit", "cancelled": "termination_signal",
                             "completed": "completed"}.get(result["generation_status"], "generation_failed")
    result["status"] = "completed" if result["generation_status"] == "completed" else "failed"
    team = result.get("team")
    if result.get("cleanup_error") or (options["workflow_validation"] == "required" and
                                       (not isinstance(team, dict) or team.get("status") == "incomplete")):
        result["status"] = "failed"
    return evaluate_result(result, test_data, evaluate)


def start_pi(config):
    options = resolve_options(config)
    pool = positive_int(config.get("max_pool_size", 1), "max_pool_size")
    evaluate = evaluation_enabled(config)
    specifications = [(task, *resolve_model(entry, options["mock"])) for entry, _, task in model_tasks(config)]
    image = _image_info(options["image"])
    jobs = []
    for task, model, secret in specifications:
        run_id = new_run_id(task.proName, model["id"])
        jobs.append(Job(run_id, "pi", model["id"], task.proName,
                        partial(_run_task, run_id, task, model, secret, options, image, evaluate)))
    return run_batch(jobs, pool)
