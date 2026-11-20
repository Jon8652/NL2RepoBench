import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { RuntimeConfig } from "./types.js";

export function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

export class Trace {
  private sequence = 0;
  constructor(readonly config: RuntimeConfig) {
    mkdirSync(config.artifacts, { recursive: true });
    if (config.profile === "team") appendFileSync(join(config.artifacts, "team-events.jsonl"), "");
  }

  emit(actor: string, type: string, data: unknown = {}, team = false): void {
    const directory = actor === "lead" ? join(this.config.artifacts, "lead") : join(this.config.artifacts, "members", actor);
    mkdirSync(directory, { recursive: true });
    const event = { schema_version: 1, run_id: this.config.run_id, event_id: randomUUID(),
      sequence: ++this.sequence, timestamp: new Date().toISOString(), actor_id: actor, type, data };
    const line = JSON.stringify(event) + "\n";
    appendFileSync(team ? join(this.config.artifacts, "team-events.jsonl") : join(directory, "events.jsonl"), line);
  }
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  total: number;
  responses: number;
  auxiliary: number;
  cost: null;
}

export interface ResponseDiagnostics {
  error_responses: number;
  aborted_responses: number;
  length_responses: number;
  recovered_error_responses: number;
  unknown_usage_responses: number;
  error_codes: Record<string, number>;
}

export class Budget {
  readonly actors: Record<string, UsageTotals> = {};
  failure?: string;
  abort?: () => void;
  abortRole?: (role: string) => void;
  readonly roleFailures: Record<string, string> = {};
  private readonly roles = new Map<string, string>();
  private readonly diagnostics: Record<string, ResponseDiagnostics> = {};
  private readonly pendingErrors = new Map<string, number>();
  private readonly deadline: number;
  private timer?: ReturnType<typeof setTimeout>;

  constructor(readonly config: RuntimeConfig, private readonly now: () => number = () => performance.now()) {
    this.deadline = now() + config.task_timeout_seconds * 1000;
  }

  get remainingMs(): number { return Math.max(0, this.deadline - this.now()); }

  startTimer(): void {
    this.stopTimer();
    this.check();
    const tick = () => {
      if (this.failure) return;
      if (this.remainingMs <= 0) this.fail("Task execution timeout");
      else {
        this.timer = setTimeout(tick, Math.min(2 ** 31 - 1, Math.ceil(this.remainingMs)));
        this.timer.unref();
      }
    };
    tick();
  }

  stopTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  register(actor: string, role: string): void { this.roles.set(actor, role); }
  roleUsage(role: string): number {
    return Object.entries(this.actors).filter(([id]) => this.roles.get(id) === role).reduce((n, [, row]) => n + row.total, 0);
  }
  actorFailure(actor: string): string | undefined { return this.roleFailures[this.roles.get(actor) ?? actor]; }
  notice(actor: string): string | undefined {
    const role = this.roles.get(actor) ?? actor;
    const limit = this.config.role_token_limits?.[role];
    const used = this.roleUsage(role);
    const notices: string[] = [];
    if (limit && used >= limit * 0.8) notices.push(`Role token ${this.config.enforce_role_token_limits === true ? "ceiling" : "handoff target (advisory)"}: ${used}/${limit}`);
    if (this.totalTurns >= this.config.max_turns * 0.8) notices.push(`Shared assistant responses: ${this.totalTurns}/${this.config.max_turns}`);
    if (this.config.max_total_tokens !== null && this.totalTokens >= this.config.max_total_tokens * 0.8) {
      notices.push(`Shared reported tokens: ${this.totalTokens}/${this.config.max_total_tokens}`);
    }
    if (this.remainingMs <= Math.min(60000, this.config.task_timeout_seconds * 200)) {
      notices.push(`Task deadline: ${Math.ceil(this.remainingMs / 1000)} seconds remaining`);
    }
    if (!notices.length) return undefined;
    const handoff = this.config.profile === "team" && actor !== "lead"
      ? "Prioritize a truthful finish_teammate handoff now. Report status=incomplete if required work remains."
      : this.config.profile === "team"
        ? "Collect required teammate reports and finish with a truthful summary of completed work and known failures."
        : "Finish with a truthful summary of completed work and known failures.";
    return notices.join("; ") + ". " + handoff + " Keep checks bounded and source-writing batches within the model output limit; do not claim unfinished work is completed.";
  }

