import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { buildLeadInstructions } from "../src/prompts.js";
import type { RuntimeConfig } from "../src/types.js";

function config(): Pick<RuntimeConfig, "profile" | "teammates" | "roles" | "lead_prompt"> {
  return { profile: "team", teammates: 2, roles: [
    { name: "implementer", prompt: "Implement.", tools: ["read", "write"] },
    { name: "reviewer", prompt: "Review.", tools: ["read"], start_after: ["implementer"] },
  ] };
}

test("default three-agent lead instructions remain byte-for-byte unchanged", () => {
  assert.equal(buildLeadInstructions(config()), readFileSync(new URL("./fixtures/default-team-prompt.txt", import.meta.url), "utf8"));
});

test("single-agent instructions stay unchanged unless explicitly customized", () => {
  const c = config(); c.profile = "single";
  assert.equal(buildLeadInstructions(c), "Complete this task as a single agent.");
  c.lead_prompt = "Perform a bounded API check.";
  assert.match(buildLeadInstructions(c), /Perform a bounded API check/);
  assert.doesNotMatch(buildLeadInstructions(c), /start_team|wait_agent/);
});

test("two-agent instructions assign remaining review to the lead without inventing peers", () => {
  const c = config(); c.teammates = 1; c.roles = c.roles.slice(0, 1);
  const prompt = buildLeadInstructions(c);
  assert.match(prompt, /exactly 1 persistent teammate/);
  assert.match(prompt, /lead owns implementation, review and integration work not delegated/);
  assert.doesNotMatch(prompt, /Teammates must exchange useful findings directly/);
});

test("custom roles, dependency joins and lead prompts replace fixed job-title assumptions", () => {
  const c = config(); c.teammates = 3; c.lead_prompt = "Coordinate the public interfaces.";
  c.roles = [
    { name: "engine", prompt: "Implement only the engine.", tools: ["write"] },
    { name: "interface", prompt: "Implement only the interface.", tools: ["write"] },
    { name: "auditor", prompt: "Inspect both components.", tools: ["read"], start_after: ["engine", "interface"] },
  ];
  const prompt = buildLeadInstructions(c);
  assert.match(prompt, /Implement only the engine/);
  assert.match(prompt, /"start_after":\["engine","interface"\]/);
  assert.match(prompt, /Coordinate the public interfaces/);
  assert.doesNotMatch(prompt, /Delegate source implementation and a single import check to the implementer/);
});
