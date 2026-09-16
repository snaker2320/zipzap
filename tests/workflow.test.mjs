import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readData } from "../scripts/lib/data-files.mjs";
import { validateSchemaFile } from "../scripts/lib/schema-registry.mjs";
import { advanceLoop, consolidateIssues, evaluateGate } from "../scripts/lib/workflow.mjs";

const root = path.resolve(".");
const taxonomy = readData(path.resolve("config/risk-taxonomy.yml"));
const workflow = readData(path.resolve("config/workflow.yml"));
const sha = "a".repeat(40);

function passingGate(commitSha = null) {
  return {
    schema_version: 1,
    risk: "medium",
    mutates_files: false,
    claims_completion: true,
    evidence: [{
      id: "verification-passed",
      status: "passed",
      evidence_ref: "host:test",
      ...(commitSha ? { commit_sha: commitSha } : {})
    }]
  };
}

function direct(overrides = {}) {
  return {
    schema_version: 3,
    loop: "work",
    loop_id: "direct-work",
    project: { locator: "." },
    result_ref: "conversation:result",
    attempt: 0,
    event: "evaluate",
    gate: passingGate(),
    ...overrides
  };
}

function staged(stage, completionStage, overrides = {}) {
  return {
    schema_version: 3,
    loop: "work",
    loop_id: "staged-work",
    project: { locator: "." },
    stage,
    completion_stage: completionStage,
    artifacts: [{ stage, locator: `evidence/${stage}.md`, commit_sha: sha }],
    attempt: 0,
    event: "evaluate",
    gate: passingGate(sha),
    ...overrides
  };
}

function issue(returnTo, status = "open", extra = {}) {
  return {
    fingerprint: "same-problem",
    checkpoint: "checkpoint-a",
    title: "Observed failure",
    severity: "medium",
    status,
    return_to: returnTo,
    ...extra
  };
}

function acceptance() {
  return {
    scenarios: [
      { id: "AC_POS", type: "positive", applicability: "applicable", condition: "valid state", action: "run", expected: "succeeds" },
      { id: "AC_NEG", type: "negative", applicability: "applicable", condition: "invalid state", action: "run", expected: "is rejected" },
      { id: "AC_BOUND", type: "boundary", applicability: "applicable", condition: "limit value", action: "run", expected: "is handled" },
      { id: "AC_REG", type: "regression", applicability: "not-applicable", rationale: "new isolated behavior", condition: "prior behavior", action: "compare", expected: "unchanged" }
    ],
    constraints: [
      { id: "INV_AUTH", applicability: "applicable", statement: "authorization is preserved" }
    ]
  };
}

test("Gate has no collaboration selection or output", () => {
  const result = evaluateGate(passingGate(), taxonomy);
  assert.equal(result.allowed, true);
  assert.equal(Object.hasOwn(result, "collaboration"), false);
  assert.equal(result.checks.some((check) => check.id === "collaboration-mode-selected"), false);
});

test("old collaboration input fails clearly under the strict schema", () => {
  const result = validateSchemaFile(root, "schemas/gate-input.schema.yml", {
    ...passingGate(),
    collaboration: { mode: "solo", actor: "user", evidence_ref: "conversation:choice" }
  });
  assert.equal(result.valid, false);
  assert.match(JSON.stringify(result.errors), /additionalProperties|collaboration/);
});

test("direct Work completes without SDLC stages", () => {
  const result = advanceLoop(direct(), taxonomy, workflow);
  assert.equal(result.schema_version, 3);
  assert.equal(result.work_kind, "direct");
  assert.equal(result.workflow_complete, true);
  assert.equal(result.next_action, "prepare-git-handoff");
});

test("Work schema requires exactly one direct or staged contract", () => {
  const missing = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 3,
    loop: "work",
    loop_id: "missing-contract",
    project: { locator: "." },
    gate: passingGate()
  });
  assert.equal(missing.valid, false);
  const noEnd = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 3,
    loop: "work",
    loop_id: "missing-end",
    project: { locator: "." },
    stage: "design",
    artifacts: [{ stage: "design", locator: "design.md", commit_sha: sha }],
    gate: passingGate(sha)
  });
  assert.equal(noEnd.valid, false);
});

