/** A scripted OpenAI-compatible SSE endpoint. No external requests or real credentials. */
import { createServer, type Server } from "node:http";
import { once } from "node:events";
import type { RuntimeConfig } from "./types.js";
import { isDefaultTeam } from "./prompts.js";
import { DEPENDENCY_WARNING } from "./session.js";

type Action = { tool: string; args: Record<string, unknown> } | { text: string; reason?: string };
export type MockScenario = "normal" | "error" | "length" | "worker-error" | "early-lead" | "rate-limit-once" | "hang" | "slow-handoff" | "write-history" | "missing-report" | "known-failures" | "no-peer" | "stream-drop-once" | "stream-drop" | "partial-write-stream" | "team-write-stream-drop" | "hang-worker";

const call = (tool: string, args: Record<string, unknown>): Action => ({ tool, args });

function flexibleAction(actor: string, step: number, batch: boolean, config: RuntimeConfig, scenario: MockScenario): Action {
  const roles = config.roles.slice(0, config.teammates);
  const first = roles.find(role => !role.start_after?.length)!;
  if (actor === "lead") {
    const steps: Action[] = [
      call("start_team", { members: roles.map(role => ({ name: role.name, role: role.name,
        task: "Follow your configured role instructions, complete your assigned fixture pass and submit finish_teammate.",
        write_scopes: role.start_after?.length ? [] : [role.name === first.name ? "answer.py" : role.name + ".fixture.md"] })) }),
      call("wait_agent", { target: "all", timeout_ms: 1 }),
    ];
    if (config.teammates === 1) steps.push(call("bash", { command: "python3 -c 'from answer import answer; assert answer() == 42'" }));
    steps.push(call("list_agents", {}));
    return steps[step] ?? { text: "Collected all configured role reports and completed the assigned lead verification." };
  }
  const role = roles.find(item => item.name === actor)!;
  const steps: Action[] = [call("read", { path: "start.md" })];
  if (!role.start_after?.length) {
    const file = role.name === first.name
      ? { path: "answer.py", content: "def answer():\n    return 42\n" }
      : { path: role.name + ".fixture.md", content: "Completed the assigned component.\n" };
    steps.push(batch ? call("write_files", { files: [file] }) : call("write", file));
    steps.push(call("bash", { command: "test -f " + file.path }));
  } else {
    steps.push(call("bash", { command: "python3 -c 'from answer import answer; assert answer() == 42'" }));
  }
  // With no dependency handoff, explicitly exercise peer messaging before either pass ends.
  if (roles.length > 1 && !roles.some(item => item.start_after?.length) && actor === first.name && scenario !== "no-peer") {
    steps.unshift(call("send_message", { target: roles.find(item => item.name !== actor)!.name, text: "Coordinate ownership: I will produce answer.py; keep your assigned component separate." }));
  }
  steps.push(call("finish_teammate", { report: "Completed the configured role pass; recorded the fixture checks and component handoff." }));
  return steps[step] ?? { text: "Configured role report complete." };
}

