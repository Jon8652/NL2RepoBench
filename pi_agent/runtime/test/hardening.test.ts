import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { Budget, Trace } from "../src/events.js";
import { Coordinator } from "../src/extensions/team.js";
import { runBenchmark } from "../src/main.js";
import type { Sessions } from "../src/session.js";
import type { RuntimeConfig } from "../src/types.js";

function fixture(teammates = 0) {
  const root = mkdtempSync(join(tmpdir(), "nl2repo-hardening-"));
  const workspace = join(root, "workspace"); mkdirSync(workspace);
  writeFileSync(join(workspace, "start.md"), "Implement answer.py exposing answer() returning 42.\n");
  const roles = teammates <= 2
    ? [{ name: "implementer", prompt: "Implement the public specification and report.", tools: ["read", "write", "bash"] },
       { name: "reviewer", prompt: "Review once and report known failures.", tools: ["read", "bash"], start_after: ["implementer"] }].slice(0, teammates)
    : [...Array.from({ length: teammates - 1 }, (_, n) => ({
        name: "component_" + n, prompt: "Implement your assigned component and report.", tools: ["read", "write", "bash"] })),
       { name: "auditor", prompt: "Review once and report.", tools: ["read", "bash"],
         start_after: Array.from({ length: teammates - 1 }, (_, n) => "component_" + n) }];
  const config: RuntimeConfig = { schema_version: 1, run_id: "hardening-test", workspace,
    home: join(root, "home"), artifacts: join(root, "artifacts"), mock: true,
    profile: teammates ? "team" : "single", teammates, max_active_teammates: 2,
    task_timeout_seconds: 20, max_total_tokens: null, max_turns: 100, max_messages: 100,
    workflow_validation: "report", roles, extensions: [], extension_options: {}, startup_commands: [],
    model: { id: "mock", api: "openai-completions", baseUrl: "https://must-never-be-used.invalid",
      contextWindow: 262144, maxTokens: 8192, reasoning: false, thinking: "off" } };
  return { config, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

function fakeTeam(config: RuntimeConfig, budget: Budget) {
  const sessions = { actors: new Map(), onMessage: undefined } as unknown as Sessions;
  const team = new Coordinator(config, sessions, new Trace(config), budget);
  const member: any = { id: "worker", role: "implementer", actor: { session: { sessionId: "worker" } },
    running: true, initial: false, pending: [], finished: false };
  team.members.set("worker", member);
  return { team, member };
}

for (const operation of ["wait", "drain"] as const) {
  test(operation + " survives a wall-clock jump without expiring its elapsed budget", async t => {
    const { config, cleanup } = fixture(1);
    let wall = Date.now();
    t.mock.method(Date, "now", () => wall);
    const budget = new Budget(config, () => 0);
    const { team, member } = fakeTeam(config, budget);
    try {
      wall += 4 * 3600 * 1000;
      const pending = operation === "wait" ? team.wait("all") : team.drain();
      const completion = assert.doesNotReject(pending);
      await new Promise(resolve => setTimeout(resolve, 35));
      member.running = false; member.finished = true;
      await completion;
      assert.equal(budget.failure, undefined);
      assert.equal(budget.totalTurns, 0);
    } finally { cleanup(); }
  });

  test(operation + " makes genuine elapsed expiry terminal and aborts only once", async () => {
    const { config, cleanup } = fixture(1);
    config.task_timeout_seconds = 1;
    let elapsed = 0, aborts = 0;
    const budget = new Budget(config, () => elapsed);
    budget.abort = () => { aborts++; };
    const { team } = fakeTeam(config, budget);
    try {
      elapsed = 1001;
      await assert.rejects(operation === "wait" ? team.wait("all") : team.drain(), /Task execution timeout/);
      assert.equal(budget.failure, "Task execution timeout");
      assert.throws(() => budget.check(), /Task execution timeout/);
      await Promise.resolve();
      assert.equal(aborts, 1);
      assert.equal(budget.totalTurns, 0);
    } finally { cleanup(); }
  });
}

test("uncapped runs warn about shared responses and elapsed time without imposing a token cap", () => {
  const { config, cleanup } = fixture(1);
  config.task_timeout_seconds = 100; config.max_turns = 10;
  let elapsed = 0;
  const budget = new Budget(config, () => elapsed); budget.register("worker", "implementer");
  try {
    assert.equal(budget.notice("worker"), undefined);
    for (let n = 0; n < 8; n++) budget.add("worker", { input: 1, totalTokens: 1 });
    assert.match(budget.notice("worker")!, /responses.*8\/10/i);
    elapsed = 85000;
    assert.match(budget.notice("worker")!, /15.*seconds/i);
    assert.match(budget.notice("worker")!, /finish_teammate/);
    assert.equal(budget.failure, undefined);
    assert.equal(config.max_total_tokens, null);
  } finally { cleanup(); }
});

for (const total of [1, 2, 3, 4, 5, 6]) {
  test("all " + total + " actors receive the full immutable public specification before their first request", async () => {
    const { config, cleanup } = fixture(total - 1);
    const spec = "SPECIFICATION_START\n" + "Public API requirement abcdefghijklmnopqrstuvwxyz.\n".repeat(4000) + "SPECIFICATION_END\n";
    writeFileSync(join(config.workspace, "start.md"), spec);
    try {
      const result = await runBenchmark(config);
      assert.equal(result.runtime_generation_status, "completed", JSON.stringify(result));
      assert.equal(result.team.status, total === 1 ? "not_applicable" : "completed", JSON.stringify(result));
      const first = result.mock_observations.filter((o: any) => o.step === 0);
      assert.equal(first.length, total);
      assert.ok(first.every((o: any) => o.has_specification_start && o.has_specification_end));
      assert.equal(result.task_specification.sha256, createHash("sha256").update(spec).digest("hex"));
      assert.equal(result.task_specification.bytes, Buffer.byteLength(spec));
      assert.equal(result.task_specification.actors.length, total);
      for (const actor of result.actors) {
        const native = readFileSync(actor.session_file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
        const deliveries = native.filter(row => row.type === "custom_message" && row.customType === "nl2repo-task-specification");
        assert.equal(deliveries.length, 1, actor.id);
        assert.ok(deliveries[0].content.includes(spec));
      }
    } finally { cleanup(); }
  });
}

test("a dropped stream recovers through the pinned SDK retry and retains unknown usage", async () => {
  const { config, cleanup } = fixture();
  try {
    const result = await runBenchmark(config, "stream-drop-once");
    assert.equal(result.runtime_generation_status, "completed", JSON.stringify(result));
    const d = result.response_diagnostics.actors.lead;
    assert.equal(d.error_responses, 1);
    assert.equal(d.recovered_error_responses, 1);
    assert.equal(d.unknown_usage_responses, 1);
    assert.equal(result.response_diagnostics.usage_is_lower_bound, true);
    assert.ok(readFileSync(join(config.workspace, "answer.py"), "utf8").includes("return 42"));
  } finally { cleanup(); }
});

test("persistent stream failure stops at the SDK retry bound and never claims success", async () => {
  const { config, cleanup } = fixture();
  try {
    const result = await runBenchmark(config, "stream-drop");
    assert.equal(result.runtime_generation_status, "failed", JSON.stringify(result));
    assert.equal(result.mock_requests.lead, 2);
    assert.equal(result.response_diagnostics.actors.lead.error_responses, 2);
    assert.equal(result.response_diagnostics.actors.lead.recovered_error_responses, 0);
    assert.equal(result.response_diagnostics.usage_is_lower_bound, true);
    assert.ok(!existsSync(join(config.workspace, "answer.py")));
  } finally { cleanup(); }
});

test("exhausted batch write streams settle without lead or teammate reminders", async () => {
  const { config, cleanup } = fixture(2);
  config.batch_file_writes = true;
  try {
    const result = await runBenchmark(config, "team-write-stream-drop");
    // Lead: delegation and wait, then the failed response and one retry.
    // Implementer: read, then the failed response and one retry.
    assert.deepEqual(result.mock_requests, { lead: 4, implementer: 3 });
    assert.equal(result.runtime_generation_status, "failed");
    assert.match(result.error, /Lead did not complete: error/);
    assert.equal(result.team.status, "incomplete");
    assert.match(result.team.members.find((member: any) => member.id === "implementer").error,
      /Teammate response ended with error/);
    assert.match(result.team.members.find((member: any) => member.id === "reviewer").error, /Prerequisite/);
    for (const actor of result.actors.filter((actor: any) => actor.id !== "reviewer")) {
      assert.equal(actor.settled, true);
      assert.equal(actor.last_stop_reason, "error");
      const diagnostics = result.response_diagnostics.actors[actor.id];
      assert.equal(diagnostics.error_responses, 2);
      assert.equal(diagnostics.recovered_error_responses, 0);
      assert.equal(diagnostics.unknown_usage_responses, 2);
      assert.doesNotMatch(readFileSync(actor.session_file, "utf8"),
        /"customType":"(?:team-reminder|report-reminder)"/);
    }
    assert.equal(result.response_diagnostics.usage_is_lower_bound, true);
    assert.ok(!existsSync(join(config.workspace, "corrupt.py")));
  } finally { cleanup(); }
});

test("a stream interrupted inside tool arguments cannot execute a partial file write", async () => {
  const { config, cleanup } = fixture();
  try {
    const result = await runBenchmark(config, "partial-write-stream");
    assert.equal(result.runtime_generation_status, "completed", JSON.stringify(result));
    assert.ok(!existsSync(join(config.workspace, "corrupt.py")));
    assert.equal(result.response_diagnostics.actors.lead.unknown_usage_responses, 1);
    assert.equal(result.response_diagnostics.actors.lead.recovered_error_responses, 1);
  } finally { cleanup(); }
});

test("deadline abort remains distinct from a stream error and stops new requests", async () => {
  const { config, cleanup } = fixture();
  config.task_timeout_seconds = 1;
  try {
    const result = await runBenchmark(config, "hang");
    assert.equal(result.runtime_generation_status, "timeout", JSON.stringify(result));
    assert.equal(result.mock_requests.lead, 1);
    const d = result.response_diagnostics.actors.lead;
    assert.equal(d.error_responses, 0);
    assert.equal(d.aborted_responses, 1);
    assert.equal(d.unknown_usage_responses, 1);
  } finally { cleanup(); }
});

test("reported tokens remain exact recorded usage while transport codes and missing usage are explicit", () => {
  const { config, cleanup } = fixture();
  const budget = new Budget(config);
  try {
    budget.recordResponse("lead", { stopReason: "error", errorMessage: "terminated: UND_ERR_BODY_TIMEOUT" });
    budget.recordResponse("lead", { stopReason: "aborted", usage: { totalTokens: 0 } });
    budget.recordResponse("lead", { stopReason: "stop", usage: { input: 20, output: 10, totalTokens: 30 } });
    assert.equal(budget.totalTokens, 30);
    const d = budget.responseDiagnostics.actors.lead;
    assert.equal(d.error_codes.UND_ERR_BODY_TIMEOUT, 1);
    assert.equal(d.recovered_error_responses, 1);
    assert.equal(d.unknown_usage_responses, 2);
    assert.equal(budget.responseDiagnostics.usage_is_lower_bound, true);
  } finally { cleanup(); }
});

test("teammates keep the initial task snapshot even if start.md is edited before spawning", async () => {
  const { config, cleanup } = fixture(2);
  const spec = "SPECIFICATION_START\nOriginal complete public contract.\nSPECIFICATION_END\n";
  writeFileSync(join(config.workspace, "start.md"), spec);
  const extension = join(config.workspace, "mutate-spec.ts");
  writeFileSync(extension, `import { writeFileSync } from "node:fs"; import { join } from "node:path";
    export default pi => pi.on("tool_call", (event, ctx) => {
      if (event.toolName === "start_team") writeFileSync(join(ctx.cwd, "start.md"), "Later workspace edit.");
    });`);
  config.extensions = [{ path: extension, scope: "lead" }];
  try {
    const result = await runBenchmark(config);
    assert.equal(result.team.status, "completed", JSON.stringify(result));
    assert.equal(readFileSync(join(config.workspace, "start.md"), "utf8"), "Later workspace edit.");
    assert.equal(result.task_specification.sha256, createHash("sha256").update(spec).digest("hex"));
    assert.ok(result.mock_observations.filter((o: any) => o.step === 0).every((o: any) =>
      o.has_specification_start && o.has_specification_end));
  } finally { cleanup(); }
});

test("a genuine team deadline aborts the blocking wait without polling or starting the reviewer", async () => {
  const { config, cleanup } = fixture(2);
  config.task_timeout_seconds = 1;
  try {
    const result = await runBenchmark(config, "hang-worker");
    assert.equal(result.runtime_generation_status, "timeout", JSON.stringify(result));
    assert.equal(result.team.status, "incomplete");
    assert.equal(result.mock_requests.lead, 2);
    assert.equal(result.mock_requests.implementer, 2);
    assert.equal(result.mock_requests.reviewer, undefined);
    const lead = readFileSync(join(config.artifacts, "lead/events.jsonl"), "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
    assert.equal(lead.filter(row => row.type === "tool_execution_start" && row.data.toolName === "wait_agent").length, 1);
    assert.ok(!lead.some(row => row.type === "tool_execution_start" && row.data.toolName === "list_agents"));
  } finally { cleanup(); }
});

test("zero-only provider usage remains unknown even on a normal stop", () => {
  const { config, cleanup } = fixture();
  const budget = new Budget(config);
  try {
    budget.recordResponse("lead", { stopReason: "stop", usage: { input: 0, output: 0, totalTokens: 0 } });
    assert.equal(budget.totalTokens, 0);
    assert.equal(budget.responseDiagnostics.usage_is_lower_bound, true);
    assert.equal(budget.responseDiagnostics.actors.lead.unknown_usage_responses, 1);
  } finally { cleanup(); }
});

for (const total of [1, 3]) {
  test("the short dependency warning reaches all " + total + " actors once before their first model request", async () => {
    const { config, cleanup } = fixture(total - 1);
    const originalSpec = readFileSync(join(config.workspace, "start.md"), "utf8");
    const warning = "Your final repository must run in this task's reference grading environment. " +
      "Use only runtime dependencies available there. Packages installed during development " +
      "or declared in your generated dependency files are not automatically installed during " +
      "grading. Still create the packaging files required by the specification.";
    try {
      const result = await runBenchmark(config);
      assert.equal(result.runtime_generation_status, "completed", JSON.stringify(result));
      assert.equal(result.team.status, total === 1 ? "not_applicable" : "completed");
      const firstRequests = result.mock_observations.filter((o: any) => o.step === 0);
      assert.equal(firstRequests.length, total);
      assert.ok(firstRequests.every((o: any) => o.dependency_warning_occurrences === 1));
      assert.equal(readFileSync(join(config.workspace, "start.md"), "utf8"), originalSpec);
      for (const actor of result.actors) {
        const entries = readFileSync(actor.session_file, "utf8").split("\n").filter(Boolean).map(line => JSON.parse(line));
        const tasks = entries.filter(row => row.type === "custom_message" && row.customType === "nl2repo-task-specification");
        assert.equal(tasks.length, 1, actor.id);
        assert.ok(tasks[0].content.startsWith(warning + "\n\n"), actor.id);
        assert.ok(tasks[0].content.includes(originalSpec), actor.id);
        assert.equal(tasks[0].content.split(warning).length - 1, 1, actor.id);
      }
    } finally { cleanup(); }
  });
}
