import json
import os
import tempfile
import unittest
import copy
import subprocess
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from pi_agent.config import resolve_model, resolve_options
from pi_agent.runner import _run_task, start_pi
from test_data_service import test_data_list


class PiRunnerTests(unittest.TestCase):
    def test_mock_container_has_no_network_no_socket_and_only_explicit_mounts(self):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path.cwd()
            os.chdir(tmp)
            try:
                prompt = Path(tmp) / "task.md"
                prompt.write_text("fixture")
                options = resolve_options({"pi": {"mock": True}})
                model, env = resolve_model({"moduleName": "mock"}, True)
                with patch("pi_agent.runner.run_batch_container", return_value={"generation_status": "completed"}) as run, patch("pi_agent.runner.summarize_run", return_value={"runtime_generation_status": "completed", "team": {"status": "completed"}}):
                    result = _run_task("fixture", SimpleNamespace(md=prompt), model, env, options, {"id": "image-id"}, False)
                args = run.call_args.args[0]
                self.assertEqual(args[args.index("--network") + 1], "none")
                self.assertNotIn("docker.sock", " ".join(args))
                self.assertNotIn("test_files", " ".join(args))
                self.assertIn("NL2REPO_MODEL_API_KEY", args)
                self.assertNotIn("mock-not-a-secret", args)
                self.assertEqual(result["status"], "completed")
                self.assertIsNone(result["score"])
                runtime = json.loads(Path(result["config_path"]).read_text())
                self.assertEqual(runtime["teammates"], 2)
            finally:
                os.chdir(original)

    def test_host_timeout_wins_over_child_cancellation_or_missing_summary(self):
        for runtime_status in ("cancelled", "timeout", "error", "completed"):
            with self.subTest(runtime_status=runtime_status), tempfile.TemporaryDirectory() as tmp:
                original = Path.cwd()
                os.chdir(tmp)
                try:
                    prompt = Path(tmp) / "task.md"
                    prompt.write_text("fixture")
                    options = resolve_options({"pi": {"mock": True}})
                    model, env = resolve_model({"moduleName": "mock"}, True)
                    outer = {"generation_status": "timeout", "error": "Generation exceeded 1 seconds"}
                    summary = {"runtime_generation_status": runtime_status, "team": {"status": "incomplete"}}
                    with patch("pi_agent.runner.run_batch_container", return_value=outer), patch("pi_agent.runner.summarize_run", return_value=summary):
                        result = _run_task("timeout-fixture", SimpleNamespace(md=prompt), model, env, options, {"id": "image"}, False)
                    self.assertEqual(result["generation_status"], "timeout")
                    self.assertEqual(result["stop_reason"], "runtime_limit")
                    self.assertEqual(result["runtime_generation_status"], runtime_status)
                    self.assertEqual(result["status"], "failed")
                    self.assertEqual(result["evaluation_status"], "skipped")
                finally:
                    os.chdir(original)

    def test_every_model_is_validated_before_any_docker_work(self):
        with tempfile.TemporaryDirectory() as tmp:
            prompt = Path(tmp) / "start.md"
            prompt.write_text("fixture")
            original = list(test_data_list)
            test_data_list[:] = [SimpleNamespace(proName="fixture", md=prompt, pyTestFileList=[])]
            try:
                config = {"startPro": [{"moduleName": "model", "baseUrl": "https://model.invalid/v1", "sk": "test", "proNameList": ["fixture"]}, {"moduleName": "other", "proNameList": ["fixture"]}]}
                with patch("pi_agent.runner._image_info") as image, self.assertRaises(ValueError):
                    start_pi(config)
                image.assert_not_called()
            finally:
                test_data_list[:] = original