function action(actor: string, step: number, team: boolean, probe: boolean, batch: boolean): Action {
  const writeAnswer = () => batch ? call("write_files", { files: [
    { path: "answer.py", content: "def answer():\n    return 42\n" },
    { path: "README.fixture.md", content: "The deterministic fixture exports answer() returning 42.\n" },
  ] }) : call("write", { path: "answer.py", content: "def answer():\n    return 42\n" });
  if (actor === "lead" && !team) {
    const steps: Action[] = [call("read", { path: "start.md" })];
    if (probe) steps.push(call("contract_probe", { value: "mock-value" }));
    steps.push(writeAnswer());
    return steps[step] ?? { text: "Implemented the mock fixture." };
  }
  if (actor === "lead") {
    const steps: Action[] = [
      call("start_team", { members: [
        { name: "implementer", role: "implementer", task: "Implement answer.py, run one import check, then finish_teammate.", write_scopes: ["answer.py"] },
        { name: "reviewer", role: "reviewer", task: "Review answer.py after handoff, verify answer()==42, then finish_teammate." },
      ] }),
      call("wait_agent", { target: "all", timeout_ms: 1 }),
      call("list_agents", {}),
    ];
    return steps[step] ?? { text: "Integrated the implementation and review reports." };
  }

  if (actor === "implementer") {
    const steps: Action[] = [call("read", { path: "start.md" }), writeAnswer(),
      call("bash", { command: "python3 -c 'from answer import answer; assert answer() == 42'" }),
      call("finish_teammate", { report: "Implemented answer.py and verified answer() == 42." })];
    return steps[step] ?? { text: "Implementation report complete." };
  }
  const steps: Action[] = [call("read", { path: "start.md" }),
    call("bash", { command: "python3 -c 'from answer import answer; assert answer() == 42'" }),
    call("finish_teammate", { report: "Reviewed implementation and verified the API." })];
  return steps[step] ?? { text: "Review report complete." };
}