test("staged Work rejects duplicate artifacts for the same stage", () => {
  const input = staged("plan", "design", {
    next_stage: "design",
    artifacts: [
      { stage: "plan", locator: "evidence/old.md", commit_sha: sha },
      { stage: "plan", locator: "evidence/new.md", commit_sha: "b".repeat(40) }
    ]
  });
  assert.equal(validateSchemaFile(root, "schemas/loop-input.schema.yml", input).valid, false);
  assert.throws(() => advanceLoop(input, taxonomy, workflow), /duplicate stage artifact: plan/);
});

test("completion_stage ends Design without implicit implementation", () => {
  const result = advanceLoop(staged("design", "design"), taxonomy, workflow);
  assert.equal(result.workflow_complete, true);
  assert.equal(result.next_stage, null);
  assert.equal(result.next_action, "prepare-git-handoff");
});

test("a non-terminal stage never advances implicitly", () => {
  const result = advanceLoop(staged("plan", "design"), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.next_stage, null);
  assert.equal(result.next_action, "await-explicit-next-stage");
});

test("an explicit next stage advances and activates only required roles", () => {
  const result = advanceLoop(staged("plan", "design", {
    next_stage: "design",
    required_roles: ["tester"]
  }), taxonomy, workflow);
  assert.equal(result.outcome, "continue");
  assert.equal(result.next_stage, "design");
  assert.deepEqual(result.agents.activate_or_reuse, [{ role: "tester", reuse_key: "staged-work:tester" }]);
});

test("the same tester assignment is reused from test design to Verify", () => {
  const designed = advanceLoop(staged("design", "verify", {
    next_stage: "verify",
    required_roles: ["tester"]
  }), taxonomy, workflow);
  const verifying = advanceLoop(staged("verify", "verify", {
    loop_id: "staged-work",
    required_roles: ["tester"],
    active_roles: ["tester"]
  }), taxonomy, workflow);
  assert.equal(designed.agents.activate_or_reuse[0].reuse_key, "staged-work:tester");
  assert.deepEqual(verifying.agents.release_roles, ["tester"]);
});

test("product is activated only when the action explicitly requires it", () => {
  const ordinary = advanceLoop(staged("plan", "plan"), taxonomy, workflow);
  const ambiguous = advanceLoop(staged("plan", "plan", { required_roles: ["product"] }), taxonomy, workflow);
  assert.deepEqual(ordinary.agents.release_roles, []);
  assert.deepEqual(ambiguous.agents.release_roles, ["product"]);
});

test("workflow completion releases all known active roles", () => {
  const result = advanceLoop(direct({ active_roles: ["developer", "tester"] }), taxonomy, workflow);
  assert.deepEqual(result.agents.release_roles, ["developer", "tester"]);
});

test("internal edit-build-test-fix iteration does not consume governance correction", () => {
  const result = advanceLoop(direct({
    event: "internal-iteration",
    gate: { schema_version: 1, mutates_files: false, claims_completion: true, evidence: [] }
  }), taxonomy, workflow);
  assert.equal(result.attempt, 0);
  assert.equal(result.model_corrections_remaining, 1);
  assert.equal(result.next_action, "continue-internal-iteration");
});

test("internal iteration cannot bypass the scope entry Gate", () => {
  const result = advanceLoop(direct({
    event: "internal-iteration",
    gate: { schema_version: 1, mutates_files: true, claims_completion: false, evidence: [] }
  }), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.attempt, 0);
  assert.equal(result.model_corrections_remaining, 1);
  assert.equal(result.gate.execution_allowed, false);
  assert.equal(result.next_action, "satisfy-entry-gate");
});

test("internal iteration cannot bypass the human authorization entry Gate", () => {
  const result = advanceLoop(direct({
    event: "internal-iteration",
    gate: {
      schema_version: 1,
      mutates_files: true,
      external_effect: true,
      claims_completion: false,
      evidence: [{ id: "scope-understood", status: "passed", evidence_ref: "standards route" }]
    }
  }), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.attempt, 0);
  assert.equal(result.model_corrections_remaining, 1);
  assert.equal(result.gate.execution_allowed, false);
  assert.equal(result.gate.checks.find((check) => check.id === "human-authorized").passed, false);
  assert.equal(result.next_action, "satisfy-entry-gate");
});

