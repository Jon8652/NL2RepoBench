"""Exercise the Pi backend against only the scripted model and local evaluator fixture."""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evaluate-fixture", action="store_true", help="Build a tiny test image and exercise the existing evaluator")
    args = parser.parse_args()
    os.chdir(ROOT)
    subprocess.run(["docker", "run", "--rm", "--network", "none", "--user", f"{os.getuid()}:{os.getgid()}",
                    "--env", "HOME=/tmp", "--env", "PI_OFFLINE=1", "--entrypoint", "node",
                    "nl2repobench-pi:1.5.2", "/opt/pi-runtime/dist/readiness.js"], check=True)
    if args.evaluate_fixture:
        fixture = ROOT / "tests/fixtures/mock-fixture"
        subprocess.run(["docker", "build", "--tag", "ghcr.io/multimodal-art-projection/nl2repobench/mock-fixture:1.0", str(fixture)], check=True)
    for profile in ("single", "extensions", "team", "uncapped-team", "two-agent", "large-team", "five-agent", "six-agent"):
        team_profile = profile in ("team", "uncapped-team", "two-agent", "large-team", "five-agent", "six-agent")
        fixture_profile = "large-team" if profile in ("five-agent", "six-agent") else (profile if profile in ("two-agent", "large-team") else ("team" if team_profile else "single"))
        config = json.loads((ROOT / f"config.pi.mock.{fixture_profile}.json").read_text())
        if profile in ("five-agent", "six-agent"):
            count = 4 if profile == "five-agent" else 5
            components = config["pi"]["roles"][:-1]
            components += [{"name": f"component_{n}", "prompt": "Implement the assigned independent component, run a bounded check, and finish_teammate with findings."} for n in range(count - 3)]
            reviewer = dict(config["pi"]["roles"][-1], start_after=[role["name"] for role in components])
            config["pi"].update(teammates=count, roles=[*components, reviewer])
        if profile == "uncapped-team":
            config["pi"].update(max_total_tokens=None, role_token_limits={}, enforce_role_token_limits=False)
        assert config["pi"]["mock"] is True
        if profile == "extensions":
            config["pi"].update(extensions=[{"path": str(ROOT / "pi_agent/runtime/test/fixtures/probe.ts"), "scope": "lead"}],
                                 extension_options={"probe-label": "docker-fixture"}, startup_commands=["/probe-mode"])
        if args.evaluate_fixture:
            config["evaluate"] = True
        before = set((ROOT / "result").glob("*.json"))
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8") as stream:
            json.dump(config, stream)
            stream.flush()
            subprocess.run([sys.executable, "main.py", "--config", stream.name,
                            "--task-root", str(ROOT / "tests/fixtures"), "--mock"], check=True)
        created = set((ROOT / "result").glob("*.json")) - before
        if len(created) != 1:
            raise RuntimeError("Expected exactly one result per fixture run")
        path = created.pop()
        result = json.loads(path.read_text())
        assert result["generation_status"] == "completed", result
        assert result["runtime_generation_status"] == "completed", result
        assert result["team"]["status"] == ("completed" if team_profile else "not_applicable"), result
        actor_count = len(result["usage"]["actors"])
        assert actor_count == (config["pi"]["teammates"] + 1 if team_profile else 1), result
        if profile == "two-agent":
            assert result["team"]["peer_messages"] == 0, result
        if profile in ("large-team", "five-agent", "six-agent"):
            assert result["team"]["peer_messages"] >= 2, result
        if profile == "extensions":
            probe = json.loads((Path(result["workspace_path"]) / "probe.json").read_text())
            assert probe == {"value": "mock-value", "label": "docker-fixture", "mode": True}, probe
        if args.evaluate_fixture:
            assert result["evaluation_status"] == "completed" and result["score"] == 1, result
        print(json.dumps({"profile": profile, "result": str(path), "team": result["team"]["status"], "actors": actor_count,
                          "evaluation": result["evaluation_status"], "score": result["score"],
                          "mock_tokens": result["usage"]["total_tokens"]}), flush=True)


if __name__ == "__main__":
    main()
