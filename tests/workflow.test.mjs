import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { readData } from "../scripts/lib/data-files.mjs";
import { advanceLoop, consolidateIssues, evaluateGate } from "../scripts/lib/workflow.mjs";
import { validateSchemaFile } from "../scripts/lib/schema-registry.mjs";

const riskTaxonomy = readData(path.resolve("config/risk-taxonomy.yml"));

const scopeEvidence = {
  id: "scope-understood",
  status: "passed",
  evidence_ref: "standards route"
};

const passingGate = {
  schema_version: 1,
  risk: "medium",
  mutates_files: true,
  claims_completion: true,
  evidence: [
    scopeEvidence,
    {
      id: "verification-passed",
      status: "passed",
      evidence_ref: "host:test",
      commit_sha: "a".repeat(40)
    }
  ]
};

test("gate derives required evidence and high risk review", () => {
  const result = evaluateGate({
    schema_version: 1,
    risk: "high",
    mutates_files: true,
    claims_completion: true,
    evidence: [scopeEvidence]
  });
  assert.equal(result.allowed, false);
  assert.deepEqual(
    result.issues.map((item) => item.fingerprint),
    [
      "gate:collaboration-mode-selected",
      "gate:independent-review-passed",
      "gate:verification-passed"
    ]
  );
});

test("Solo is the silent default when the Gate needs no second context", () => {
  const result = evaluateGate({
    schema_version: 1,
    risk: "medium",
    mutates_files: false,
    claims_completion: false,
    evidence: []
  });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.collaboration, {
    recommended_mode: "solo",
    selected_mode: "solo",
    selection_source: "default",
    decision_required: false,
    decision_options: []
  });
  assert.equal(result.checks.some((check) => check.id === "collaboration-mode-selected"), false);
});

test("multi-Agent recommendations pause with inline option reasons", () => {
  const copilot = evaluateGate({
    schema_version: 1,
    risk: "medium",
    required_checks: ["peer-challenge"],
    mutates_files: false,
    claims_completion: false,
    evidence: []
  });
  assert.equal(copilot.collaboration.recommended_mode, "copilot");
  assert.equal(copilot.collaboration.decision_required, true);
  assert.deepEqual(
    copilot.collaboration.decision_options.map((option) => option.label),
    [
      "[推荐] Copilot 当前工作需要第二上下文质疑",
      "Trio 提供更强的开发与验证分离",
      "Squad 提供完整角色分离"
    ]
  );

  const trio = evaluateGate({
    schema_version: 1,
    risk: "medium",
    required_checks: ["independent-testing-from-developer"],
    mutates_files: false,
    claims_completion: false,
    evidence: []
  });
  assert.deepEqual(
    trio.collaboration.decision_options.map((option) => option.label),
    [
      "[推荐] Trio 当前变更需要开发与验证分离",
      "Squad 提供完整角色分离"
    ]
  );
});

test("a compatible human selection is reused and weaker modes stay blocked", () => {
  const selected = evaluateGate({
    schema_version: 1,
    risk: "medium",
    required_checks: ["independent-testing-from-developer"],
    collaboration: {
      mode: "trio",
      actor: "user",
      evidence_ref: "conversation:team-choice"
    },
    mutates_files: false,
    claims_completion: false,
    evidence: [{
      id: "independent-testing-from-developer",
      status: "passed",
      evidence_ref: "test:result",
      actor: "tester-agent",
      role: "tester"
    }]
  });
  assert.equal(selected.collaboration.selected_mode, "trio");
  assert.equal(selected.collaboration.selection_source, "human");
  assert.equal(selected.collaboration.decision_required, false);
  assert.equal(selected.allowed, true);

  const tooWeak = evaluateGate({
    schema_version: 1,
    risk: "high",
    collaboration: {
      mode: "trio",
      actor: "user",
      evidence_ref: "conversation:team-choice"
    },
    mutates_files: false,
    claims_completion: false,
    evidence: []
  });
  assert.equal(tooWeak.collaboration.selected_mode, null);
  assert.equal(tooWeak.collaboration.decision_required, true);
  assert.deepEqual(
    tooWeak.collaboration.decision_options.map((option) => option.label),
    [
      "[推荐] Squad 当前工作需要完整角色分离",
      "暂不执行 当前风险未满足前保持停止"
    ]
  );
});