test("internal iteration cannot bypass a high-risk problem item", () => {
  const result = advanceLoop(direct({
    event: "internal-iteration",
    issues: [issue("direct", "open", { severity: "high" })]
  }), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.escalation_required, true);
  assert.equal(result.next_loop, "feedback");
  assert.equal(result.next_action, "escalate");
});

test("a resolved high-risk problem item can proceed to verification", () => {
  const result = advanceLoop({
    schema_version: 3,
    loop: "feedback",
    loop_id: "high-risk-verification",
    project: { locator: "." },
    event: "evaluate",
    gate: { schema_version: 1, mutates_files: false, claims_completion: false },
    issues: [issue("direct", "resolved", { severity: "high" })]
  }, taxonomy, workflow);
  assert.equal(result.outcome, "continue");
  assert.equal(result.escalation_required, false);
  assert.equal(result.next_action, "verify-issues");
});

test("internal iteration cannot bypass human review of a standards proposal", () => {
  const result = advanceLoop({
    schema_version: 3,
    loop: "maintenance",
    loop_id: "proposal-review",
    project: { locator: "." },
    event: "internal-iteration",
    gate: { schema_version: 1, mutates_files: false, claims_completion: false },
    proposals: [{
      fingerprint: "same-problem",
      target: "standards/quality/testing.md",
      action: "merge",
      status: "proposed"
    }]
  }, taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.escalation_required, true);
  assert.equal(result.next_action, "obtain-human-review");
});

test("a submitted exit Gate failure gets one automatic correction", () => {
  const failed = { schema_version: 1, mutates_files: false, claims_completion: true, evidence: [] };
  const first = advanceLoop(direct({ event: "submitted-result", gate: failed }), taxonomy, workflow);
  assert.equal(first.outcome, "correct");
  assert.equal(first.attempt, 1);
  const second = advanceLoop(direct({ event: "submitted-result", attempt: 1, gate: failed }), taxonomy, workflow);
  assert.equal(second.outcome, "stop");
  assert.equal(second.escalation_required, true);
});

test("evaluating an exit Gate failure does not consume a correction", () => {
  const result = advanceLoop(direct({
    event: "evaluate",
    gate: { schema_version: 1, mutates_files: false, claims_completion: true, evidence: [] }
  }), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.attempt, 0);
  assert.equal(result.model_corrections_remaining, 1);
  assert.equal(result.next_action, "satisfy-gate");
});

test("entry Gate failure blocks without consuming correction", () => {
  const result = advanceLoop(direct({
    required_roles: ["developer"],
    gate: { schema_version: 1, mutates_files: true, claims_completion: false, evidence: [] }
  }), taxonomy, workflow);
  assert.equal(result.outcome, "stop");
  assert.equal(result.attempt, 0);
  assert.equal(result.next_action, "satisfy-entry-gate");
  assert.equal(result.agents.status, "idle");
  assert.deepEqual(result.agents.activate_or_reuse, []);
});

test("Feedback returns to the same direct Work", () => {
  const result = advanceLoop({
    schema_version: 3,
    loop: "feedback",
    loop_id: "direct-feedback",
    project: { locator: "." },
    gate: passingGate(),
    issues: [issue("direct", "closed", { verification_ref: "test:recheck" })]
  }, taxonomy, workflow);
  assert.equal(result.next_loop, "work");
  assert.equal(result.next_stage, null);
  assert.equal(result.next_action, "resume-direct-work");
});

test("Feedback returns staged Work to its explicit stage", () => {
  const result = advanceLoop({
    schema_version: 3,
    loop: "feedback",
    loop_id: "staged-feedback",
    project: { locator: "." },
    completion_stage: "verify",
    gate: passingGate(),
    issues: [issue("implement", "closed", { verification_ref: "test:recheck" })]
  }, taxonomy, workflow);
  assert.equal(result.next_stage, "implement");
  assert.equal(result.completion_stage, "verify");
  assert.equal(result.next_action, "resume-implement");
});

test("only a failed Feedback verification consumes its correction", () => {
  const base = {
    schema_version: 3,
    loop: "feedback",
    loop_id: "feedback-limit",
    project: { locator: "." },
    gate: { schema_version: 1, mutates_files: false, claims_completion: false },
    issues: [issue("direct", "resolved")]
  };
  const resolving = advanceLoop({ ...base, event: "evaluate" }, taxonomy, workflow);
  assert.equal(resolving.attempt, 0);
  const failed = advanceLoop({ ...base, event: "feedback-verification-failed" }, taxonomy, workflow);
  assert.equal(failed.attempt, 1);
  assert.equal(failed.outcome, "correct");
  assert.equal(failed.next_action, "resolve-issues");
  assert.equal(failed.issues[0].status, "open");
});