class RecoveredSubprocessOomTests(unittest.TestCase):
    OOM_ERROR = "Container was killed by the out-of-memory killer"

    def run_case(self, *, profile="team", teammates=2, workflow="required",
                 container_updates=None, state_updates=None, summary_updates=None,
                 actor_updates=None, passed=0, real_lifecycle=False):
        with tempfile.TemporaryDirectory() as tmp:
            original = Path.cwd()
            os.chdir(tmp)
            try:
                prompt = Path(tmp) / "task.md"
                prompt.write_text("fixture source must remain unchanged")
                supplied = {"mock": True, "profile": profile, "teammates": teammates,
                            "workflow_validation": workflow}
                if teammates > 2:
                    supplied["roles"] = [{"name": f"role_{n}", "prompt": "Complete your assigned pass.",
                                          "tools": ["read", "bash"]} for n in range(teammates)]
                options = resolve_options({"pi": supplied})
                model, env = resolve_model({"moduleName": "mock"}, True)
                state = {"Status": "exited", "ExitCode": 0, "Running": False,
                         "Dead": False, "OOMKilled": True, "Error": ""}
                state.update(state_updates or {})
                container = {"generation_status": "failed", "exit_code": 0,
                             "attach_exit_code": 0, "oom_killed": True,
                             "error": self.OOM_ERROR, "container_state": state}
                container.update(container_updates or {})
                names = ["lead"] + ([f"worker_{n}" for n in range(teammates)] if profile == "team" else [])
                actors = [{"id": name, "settled": True, "last_stop_reason": "stop",
                           "errors": []} for name in names]
                if actor_updates:
                    actors[-1].update(actor_updates)
                team_status = "not_applicable" if profile == "single" else ("not_checked" if workflow == "off" else "completed")
                summary = {"runtime_generation_status": "completed", "extension_status": "loaded",
                           "team": {"status": team_status, "errors": []}, "actors": actors,
                           "budget_error": None, "role_budget_errors": {}}
                summary.update(copy.deepcopy(summary_updates or {}))
                task = SimpleNamespace(md=prompt, proName="fixture", pyTestFileList=[])
                evaluation = {"status": "success", "pytest_results": {
                    "passed": passed, "failed": 1 - passed, "errors": 0, "total": 1,
                    "success_rate": float(passed)}}

                def docker(args, **kwargs):
                    output = json.dumps([{"State": state}]) if args[0] == "inspect" else "fixture-container"
                    return subprocess.CompletedProcess(args, 0, stdout=output)

                def process(args, **kwargs):
                    return subprocess.CompletedProcess(args, 0, stdout="fixture-revision")

                with patch("pi_agent.runner.summarize_run", return_value=summary), \
                     patch("openhands.post_processor.post_process_task", return_value=evaluation) as judge:
                    if real_lifecycle:
                        with patch("docker_self.batch_container.docker_command", side_effect=docker), \
                             patch("docker_self.batch_container.subprocess.run", side_effect=process):
                            result = _run_task("oom-fixture", task, model, env, options, {"id": "mock-image"}, True)
                    else:
                        with patch("pi_agent.runner.run_batch_container", return_value=container):
                            result = _run_task("oom-fixture", task, model, env, options, {"id": "mock-image"}, True)
                    evaluated = judge.called
                self.assertEqual(prompt.read_text(), "fixture source must remain unchanged")
                return result, evaluated
            finally:
                os.chdir(original)

    def test_recovered_subprocess_oom_uses_normal_evaluation_for_single_and_flexible_teams(self):
        for profile, teammates in (("single", 2), ("team", 1), ("team", 2), ("team", 5)):
            with self.subTest(profile=profile, teammates=teammates):
                result, evaluated = self.run_case(profile=profile, teammates=teammates)
                self.assertTrue(evaluated)
                self.assertEqual(result["generation_status"], "completed")
                self.assertEqual(result["runtime_generation_status"], "completed")
                self.assertEqual(result["status"], "completed")
                self.assertEqual(result["evaluation_status"], "completed")
                self.assertEqual(result["evaluation_scope"], "completed_generation")
                self.assertEqual(result["score"], 0, "recovery must not depend on passing tests")
                self.assertTrue(result["oom_killed"])
                self.assertTrue(result["recovered_subprocess_oom"])
                self.assertEqual(result["container_generation_status"], "failed")
                self.assertEqual(result["container_error"], self.OOM_ERROR)
                self.assertNotIn("error", result)
                self.assertTrue(any("OOM" in warning for warning in result["warnings"]))
                self.assertEqual(result["stop_reason"], "completed")

    def test_real_shared_lifecycle_remains_strict_but_pi_can_verify_recovery(self):
        result, evaluated = self.run_case(real_lifecycle=True, passed=1)
        self.assertTrue(evaluated)
        self.assertEqual(result["generation_status"], "completed")
        self.assertEqual(result["container_generation_status"], "failed")
        self.assertEqual(result["container_state"]["Status"], "exited")
        self.assertTrue(result["container_state"]["OOMKilled"])
        self.assertEqual(result["score"], 1)

    def test_main_process_and_other_container_failures_are_not_recovered(self):
        cases = [
            {"container_updates": {"exit_code": 137}, "state_updates": {"ExitCode": 137}},
            {"container_updates": {"attach_exit_code": 1}},
            {"container_updates": {"cleanup_error": "Container removal failed"}},
            {"container_updates": {"error": "Container operation failed (OSError)"}},
            {"container_updates": {"generation_status": "error"}},
            {"container_updates": {"generation_status": "timeout", "error": "Generation exceeded 1 seconds"}},
            {"container_updates": {"container_state": None}},
            {"container_updates": {"container_state": {}}},
            {"container_updates": {"exit_code": None}},
            {"container_updates": {"attach_exit_code": None}},
            {"container_updates": {"error": None}},
            {"container_updates": {"oom_killed": False}},
            {"state_updates": {"Status": "running", "Running": True}},
            {"state_updates": {"Status": "dead", "Dead": True}},
            {"state_updates": {"Error": "Docker exit error hidden by the coarse OOM message"}},
            {"state_updates": {"ExitCode": 17}},
            {"state_updates": {"OOMKilled": False}},
            {"state_updates": {"Error": None}},
            {"state_updates": {"Running": None}},
            {"state_updates": {"Paused": True}},
        ]
        for case in cases:
            with self.subTest(case=case):
                result, evaluated = self.run_case(**case)
                self.assertFalse(evaluated)
                self.assertNotEqual(result["generation_status"], "completed")
                self.assertEqual(result["status"], "failed")
                self.assertEqual(result["evaluation_status"], "skipped")
                self.assertFalse(result.get("recovered_subprocess_oom", False))

    def test_failed_or_unverifiable_runtime_never_becomes_a_recovered_completion(self):
        cases = [
            {"runtime_generation_status": "failed"},
            {"runtime_generation_status": "error", "actors": []},
            {"runtime_generation_status": "timeout", "budget_error": "Task execution timeout"},
            {"runtime_generation_status": "cancelled", "budget_error": "Run cancelled by termination signal"},
            {"runtime_error": "Unexpected runtime exception"},
            {"budget_error": "Shared turn budget exhausted"},
            {"role_budget_errors": {"implementer": "Role token budget exhausted"}},
            {"trace_errors": ["Missing actor trace/session"]},
            {"extension_status": "error"},
            {"actors": []},
            {"team": {"status": "incomplete", "errors": ["Missing report"]}},
            {"team": {"status": "not_checked", "errors": []}},
            {"team": {"status": "completed", "errors": ["Undelivered message"]}},
            {"team": ["malformed workflow summary"]},
        ]
        for case in cases:
            with self.subTest(case=case):
                result, evaluated = self.run_case(summary_updates=case)
                self.assertFalse(evaluated)
                self.assertNotEqual(result["generation_status"], "completed")
                self.assertEqual(result["status"], "failed")

    def test_actor_completion_and_error_evidence_are_required(self):
        for changes in ({"settled": False}, {"last_stop_reason": None},
                        {"last_stop_reason": "error"}, {"last_stop_reason": "aborted"},
                        {"last_stop_reason": "length"}, {"errors": ["Required extension failed"]},
                        {"id": "lead"}, {"last_stop_reason": "unknown"}):
            with self.subTest(changes=changes):
                result, evaluated = self.run_case(actor_updates=changes)
                self.assertFalse(evaluated)
                self.assertEqual(result["generation_status"], "failed")

    def test_explicit_workflow_off_remains_visible_and_does_not_claim_team_validation(self):
        result, evaluated = self.run_case(workflow="off")
        self.assertTrue(evaluated)
        self.assertEqual(result["team"]["status"], "not_checked")
        self.assertTrue(result["recovered_subprocess_oom"])

    def test_report_mode_still_requires_a_completed_team_for_oom_recovery(self):
        result, evaluated = self.run_case(workflow="report",
            summary_updates={"team": {"status": "incomplete", "errors": ["Missing report"]}})
        self.assertFalse(evaluated)
        self.assertFalse(result.get("recovered_subprocess_oom", False))

    def test_no_oom_and_no_recovery_does_not_add_an_oom_warning(self):
        result, evaluated = self.run_case(container_updates={
            "generation_status": "completed", "oom_killed": False, "error": None},
            state_updates={"OOMKilled": False})
        self.assertTrue(evaluated)
        self.assertEqual(result["generation_status"], "completed")
        self.assertFalse(result.get("recovered_subprocess_oom", False))
        self.assertNotIn("warnings", result)


if __name__ == "__main__":
    unittest.main()