test("a multi-Agent recommendation pauses Work without consuming a correction", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "plan",
    attempt: 0,
    event: "evaluate",
    gate: {
      schema_version: 1,
      risk: "medium",
      required_checks: ["peer-challenge"],
      mutates_files: false,
      claims_completion: false,
      evidence: []
    },
    artifacts: [{ stage: "plan", locator: "docs/intent.md", commit_sha: "a".repeat(40) }]
  });
  assert.equal(result.outcome, "stop");
  assert.equal(result.attempt, 0);
  assert.equal(result.model_corrections_remaining, 1);
  assert.equal(result.next_action, "select-collaboration-mode");
  assert.equal(result.escalation_required, false);
  assert.equal(result.reason, null);
});

test("risk signals can raise but never lower Gate requirements", () => {
  const result = evaluateGate({
    schema_version: 1,
    risk: "low",
    signals: ["financial-impact"],
    mutates_files: false,
    claims_completion: false,
    evidence: []
  }, riskTaxonomy);
  assert.equal(result.declared_risk, "low");
  assert.equal(result.risk, "high");
  assert.deepEqual(result.required_approvals, ["business-or-financial-owner"]);
  assert.ok(result.checks.some((check) => check.id === "financial-calculation-tests"));
  assert.ok(result.checks.some((check) => check.id === "human-authorized"));
  assert.ok(result.checks.some((check) => check.id === "approval-business-or-financial-owner"));
  assert.ok(result.checks.some((check) => check.id === "independent-review-passed"));
});

test("passed Gate evidence requires a source and current stage commit", () => {
  const missingSource = evaluateGate({
    schema_version: 1,
    mutates_files: false,
    claims_completion: true,
    evidence: [{ id: "verification-passed", status: "passed" }]
  });
  assert.equal(missingSource.allowed, false);
  const staleCommit = evaluateGate({
    schema_version: 1,
    mutates_files: false,
    claims_completion: true,
    evidence: [{
      id: "verification-passed",
      status: "passed",
      evidence_ref: "host:test",
      commit_sha: "b".repeat(40)
    }]
  }, null, { commitSha: "a".repeat(40) });
  assert.equal(staleCommit.allowed, false);
});

test("independent assurance records the responsible role", () => {
  const unbound = evaluateGate({
    schema_version: 1,
    risk: "high",
    mutates_files: false,
    claims_completion: false,
    evidence: [{
      id: "independent-review-passed",
      status: "passed",
      evidence_ref: "review:result"
    }]
  });
  assert.equal(unbound.allowed, false);
  const bound = evaluateGate({
    schema_version: 1,
    risk: "high",
    collaboration: {
      mode: "squad",
      actor: "user",
      evidence_ref: "conversation:team-choice"
    },
    mutates_files: false,
    claims_completion: false,
    evidence: [{
      id: "independent-review-passed",
      status: "passed",
      evidence_ref: "review:result",
      actor: "reviewer-agent",
      role: "reviewer"
    }]
  });
  assert.equal(bound.allowed, true);
});

test("human authorization cannot be passed without a human actor", () => {
  const unbound = evaluateGate({
    schema_version: 1,
    mutates_files: false,
    external_effect: true,
    claims_completion: false,
    evidence: [{
      id: "human-authorized",
      status: "passed",
      evidence_ref: "approval:record"
    }]
  });
  assert.equal(unbound.allowed, false);
  const bound = evaluateGate({
    schema_version: 1,
    mutates_files: false,
    external_effect: true,
    claims_completion: false,
    evidence: [{
      id: "human-authorized",
      status: "passed",
      evidence_ref: "approval:record",
      actor: "user",
      role: "human"
    }]
  });
  assert.equal(bound.allowed, true);
});

