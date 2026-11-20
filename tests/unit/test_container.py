import json
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from docker_self.batch_container import run_batch_container


class ContainerTests(unittest.TestCase):
    def run_case(self, exit_code=0, oom=False, timeout=False, cleanup=0):
        state = {"Status": "exited", "ExitCode": exit_code, "Running": False, "OOMKilled": oom, "Error": ""}

        def docker(args, **kwargs):
            output = json.dumps([{"State": state}]) if args[0] == "inspect" else "container-id"
            return subprocess.CompletedProcess(args, 0, stdout=output)

        calls = 0

        def run(args, **kwargs):
            nonlocal calls
            calls += 1
            if calls == 1 and timeout:
                raise subprocess.TimeoutExpired(args, 1)
            return subprocess.CompletedProcess(args, cleanup if args[1] == "rm" else exit_code)

        with tempfile.TemporaryDirectory() as tmp, patch("docker_self.batch_container.docker_command", side_effect=docker), patch("docker_self.batch_container.subprocess.run", side_effect=run):
            return run_batch_container(["image"], "fixture", tmp, 1)

    def test_exit_status_is_captured_before_cleanup(self):
        self.assertEqual(self.run_case()["generation_status"], "completed")
        failed = self.run_case(exit_code=17)
        self.assertEqual(failed["generation_status"], "failed")
        self.assertEqual(failed["exit_code"], 17)

    def test_oom_timeout_and_cleanup_errors_are_retained(self):
        self.assertTrue(self.run_case(exit_code=137, oom=True)["oom_killed"])
        self.assertEqual(self.run_case(exit_code=143, timeout=True)["generation_status"], "timeout")
        self.assertIn("cleanup_error", self.run_case(cleanup=1))

    def test_raw_exit_state_is_retained_without_changing_the_shared_oom_policy(self):
        result = self.run_case(exit_code=0, oom=True)
        self.assertEqual(result["generation_status"], "failed")
        self.assertTrue(result["oom_killed"])
        self.assertEqual(result["container_state"]["Status"], "exited")
        self.assertEqual(result["container_state"]["ExitCode"], 0)
        self.assertTrue(result["container_state"]["OOMKilled"])
        self.assertEqual(result["container_state"]["Error"], "")


if __name__ == "__main__":
    unittest.main()
