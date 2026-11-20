import type { RuntimeConfig } from "./types.js";

type PromptConfig = Pick<RuntimeConfig, "profile" | "teammates" | "roles" | "lead_prompt">;

export function isDefaultTeam(config: PromptConfig): boolean {
  const [implementer, reviewer] = config.roles;
  return config.profile === "team" && config.teammates === 2 && config.roles.length === 2 && !config.lead_prompt &&
    implementer.name === "implementer" && !(implementer.start_after?.length) &&
    reviewer.name === "reviewer" && reviewer.start_after?.length === 1 && reviewer.start_after[0] === "implementer";
}

function flexibleTeamInstructions(config: PromptConfig): string {
  const roles = config.roles.map(role => ({ name: role.name, instructions: role.prompt,
    tools: role.tools, start_after: role.start_after ?? [] }));
  return "Use exactly " + config.teammates + " persistent teammate" + (config.teammates === 1 ? "" : "s") + ". Read start.md once. " +
    "Plan the work using the configured role instructions below; role names are not fixed job titles. " +
    (config.roles.length === config.teammates
      ? "Call start_team once with one named assignment per configured role. "
      : "Call start_team once with exactly the configured teammate count, choosing roles whose prerequisites are also assigned. ") +
    "Give each assignment a complete scope, expected deliverables, shared interfaces and advisory write_scopes. " +
    "All agents share the repository; avoid overlapping file edits. The scheduler starts independent roles concurrently within max_active_teammates, " +
    "and starts dependent roles only after every start_after prerequisite has finished and settled. " +
    "start_team creates owned tasks and delivers delegation messages. Each teammate must call finish_teammate with its findings and known failures; " +
    "that action completes owned tasks and sends reports to the lead and dependent roles automatically. " +
    (config.teammates === 1
      ? "There is no separate teammate reviewer unless you assigned that responsibility to your sole teammate. The lead owns implementation, review and integration work not delegated. "
      : "Teammates must exchange useful findings directly through send_message when dependency handoffs do not already provide a teammate-to-teammate exchange. ") +
    "After delegation call wait_agent target=all; do not poll. Receive all reports, perform any verification or integration assigned to the lead, and finish with a concise result. " +
    "This run validates benchmark operation, not maximum score. Aim for a complete repository attempt and one bounded verification pass, recording known failures. " +
    "Failing code tests are valid benchmark outcomes; report missing required work honestly and do not chase a perfect score through repeated repair loops. " +
    "Configured roles: " + JSON.stringify(roles) + "." +
    (config.lead_prompt ? "\nAdditional lead instructions:\n" + config.lead_prompt : "");
}

export function buildLeadInstructions(config: PromptConfig): string {
  if (config.profile === "single") {
    return "Complete this task as a single agent." +
      (config.lead_prompt ? "\nAdditional agent instructions:\n" + config.lead_prompt : "");
  }
    return isDefaultTeam(config) ? `Use exactly ${config.teammates} persistent teammates with configured roles (${config.roles.map(r => r.name).join(", ")}). ` +
      "Read start.md once. Call start_team with one assignment per role; it creates owned tasks and delivers delegation messages. " +
      "Delegate source implementation and a single import check to the implementer, and behavioral verification to the reviewer. " +
      "The reviewer starts after the implementer hands off. Members use finish_teammate once to complete their tasks and send reports automatically. " +
      "Then call wait_agent target=all once. Do not poll. Integrate their delivered findings and give a concise final result. " +
      "This run validates benchmark operation, not maximum score. Produce a complete initial repository attempt, perform one review pass, and finish with known failures recorded. " +
      "Failing repository tests do not mean the agent or benchmark failed. Do not pursue repeated type-checking or repair loops until all tests pass. " +
      "The lead collects reports and finishes without redoing implementation or checks. If required files were not attempted, report that honestly." : flexibleTeamInstructions(config);
}