test("loop permits one model correction, then stops with evidence", () => {
  const gate = {
    schema_version: 1,
    risk: "medium",
    mutates_files: true,
    claims_completion: true,
    evidence: [scopeEvidence]
  };
  const first = advanceLoop({ loop: "work", attempt: 0, event: "evaluate", gate });
  assert.equal(first.outcome, "correct");
  assert.equal(first.attempt, 1);
  const second = advanceLoop({ loop: "work", attempt: 1, event: "evaluate", gate });
  assert.equal(second.outcome, "stop");
  assert.equal(second.escalation_required, true);
});

test("work advances through the existing SDLC stages", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "plan",
    next_stage: "design",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "plan", locator: "docs/intent.md", commit_sha: "a".repeat(40) }]
  });
  assert.equal(result.outcome, "complete");
  assert.equal(result.next_loop, "work");
  assert.equal(result.next_stage, "design");
  assert.equal(result.workflow_complete, false);
  assert.equal(result.artifacts[0].locator, "docs/intent.md");
});

test("deploy cannot advance without the existing delivery assessment", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "deploy",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "deploy", locator: "evidence/deploy.json", commit_sha: "a".repeat(40) }]
  });
  assert.equal(result.outcome, "continue");
  assert.equal(result.next_loop, "feedback");
  assert.equal(result.next_stage, "deploy");
  assert.equal(result.next_action, "enter-feedback");
  assert.equal(result.issues[0].fingerprint, "sdlc:deploy:assessment-required");
});

test("deterministic reruns require the same bound input", () => {
  assert.throws(() => advanceLoop({
    schema_version: 2,
    loop: "feedback",
    stage: "build",
    attempt: 0,
    event: "deterministic-rerun",
    rerun: {
      check_id: "smoke",
      input_sha256: `sha256:${"a".repeat(64)}`,
      previous_input_sha256: `sha256:${"b".repeat(64)}`
    },
    gate: passingGate,
    issues: [{
      fingerprint: "same",
      checkpoint: "checkpoint-a",
      title: "Smoke failed",
      severity: "medium",
      status: "open",
      return_stage: "build"
    }]
  }), /same current and previous input_sha256/);
});

test("a failed delivery assessment returns Work to Feedback at the issue stage", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "deploy",
    attempt: 0,
    event: "evaluate",
    gate: { ...passingGate, evidence: [scopeEvidence] },
    artifacts: [{ stage: "deploy", locator: "evidence/deploy.json", commit_sha: "a".repeat(40) }],
    delivery: {
      schema_version: 1,
      operation: "assess",
      status: "blocked",
      allowed: false,
      environment: { kind: "test", target: "shared-test", shared: false },
      checks: [],
      issues: [{
        fingerprint: "delivery:deploy.smoke:evidence-failed",
        checkpoint: "checkpoint-a",
        title: "Smoke failed",
        severity: "medium",
        status: "open",
        return_stage: "build"
      }],
      next_actions: []
    }
  });
  assert.equal(result.next_loop, "feedback");
  assert.equal(result.next_stage, "build");
  assert.equal(result.attempt, 0);
});

test("a passed delivery assessment advances Deploy to Maintain", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "deploy",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "deploy", locator: "evidence/deploy.json", commit_sha: "a".repeat(40) }],
    delivery: {
      schema_version: 1,
      operation: "assess",
      status: "passed",
      allowed: true,
      environment: { kind: "development", target: "local", shared: false },
      checks: [],
      issues: [],
      next_actions: []
    }
  });
  assert.equal(result.outcome, "complete");
  assert.equal(result.next_loop, "work");
  assert.equal(result.next_stage, "maintain");
  assert.equal(result.next_action, "advance-maintain");
});