test("acceptance contract covers scenarios, constraints, and evidence IDs", () => {
  const input = direct({
    acceptance: acceptance(),
    acceptance_evidence: [
      { acceptance_id: "AC_POS", status: "passed", evidence_ref: "test:positive" },
      { acceptance_id: "AC_NEG", status: "passed", evidence_ref: "test:negative" },
      { acceptance_id: "AC_BOUND", status: "passed", evidence_ref: "test:boundary" },
      { acceptance_id: "INV_AUTH", status: "passed", evidence_ref: "review:constraint" }
    ]
  });
  assert.equal(validateSchemaFile(root, "schemas/loop-input.schema.yml", input).valid, true);
  assert.equal(advanceLoop(input, taxonomy, workflow).workflow_complete, true);
  assert.throws(
    () => advanceLoop({ ...input, acceptance_evidence: [{ acceptance_id: "UNKNOWN", status: "not-run" }] }, taxonomy, workflow),
    /unknown acceptance id/
  );
});

test("missing applicable acceptance evidence enters Feedback", () => {
  const result = advanceLoop(direct({ acceptance: acceptance(), acceptance_evidence: [] }), taxonomy, workflow);
  assert.equal(result.next_loop, "feedback");
  assert.ok(result.issues.some((item) => item.fingerprint === "acceptance:AC_NEG"));
});

test("Deploy still requires a passed delivery assessment", () => {
  const blocked = advanceLoop(staged("deploy", "deploy"), taxonomy, workflow);
  assert.equal(blocked.next_loop, "feedback");
  assert.ok(blocked.issues.some((item) => item.fingerprint === "sdlc:deploy:assessment-required"));
  const passed = advanceLoop(staged("deploy", "deploy", {
    delivery: {
      schema_version: 1,
      operation: "assess",
      status: "passed",
      allowed: true,
      environment: { kind: "development", target: "local", shared: false },
      checks: [], issues: [], next_actions: []
    }
  }), taxonomy, workflow);
  assert.equal(passed.workflow_complete, true);
});

test("delivery build issues return to Implement", () => {
  const result = advanceLoop(staged("deploy", "deploy", {
    delivery: {
      schema_version: 1,
      operation: "assess",
      status: "blocked",
      allowed: false,
      environment: { kind: "development", target: "local", shared: false },
      checks: [],
      issues: [{
        fingerprint: "delivery:build.execute:evidence-failed",
        checkpoint: "checkpoint-a",
        title: "Build failed",
        severity: "medium",
        status: "open",
        return_to: "implement"
      }],
      next_actions: []
    }
  }), taxonomy, workflow);
  assert.equal(result.next_stage, "implement");
});

test("applying an approved standards proposal does not consume a correction", () => {
  const result = advanceLoop({
    schema_version: 3,
    loop: "maintenance",
    loop_id: "standard-maintenance",
    project: { locator: "." },
    attempt: 0,
    event: "evaluate",
    gate: { schema_version: 1, mutates_files: false, claims_completion: false },
    proposals: [{
      fingerprint: "same-problem",
      target: "standards/quality/testing.md",
      action: "merge",
      status: "approved",
      evidence_ref: "human:approved"
    }]
  }, taxonomy, workflow);
  assert.equal(result.outcome, "continue");
  assert.equal(result.attempt, 0);
  assert.equal(result.next_action, "apply-approved-standard-change");
});

test("issue consolidation preserves return targets and bounded proposals", () => {
  const result = consolidateIssues({
    schema_version: 2,
    issues: [
      issue("design", "open", { checkpoint: "a", standard_target: "standards/engineering/api.md" }),
      issue("design", "resolved", { checkpoint: "b", standard_target: "standards/engineering/api.md" })
    ]
  });
  assert.equal(result.schema_version, 2);
  assert.equal(result.issues[0].return_to, "design");
  assert.equal(result.proposals[0].action, "merge");
  assert.equal(result.proposals[0].auto_apply, false);
});
