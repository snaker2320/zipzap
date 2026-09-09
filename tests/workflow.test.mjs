import assert from "node:assert/strict";
import test from "node:test";

import { advanceLoop, consolidateIssues, evaluateGate } from "../scripts/lib/workflow.mjs";

const scopeEvidence = {
  id: "scope-understood",
  status: "passed",
  evidence_ref: "standards route"
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
    ["gate:independent-review-passed", "gate:verification-passed"]
  );
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

test("feedback deduplicates and proposes merge after two checkpoints", () => {
  const result = consolidateIssues({
    issues: [
      { fingerprint: "same", checkpoint: "a", title: "Missing contract", severity: "medium", standard_target: "standards/engineering/api.md" },
      { fingerprint: "same", checkpoint: "b", title: "Missing contract", severity: "medium", standard_target: "standards/engineering/api.md" }
    ]
  });
  assert.equal(result.label, "问题项");
  assert.equal(result.proposals[0].action, "merge");
  assert.equal(result.proposals[0].auto_apply, false);
  assert.equal(result.history_database_created, false);
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