test("a blocked delivery assessment cannot advance without detailed issues", () => {
  const result = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "deploy",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "deploy", locator: "evidence/deploy.json", commit_sha: "a".repeat(40) }],
    delivery: {
      schema_version: 1,
      operation: "assess",
      status: "blocked",
      allowed: false,
      environment: { kind: "development", target: "local", shared: false },
      checks: [],
      issues: [],
      next_actions: []
    }
  });
  assert.equal(result.next_loop, "feedback");
  assert.ok(result.issues.some((issue) => issue.fingerprint === "sdlc:deploy:assessment-blocked"));
});

test("Maintain closes the delivery or explicitly starts a new Plan", () => {
  const complete = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "maintain",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "maintain", locator: "evidence/maintenance.md", commit_sha: "a".repeat(40) }]
  });
  assert.equal(complete.workflow_complete, true);
  assert.equal(complete.next_action, "prepare-git-handoff");
  const restart = advanceLoop({
    schema_version: 2,
    loop: "work",
    stage: "maintain",
    next_stage: "plan",
    attempt: 0,
    event: "evaluate",
    gate: passingGate,
    artifacts: [{ stage: "maintain", locator: "evidence/maintenance.md", commit_sha: "a".repeat(40) }]
  });
  assert.equal(restart.workflow_complete, false);
  assert.equal(restart.next_stage, "plan");
});

test("feedback resolves, reverifies, closes, and resumes Work", () => {
  const base = {
    schema_version: 2,
    loop: "feedback",
    stage: "build",
    attempt: 0,
    event: "evaluate",
    gate: passingGate
  };
  const issue = {
    fingerprint: "same",
    checkpoint: "checkpoint-a",
    title: "Smoke failed",
    severity: "medium",
    return_stage: "build"
  };
  const open = advanceLoop({ ...base, issues: [{ ...issue, status: "open" }] });
  assert.equal(open.outcome, "correct");
  assert.equal(open.next_action, "resolve-issues");
  const resolved = advanceLoop({ ...base, issues: [{ ...issue, status: "resolved" }] });
  assert.equal(resolved.outcome, "continue");
  assert.equal(resolved.next_action, "verify-issues");
  const closed = advanceLoop({
    ...base,
    issues: [{ ...issue, status: "closed", verification_ref: "host:smoke-rerun" }]
  });
  assert.equal(closed.outcome, "complete");
  assert.equal(closed.next_loop, "work");
  assert.equal(closed.next_stage, "build");
  assert.equal(closed.next_action, "resume-build");
});

test("maintenance consumes only reviewed feedback proposals", () => {
  const base = {
    schema_version: 2,
    loop: "maintenance",
    attempt: 0,
    event: "evaluate",
    gate: passingGate
  };
  const proposal = {
    fingerprint: "same",
    target: "standards/quality/testing.md",
    action: "merge"
  };
  const proposed = advanceLoop({ ...base, proposals: [{ ...proposal, status: "proposed" }] });
  assert.equal(proposed.outcome, "stop");
  assert.equal(proposed.next_action, "obtain-human-review");
  const approved = advanceLoop({
    ...base,
    proposals: [{ ...proposal, status: "approved", evidence_ref: "human:review-approved" }]
  });
  assert.equal(approved.outcome, "correct");
  assert.equal(approved.next_action, "apply-approved-standard-change");
  const applied = advanceLoop({
    ...base,
    proposals: [{ ...proposal, status: "applied", evidence_ref: "git:standard-change" }]
  });
  assert.equal(applied.outcome, "continue");
  assert.equal(applied.next_action, "verify-standard-change");
  const closed = advanceLoop({
    ...base,
    proposals: [{ ...proposal, status: "closed", evidence_ref: "review:standard-change" }]
  });
  assert.equal(closed.workflow_complete, true);
});

