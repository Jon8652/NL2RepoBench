import json
import tempfile
import unittest
from pathlib import Path

from pi_agent.session_summary import summarize_run


class SummaryTests(unittest.TestCase):
    def make_fixture(self, root):
        lead = root / "lead"
        lead.mkdir()
        native = lead / "session.jsonl"
        native.write_text('{"type":"session","version":3}\n')
        event = dict(schema_version=1, run_id="r", event_id="one", actor_id="lead", type="actor_created", data={"text": "Unicode separator \u2028 stays inside JSON"})
        trace = lead / "events.jsonl"
        trace.write_text(json.dumps(event, ensure_ascii=False) + "\n")
        summary = dict(schema_version=1, runtime_generation_status="completed", extension_status="loaded", team={"status": "not_applicable", "errors": []}, usage={}, actors=[{"id": "lead", "session_file": str(native)}])
        (root / "summary.json").write_text(json.dumps(summary))
        return trace, native

    def test_valid_lf_framing_accepts_unicode_separators(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_fixture(root)
            self.assertEqual(summarize_run(root, {"profile": "single"})["runtime_generation_status"], "completed")

    def test_pi_diagnostics_and_specification_delivery_survive_python_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_fixture(root)
            path = root / "summary.json"
            summary = json.loads(path.read_text())
            summary["response_diagnostics"] = {"usage_is_lower_bound": True, "actors": {"lead": {"unknown_usage_responses": 1}}}
            summary["task_specification"] = {"sha256": "task-hash", "bytes": 120000, "actors": ["lead"]}
            path.write_text(json.dumps(summary))
            result = summarize_run(root, {"profile": "single"})
            self.assertEqual(result["response_diagnostics"], summary["response_diagnostics"])
            self.assertEqual(result["task_specification"], summary["task_specification"])

    def test_duplicate_and_truncated_traces_fail(self):
        for damage in ("duplicate", "truncate", "schema", "native"):
            with self.subTest(damage=damage), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                trace, native = self.make_fixture(root)
                if damage == "duplicate":
                    trace.write_text(trace.read_text() * 2)
                elif damage == "truncate":
                    trace.write_text(trace.read_text().rstrip("\n"))
                elif damage == "schema":
                    trace.write_text(trace.read_text().replace('"schema_version": 1', '"schema_version": 9'))
                else:
                    native.write_text('{"type":"session","version":3}')
                self.assertEqual(summarize_run(root, {"profile": "single"})["runtime_generation_status"], "failed")

    def test_failed_run_can_defer_a_member_before_its_first_native_session(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self.make_fixture(root)
            member = root / "members/reviewer"
            member.mkdir(parents=True)
            event = dict(schema_version=1, run_id="r", event_id="review-created", actor_id="reviewer", type="actor_created", data={})
            trace = member / "events.jsonl"
            trace.write_text(json.dumps(event) + "\n")
            created = dict(event, event_id="member-created", actor_id="lead", type="member_created", data={"id": "reviewer"})
            (root / "team-events.jsonl").write_text(json.dumps(created) + "\n")
            path = root / "summary.json"
            summary = json.loads(path.read_text())
            summary.update(runtime_generation_status="failed", team={"status": "incomplete", "errors": []})
            summary["actors"].append({"id": "reviewer", "session_file": str(member / "session.jsonl"), "last_stop_reason": None})
            path.write_text(json.dumps(summary))
            options = {"profile": "team", "teammates": 2}
            result = summarize_run(root, options)
            self.assertEqual(result["runtime_generation_status"], "failed")
            self.assertEqual(result["deferred_actors"], ["reviewer"])
            self.assertNotIn("trace_errors", result)
            self.assertEqual(result["team"]["status"], "incomplete")
            summary["runtime_generation_status"] = "completed"
            path.write_text(json.dumps(summary))
            self.assertIn("trace_errors", summarize_run(root, options))
            summary["runtime_generation_status"] = "failed"
            path.write_text(json.dumps(summary))
            trace.write_text(trace.read_text() + json.dumps(dict(event, event_id="review-started", type="agent_start")) + "\n")
            self.assertIn("trace_errors", summarize_run(root, options))

    def make_team_fixture(self, root, count, peer=False, missing_edge=None, undelivered=False, unfinished=False):
        self.make_fixture(root)
        summary_path = root / "summary.json"
        summary = json.loads(summary_path.read_text())
        summary["team"] = {"status": "completed", "errors": []}
        frames = []

        def emit(actor, kind, data):
            frames.append(dict(schema_version=1, run_id="r", event_id=f"team-{len(frames)}",
                               actor_id=actor, type=kind, data=data))

        members = [f"worker-{i}" for i in range(count)]
        for member in members:
            directory = root / "members" / member
            directory.mkdir(parents=True)
            native = directory / "session.jsonl"
            native.write_text('{"type":"session","version":3}\n')
            created = dict(schema_version=1, run_id="r", event_id=f"actor-{member}",
                           actor_id=member, type="actor_created", data={})
            (directory / "events.jsonl").write_text(json.dumps(created) + "\n")
            summary["actors"].append({"id": member, "session_file": str(native)})
            emit("lead", "member_created", {"id": member})
            emit(member, "member_finished", {"id": member})
            emit(member, "task_updated", {"id": f"task-{member}", "status": "pending" if unfinished else "completed"})
        edges = [(a, b) for member in members for a, b in (("lead", member), (member, "lead"))]
        if peer and count > 1:
            edges.append((members[0], members[1]))
        for index, (sender, target) in enumerate(edges):
            if (sender, target) == missing_edge:
                continue
            message_id = f"message-{index}"
            emit(sender, "message_queued", {"id": message_id, "sender": sender, "target": target})
            if not (undelivered and index == 0):
                emit(target, "message_delivered", {"message_id": message_id})
        (root / "team-events.jsonl").write_text("".join(json.dumps(frame) + "\n" for frame in frames))
        summary_path.write_text(json.dumps(summary))

    def test_two_agent_trace_requires_lead_exchange_and_completion_but_no_peer(self):
        for damage in (None, "missing_report_message", "undelivered", "unfinished"):
            with self.subTest(damage=damage), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                self.make_team_fixture(root, 1,
                    missing_edge=("worker-0", "lead") if damage == "missing_report_message" else None,
                    undelivered=damage == "undelivered", unfinished=damage == "unfinished")
                result = summarize_run(root, {"profile": "team", "teammates": 1})
                self.assertEqual(result["team"]["status"], "completed" if damage is None else "incomplete")
                self.assertNotIn("No delivered peer message", result["team"]["errors"])

    def test_larger_team_still_requires_peer_messages_and_exact_member_count(self):
        for count, expected, peer, completed in ((4, 4, True, True), (4, 4, False, False), (1, 4, False, False)):
            with self.subTest(count=count, expected=expected, peer=peer), tempfile.TemporaryDirectory() as tmp:
                root = Path(tmp)
                self.make_team_fixture(root, count, peer=peer)
                result = summarize_run(root, {"profile": "team", "teammates": expected})
                self.assertEqual(result["team"]["status"], "completed" if completed else "incomplete")
                if not peer:
                    self.assertIn("No delivered peer message", result["team"]["errors"])

    def test_missing_runtime_summary_is_an_explicit_error(self):
        with tempfile.TemporaryDirectory() as tmp:
            result = summarize_run(tmp, {"profile": "team", "teammates": 2})
            self.assertEqual(result["runtime_generation_status"], "error")
            self.assertEqual(result["team"]["status"], "incomplete")


if __name__ == "__main__":
    unittest.main()