export async function startMockServer(scenario: MockScenario = "normal", config?: RuntimeConfig): Promise<{ baseUrl: string; server: Server; requests: Record<string, number>; observations: { actor: string; step: number; message_characters: number; has_large_file_marker: boolean; has_tool_argument_omission_marker: boolean; active_tools: string[]; has_specification_start: boolean; has_specification_end: boolean; dependency_warning_occurrences: number }[]; close: () => Promise<void> }> {
  const requests: Record<string, number> = {};
  const observations: { actor: string; step: number; message_characters: number; has_large_file_marker: boolean; has_tool_argument_omission_marker: boolean; active_tools: string[]; has_specification_start: boolean; has_specification_end: boolean; dependency_warning_occurrences: number }[] = [];
  let rateLimited = false;
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/v1/chat/completions") {
      res.writeHead(404).end(); return;
    }
    let raw = "";
    for await (const part of req) raw += part;
    try {
      const body = JSON.parse(raw);
      const system = body.messages.filter((m: { role: string }) => ["system", "developer"].includes(m.role))
        .map((m: { content: unknown }) => JSON.stringify(m.content)).join("\n");
      const actor = /NL2REPO_ACTOR=([a-z0-9_-]+)/.exec(system)?.[1] ?? "lead";
      const step = requests[actor] ?? 0;
      const tools = new Set<string>((body.tools ?? []).map((t: { function: { name: string } }) => t.function.name));
      if (scenario === "rate-limit-once" && !rateLimited) {
        rateLimited = true; res.writeHead(429, { "Content-Type": "application/json", "Retry-After": "0" });
        res.end(JSON.stringify({ error: { message: "Mock rate limit", type: "rate_limit_error" } })); return;
      }
      const messages = JSON.stringify(body.messages);
      observations.push({ actor, step, message_characters: messages.length,
        has_large_file_marker: messages.includes("MOCK_LARGE_FILE_MARKER"), has_tool_argument_omission_marker: messages.includes("[Written file body omitted from request history;"), active_tools: [...tools],
        has_specification_start: messages.includes("SPECIFICATION_START"), has_specification_end: messages.includes("SPECIFICATION_END"),
        dependency_warning_occurrences: messages.split(DEPENDENCY_WARNING).length - 1 });
      requests[actor] = step + 1;
      if (scenario === "hang" || (scenario === "hang-worker" && actor !== "lead" && step === 1)) return;
      if (scenario === "error" || (scenario === "worker-error" && actor !== "lead")) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: { message: "Scripted mock model failure", type: "invalid_request_error" } })); return;
      }
      const largeFile = { path: "docs/payload.txt", content: "MOCK_LARGE_FILE_MARKER\n" + "x".repeat(20000) };
      const history: Action[] = [call("read", { path: "start.md" }),
        tools.has("write_files") ? call("write_files", { files: [largeFile, { path: "answer.py", content: "def answer():\n    return 42\n" }] }) : call("write", largeFile),
        call("bash", { command: "test -f docs/payload.txt" }), { text: "File writes complete." }];
      const selected = !tools.size ? { text: "Mock context summary." }
        : scenario === "length" ? { text: "Truncated mock answer", reason: "length" }
        : scenario === "early-lead" && actor === "lead" ? { text: "Finished without delegation." }
        : scenario === "write-history" ? history[step] ?? { text: "Done." }
        : scenario === "missing-report" && actor === "implementer" && step >= 3 ? { text: "Work was attempted without submitting a structured report." }
        : scenario === "known-failures" && actor === "implementer" && step === 1 ? call(tools.has("write_files") ? "write_files" : "write", tools.has("write_files") ? { files: [{ path: "answer.py", content: "def answer():\n    return 41\n" }] } : { path: "answer.py", content: "def answer():\n    return 41\n" })
        : scenario === "known-failures" && ((actor === "implementer" && step === 3) || (actor === "reviewer" && step === 2)) ? call("finish_teammate", { report: "Completed the assigned pass. Known failure: answer() returns 41 rather than 42; this is retained for benchmark scoring." })
        : tools.has("spawn_teammate") && config && !isDefaultTeam(config)
          ? flexibleAction(actor, step, tools.has("write_files"), config, scenario)
          : actor !== "lead" && config?.profile === "team" && !isDefaultTeam(config)
            ? flexibleAction(actor, step, tools.has("write_files"), config, scenario)
            : action(actor, step, tools.has("spawn_teammate"), tools.has("contract_probe"), tools.has("write_files"));
      if (scenario === "slow-handoff" && actor === "implementer" && step === 1) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      const id = `mock-${actor}-${step}`;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
      const chunk = (delta: unknown, reason: string | null = null, usage?: unknown) => res.write("data: " + JSON.stringify({
        id, object: "chat.completion.chunk", created: 1, model: body.model,
        choices: [{ index: 0, delta, finish_reason: reason }], ...(usage ? { usage } : {}),
      }) + "\n\n");
      chunk({ role: "assistant", content: "" });
      // The implementer fails while writing. The lead then encounters the same error
      // after wait_agent returns with the incomplete team.
      const teamWriteDrop = scenario === "team-write-stream-drop" &&
        ((actor === "implementer" && step >= 1) || (actor === "lead" && step >= 2));
      if (teamWriteDrop || scenario === "stream-drop" ||
          (step === 0 && (scenario === "stream-drop-once" || scenario === "partial-write-stream"))) {
        if (teamWriteDrop || scenario === "partial-write-stream") {
          const partialWrite = tools.has("write_files")
            ? { name: "write_files", arguments: '{"files":[{"path":"corrupt.py","content":"unfinished' }
            : { name: "write", arguments: '{"path":"corrupt.py","content":"unfinished' };
          chunk({ tool_calls: [{ index: 0, id: "interrupted-write", type: "function", function: partialWrite }] });
        } else chunk({ content: "Mock interrupted response" });
        // Deliver headers and a real partial SSE response before terminating the socket.
        res.flushHeaders();
        setTimeout(() => res.destroy(), 10).unref();
        return;
      }
      if ("tool" in selected) {
        chunk({ tool_calls: [{ index: 0, id: `call-${actor}-${step}`, type: "function",
          function: { name: selected.tool, arguments: JSON.stringify(selected.args) } }] });
      } else chunk({ content: selected.text });
      chunk({}, "tool" in selected ? "tool_calls" : selected.reason ?? "stop",
        { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 });
      res.end("data: [DONE]\n\n");
    } catch (error) {
      res.writeHead(400).end(JSON.stringify({ error: { message: String(error) } }));
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Cannot start mock endpoint");
  return { baseUrl: `http://127.0.0.1:${address.port}/v1`, server, requests, observations,
    close: () => new Promise<void>((resolve, reject) => { server.close(error => error ? reject(error) : resolve()); server.closeAllConnections(); }) };
}