test("loop schema requires stage-specific inputs and closure evidence", () => {
  const root = path.resolve(".");
  const passedWithoutSource = validateSchemaFile(root, "schemas/gate-input.schema.yml", {
    schema_version: 1,
    mutates_files: false,
    claims_completion: true,
    evidence: [{ id: "verification-passed", status: "passed" }]
  });
  assert.equal(passedWithoutSource.valid, false);
  const unboundCollaboration = validateSchemaFile(root, "schemas/gate-input.schema.yml", {
    schema_version: 1,
    collaboration: { mode: "trio" },
    mutates_files: false,
    claims_completion: false
  });
  assert.equal(unboundCollaboration.valid, false);
  const missingStage = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 2,
    loop: "work",
    loop_id: "missing-stage",
    project: { locator: "." },
    gate: passingGate
  });
  assert.equal(missingStage.valid, false);
  const missingArtifact = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 2,
    loop: "work",
    loop_id: "missing-artifact",
    project: { locator: "." },
    stage: "plan",
    gate: passingGate
  });
  assert.equal(missingArtifact.valid, false);
  const unboundRerun = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 2,
    loop: "feedback",
    loop_id: "unbound-rerun",
    project: { locator: "." },
    stage: "build",
    event: "deterministic-rerun",
    gate: passingGate,
    issues: [{
      fingerprint: "same",
      checkpoint: "checkpoint-a",
      title: "Smoke failed",
      severity: "medium",
      status: "open",
      return_stage: "build"
    }]
  });
  assert.equal(unboundRerun.valid, false);
  const unverifiedClosure = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 2,
    loop: "feedback",
    loop_id: "unverified-closure",
    project: { locator: "." },
    gate: passingGate,
    issues: [{
      fingerprint: "same",
      checkpoint: "checkpoint-a",
      title: "Smoke failed",
      severity: "medium",
      status: "closed",
      return_stage: "build"
    }]
  });
  assert.equal(unverifiedClosure.valid, false);
  const unapprovedMaintenance = validateSchemaFile(root, "schemas/loop-input.schema.yml", {
    schema_version: 2,
    loop: "maintenance",
    loop_id: "unapproved-maintenance",
    project: { locator: "." },
    gate: passingGate,
    proposals: [{
      fingerprint: "same",
      target: "standards/quality/testing.md",
      action: "merge",
      status: "approved"
    }]
  });
  assert.equal(unapprovedMaintenance.valid, false);
});

test("feedback deduplicates and proposes merge after two checkpoints", () => {
  const result = consolidateIssues({
    issues: [
      { fingerprint: "same", checkpoint: "a", title: "Missing contract", severity: "medium", standard_target: "standards/engineering/api.md" },
      { fingerprint: "same", checkpoint: "b", title: "Missing contract", severity: "medium", standard_target: "standards/engineering/api.md" }
    ]
  });
  assert.equal(result.label, "问题项");
  assert.equal(result.proposals[0].action, "merge");
  assert.equal(result.proposals[0].status, "proposed");
  assert.equal(result.proposals[0].auto_apply, false);
  assert.equal(result.next_loop, "feedback");
  assert.equal(result.history_database_created, false);
});

test("closed repeated feedback moves to Maintenance with verification evidence", () => {
  const result = consolidateIssues({
    issues: [
      { fingerprint: "same", checkpoint: "a", title: "Missing contract", severity: "medium", status: "open", standard_target: "standards/engineering/api.md" },
      { fingerprint: "same", checkpoint: "b", title: "Missing contract", severity: "medium", status: "closed", verification_ref: "host:contract-check", standard_target: "standards/engineering/api.md" }
    ]
  });
  assert.equal(result.issues[0].status, "closed");
  assert.equal(result.next_loop, "maintenance");
  assert.equal(result.next_action, "review-standard-proposals");
});

test("repeated bootstrap gaps may propose but never apply an AGENTS revision", () => {
  const result = consolidateIssues({
    issues: [
      { fingerprint: "route-gap", checkpoint: "a", title: "Route missing", severity: "medium", bootstrap_gap: true },
      { fingerprint: "route-gap", checkpoint: "b", title: "Route missing", severity: "medium", bootstrap_gap: true }
    ]
  });
  assert.equal(result.proposals[0].target, "AGENTS.md");
  assert.equal(result.proposals[0].action, "propose-revision");
  assert.equal(result.proposals[0].auto_apply, false);
});