  fail(reason: string): void {
    if (this.failure) return;
    this.failure = reason;
    queueMicrotask(() => this.abort?.());
  }

  add(actor: string, usage: Record<string, unknown>, auxiliary = false): void {
    const row = this.actors[actor] ??= { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0,
      responses: 0, auxiliary: 0, cost: null };
    for (const key of ["input", "output", "cacheRead", "cacheWrite"] as const) {
      const value = usage[key];
      if (typeof value === "number" && Number.isFinite(value) && value >= 0) row[key] += value;
    }
    const sum = ["input", "output", "cacheRead", "cacheWrite"].reduce((n, key) => n + (Number(usage[key]) || 0), 0);
    row.total += typeof usage.totalTokens === "number" ? usage.totalTokens : sum;
    if (auxiliary) row.auxiliary++; else row.responses++;
    if (this.config.max_total_tokens !== null && this.totalTokens >= this.config.max_total_tokens) this.fail("Shared token budget exhausted");
    if (this.totalTurns >= this.config.max_turns) this.fail("Shared turn budget exhausted");
    const role = this.roles.get(actor);
    const limit = role && this.config.role_token_limits?.[role];
    if (this.config.enforce_role_token_limits === true && !this.failure && role && limit && this.roleUsage(role) >= limit && !this.roleFailures[role]) {
      this.roleFailures[role] = `Role token budget exhausted: ${role} (${this.roleUsage(role)}/${limit})`;
      queueMicrotask(() => this.abortRole?.(role));
    }
  }

  recordResponse(actor: string, message: { stopReason?: string; errorMessage?: string; usage?: Record<string, unknown> }): ResponseDiagnostics {
    const row = this.diagnostics[actor] ??= { error_responses: 0, aborted_responses: 0, length_responses: 0,
      recovered_error_responses: 0, unknown_usage_responses: 0, error_codes: {} };
    const usage = message.usage ?? {};
    // Pi normalizes absent provider usage to zeroes, so a zero-only response cannot
    // establish that the provider did no work, including a normally ended response.
    const reported = ["totalTokens", "input", "output", "cacheRead", "cacheWrite"].some(key =>
      typeof usage[key] === "number" && Number.isFinite(usage[key]) && Number(usage[key]) > 0);
    if (!reported) row.unknown_usage_responses++;
    if (message.stopReason === "error") {
      row.error_responses++;
      this.pendingErrors.set(actor, (this.pendingErrors.get(actor) ?? 0) + 1);
      for (const code of new Set(message.errorMessage?.match(/\b(?:UND_ERR_[A-Z_]+|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|EAI_AGAIN|ENOTFOUND)\b/g) ?? [])) {
        row.error_codes[code] = (row.error_codes[code] ?? 0) + 1;
      }
    } else if (message.stopReason === "aborted") row.aborted_responses++;
    else if (message.stopReason === "length") row.length_responses++;
    else {
      row.recovered_error_responses += this.pendingErrors.get(actor) ?? 0;
      this.pendingErrors.delete(actor);
    }
    this.add(actor, usage);
    return row;
  }

  get responseDiagnostics(): { actors: Record<string, ResponseDiagnostics>; usage_is_lower_bound: boolean } {
    return { actors: this.diagnostics,
      usage_is_lower_bound: Object.values(this.diagnostics).some(row => row.unknown_usage_responses > 0) };
  }

  get totalTokens(): number { return Object.values(this.actors).reduce((n, row) => n + row.total, 0); }
  get totalTurns(): number { return Object.values(this.actors).reduce((n, row) => n + row.responses, 0); }
  check(): void {
    if (!this.failure && this.remainingMs <= 0) this.fail("Task execution timeout");
    if (this.failure) throw new Error(this.failure);
  }
}
