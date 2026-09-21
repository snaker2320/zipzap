import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import test from "node:test";
import { readData } from "../scripts/lib/data-files.mjs";
import { evidenceDigest } from "../scripts/lib/evidence.mjs";
import { advanceLoop as advanceLoopRaw, advancePersistedLoop, evaluateGate, summarizeLoop } from "../scripts/lib/workflow.mjs";
import { inspectGitHandoff, prepareGitHandoff } from "../scripts/lib/git-handoff.mjs";
import { validateSchemaFile } from "../scripts/lib/schema-registry.mjs";

const root = path.resolve(".");
const taxonomy = readData(path.join(root, "config/risk-taxonomy.yml"));
const policy = readData(path.join(root, "config/workflow.yml"));
const hostCapabilities = {
  multi_agent: { available: true, default_allowed: true, stable_identity: true, handoff_acknowledgement: true }
};
const gate = () => ({ schema_version: 1, risk: "low", mutates_files: false, claims_completion: true,
  evidence: [{ id: "verification-passed", status: "passed", evidence_ref: "host:test-output" }] });
const direct = (extra = {}) => ({ schema_version: 3, loop: "work", loop_id: "bounded-work", project: { locator: root },
  persist: false, result_ref: "conversation:result",
  execution: { owner: { agent_id: "agent-owner", status: "completed" } }, gate: gate(), ...extra });
const advance = (input) => {
  assert.equal(validateSchemaFile(root, "schemas/loop-input.schema.yml", input).valid, true);
  return advanceLoopRaw(input, taxonomy, policy, hostCapabilities);
};
function fixture(context) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-orchestration-test-"));
  context.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q"); git("config", "user.email", "zipzap@example.test"); git("config", "user.name", "ZipZap Test");
  fs.writeFileSync(path.join(dir, "spec.md"), "accepted design\n");
  git("add", "."); git("commit", "-qm", "design");
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(dir, "result.md"), "implementation result\n");
  git("add", "."); git("commit", "-qm", "implementation");
  return { dir, git, base, head: git("rev-parse", "HEAD") };
}
function staged(f) {
  return { schema_version: 3, loop: "work", loop_id: "staged-work", project: { locator: f.dir }, persist: false,
    stage: "design", completion_stage: "design", artifacts: [{ stage: "design", locator: "result.md", commit_sha: f.head }],
    execution: { owner: { agent_id: "agent-owner", stage: "design", status: "completed" } },
    gate: { ...gate(), evidence: [{ ...gate().evidence[0], commit_sha: f.head }] } };
}

test("ordinary bounded result finishes without Feedback, Maintenance or a Git handoff", () => {
  const result = advance(direct());
  assert.equal(result.workflow_complete, true);
  assert.equal(result.next_loop, null);
  assert.equal(result.next_action, "report-result");
  assert.equal(advance(direct({ handoff_required: true })).next_action, "prepare-git-handoff");
});

test("an in-progress high-risk action neither completes nor eagerly recruits an exit reviewer", () => {
  const result = advance(direct({
    execution: { owner: { agent_id: "agent-owner", status: "running" } },
    gate: { ...gate(), risk: "high", claims_completion: false, evidence: [] }
  }));
  assert.equal(result.workflow_complete, false);
  assert.equal(result.gate.status, "pending");
  assert.equal(result.gate.completion_allowed, false);
  assert.deepEqual(result.execution.required_checks, []);
  assert.deepEqual(result.execution.checks, []);
  assert.equal(result.progress.status, "running");
});

test("a due independent check waits for a real secondary Agent", () => {
  const result = advance(direct({
    gate: { ...gate(), risk: "high" }
  }));
  assert.equal(result.execution.status, "waiting-assignment");
  assert.deepEqual(result.execution.missing_checks, ["independent-review-passed"]);
  assert.equal(result.progress.status, "waiting-assignment");
  assert.equal(result.next_action, "assign-independent-checks");
});

test("the Owner cannot perform its own independent check", () => {
  const input = direct({
    execution: {
      owner: { agent_id: "agent-owner", status: "completed" },
      checks: [{ id: "independent-review-passed", agent_id: "agent-owner" }]
    },
    gate: {
      ...gate(), risk: "high", authors: ["agent-owner"],
      evidence: [
        ...gate().evidence,
        { id: "independent-review-passed", status: "passed", evidence_ref: "host:review", actor: "agent-owner", actor_type: "agent" }
      ]
    }
  });
  const result = advance(input);
  assert.equal(result.execution.status, "blocked");
  assert.match(result.progress.blocker, /cannot be performed by the owner/);
});

test("Host capability denial never falls back to simulated independence", () => {
  const input = direct({
    execution: {
      owner: { agent_id: "agent-owner", status: "completed" },
      checks: [{ id: "independent-review-passed", agent_id: "agent-reviewer" }]
    },
    gate: {
      ...gate(), risk: "high", authors: ["agent-owner"],
      evidence: [
        ...gate().evidence,
        { id: "independent-review-passed", status: "passed", evidence_ref: "host:review", actor: "agent-reviewer", actor_type: "agent" }
      ]
    }
  });
  const unavailable = { multi_agent: { available: false, default_allowed: false, stable_identity: false, handoff_acknowledgement: false } };
  const result = advanceLoopRaw(input, taxonomy, policy, unavailable);
  assert.equal(result.execution.status, "blocked");
  assert.match(result.progress.blocker, /unavailable, forbidden, or lacks stable identity/);

  const disabled = { multi_agent: { available: true, default_allowed: false, stable_identity: true, handoff_acknowledgement: true } };
  assert.equal(advanceLoopRaw(input, taxonomy, policy, disabled).execution.status, "blocked");
  const optedIn = { ...input, execution: { ...input.execution, multi_agent: "allowed" } };
  assert.equal(advanceLoopRaw(optedIn, taxonomy, policy, disabled).workflow_complete, true);
});

test("stale independent-check bindings are rejected before they recruit an Agent", () => {
  const result = advance(direct({
    execution: {
      owner: { agent_id: "agent-owner", status: "running" },
      checks: [{ id: "independent-review-passed", agent_id: "agent-reviewer" }]
    },
    gate: { ...gate(), risk: "high", claims_completion: false, evidence: [] }
  }));
  assert.equal(result.execution.status, "blocked");
  assert.match(result.progress.blocker, /is not due/);
});

test("stage ownership changes wait for an accepted visible handoff", (context) => {
  const f = fixture(context);
  const base = {
    ...staged(f), stage: "design", completion_stage: "verify", next_stage: "verify",
    execution: {
      owner: { agent_id: "agent-owner", stage: "design", status: "completed" },
      handoff: {
        from_agent: "agent-owner", to_agent: "agent-next", from_stage: "design", to_stage: "verify",
        artifact_ref: `git:${f.head}:result.md`, status: "prepared"
      }
    }
  };
  const waiting = advance(base);
  assert.equal(waiting.execution.status, "waiting-handoff");
  assert.equal(waiting.progress.stage, "design");
  assert.equal(waiting.next_action, "accept-agent-handoff");
  base.execution.handoff.status = "accepted";
  base.execution.handoff.artifact_ref = "git:wrong:result.md";
  assert.equal(advance(base).execution.status, "blocked");
  base.execution.handoff.artifact_ref = `git:${f.head}:result.md`;
  const accepted = advance(base);
  assert.equal(accepted.execution.status, "running");
  assert.equal(accepted.progress.stage, "verify");
  assert.equal(accepted.progress.owner.agent_id, "agent-next");
  assert.equal(Object.hasOwn(accepted.progress, "percentage"), false);
  base.execution.handoff.to_agent = "agent-owner";
  assert.equal(advance(base).execution.status, "blocked");
});

test("independent reviewers cannot be authors or the independent tester", () => {
  const input = { ...gate(), risk: "high", authors: ["author"], required_checks: ["independent-testing-from-authors", "review-independent-from-testing"] };
  input.evidence.push(
    { id: "independent-review-passed", status: "passed", evidence_ref: "host:review", actor: "author", actor_type: "agent" },
    { id: "independent-testing-from-authors", status: "passed", evidence_ref: "host:test", actor: "testing-agent", actor_type: "agent" },
    { id: "review-independent-from-testing", status: "passed", evidence_ref: "host:review", actor: "testing-agent", actor_type: "agent" }
  );
  assert.equal(evaluateGate(input, taxonomy).allowed, false);
  input.evidence[1].actor = "reviewer";
  input.evidence[3].actor = "reviewer";
  assert.equal(evaluateGate(input, taxonomy).allowed, true);
  delete input.authors;
  assert.equal(evaluateGate(input, taxonomy).allowed, false);
});

test("Loop evidence actors must match their independent-check binding", () => {
  const input = direct({
    execution: {
      owner: { agent_id: "agent-author", status: "completed" },
      checks: [{ id: "independent-review-passed", agent_id: "agent-reviewer" }]
    },
    gate: {
      schema_version: 1, risk: "high", mutates_files: false, claims_completion: true,
      authors: ["agent-author"],
      evidence: [
        { id: "verification-passed", status: "passed", evidence_ref: "host:test" },
        { id: "independent-review-passed", status: "passed", evidence_ref: "host:review", actor: "agent-reviewer", actor_type: "agent" }
      ]
    }
  });
  assert.equal(advance(input).workflow_complete, true);
  input.gate.evidence[1].actor = "agent-unassigned";
  assert.equal(advance(input).gate.allowed, false);
});

test("a nonexistent local evidence file cannot satisfy a Gate", () => {
  const input = gate();
  input.evidence[0].evidence_ref = "file:/no-such-zipzap-evidence/test.log";
  assert.equal(evaluateGate(input, taxonomy).allowed, false);
});

test("unrelated rule improvement does not block work; required maintenance resumes its original boundary", (context) => {
  const f = fixture(context);
  const proposal = { fingerprint: "rule-gap", action: "merge", status: "proposed" };
  assert.equal(advance(direct({ proposals: [proposal] })).workflow_complete, true);
  assert.equal(advance(direct({ proposals: [{ ...proposal, blocks_work: true }] })).next_action, "record-maintenance-return");
  const resume = { goal: "Design only", return_to: "design", completion_stage: "design" };
  const input = { ...staged(f), persist: true, cache_root: path.join(f.dir, "cache"), proposals: [{ ...proposal, blocks_work: true }], resume };
  assert.equal(advancePersistedLoop(input, taxonomy, policy).next_loop, "maintenance");
  const closed = { schema_version: 3, loop: "maintenance", loop_id: input.loop_id, project: input.project,
    cache_root: input.cache_root, execution: { owner: { agent_id: "agent-owner", status: "completed" } },
    gate: gate(), proposals: [{ ...proposal, status: "closed", evidence_ref: "host:review" }] };
  const result = advancePersistedLoop(closed, taxonomy, policy);
  assert.equal(result.next_action, "resume-design");
  assert.equal(result.completion_stage, "design");
  assert.deepEqual(result.resume, resume);
});

test("stage completion checks actual Git content and uncommitted changes", (context) => {
  const f = fixture(context);
  const input = staged(f);
  assert.equal(advance(input).workflow_complete, true);
  input.artifacts[0].commit_sha = "0".repeat(40);
  input.gate.evidence[0].commit_sha = "0".repeat(40);
  assert.equal(advance(input).workflow_complete, false);
  input.artifacts[0].commit_sha = f.head;
  input.gate.evidence[0].commit_sha = f.head;
  fs.writeFileSync(path.join(f.dir, "result.md"), "unverified edit\n");
  assert.equal(advance(input).workflow_complete, false);
});

test("an upstream design change invalidates both consumed inputs and old evidence bindings", (context) => {
  const f = fixture(context);
  const input = staged(f);
  input.inputs = [{ id: "design", locator: "spec.md", commit_sha: f.base, accepted_ref: "host:accepted-design" }];
  const digest = evidenceDigest(input.inputs);
  input.artifacts[0].inputs_sha256 = digest;
  input.gate.evidence[0].inputs_sha256 = digest;
  assert.equal(advance(input).workflow_complete, true);
  fs.writeFileSync(path.join(f.dir, "spec.md"), "changed design\n");
  f.git("add", "spec.md"); f.git("commit", "-qm", "change design");
  assert.equal(advance(input).workflow_complete, false);
  input.inputs[0].commit_sha = f.git("rev-parse", "HEAD");
  assert.equal(advance(input).workflow_complete, false);
  const rebound = evidenceDigest(input.inputs);
  input.artifacts[0].inputs_sha256 = rebound;
  input.gate.evidence[0].inputs_sha256 = rebound;
  assert.equal(advance(input).workflow_complete, true);
});

function acceptance() {
  return { scenarios: ["positive", "negative", "boundary", "regression"].map((type, i) => ({
    id: `AC_${i}`, type, applicability: "applicable", condition: "input", action: "run", expected: "correct result"
  })), constraints: [{ id: "INV", applicability: "applicable", statement: "preserve authorization" }] };
}
function acceptedWork() {
  const input = direct({ acceptance: acceptance() });
  const digest = evidenceDigest(input.acceptance);
  input.gate.evidence[0].acceptance_sha256 = digest;
  input.acceptance_evidence = [...input.acceptance.scenarios, ...input.acceptance.constraints].map((item) => ({
    acceptance_id: item.id, status: "passed", evidence_ref: "host:check", acceptance_sha256: digest
  }));
  return input;
}

test("changing an acceptance expectation invalidates prior passing evidence", () => {
  const input = acceptedWork();
  assert.equal(advance(input).workflow_complete, true);
  input.acceptance.scenarios[0].expected = "weaker result";
  assert.equal(advance(input).workflow_complete, false);
});

test("persisted correction budgets survive omitted attempts and interleaved loops", (context) => {
  const f = fixture(context);
  const input = direct({ project: { locator: f.dir }, persist: true, cache_root: path.join(f.dir, "cache"), event: "submitted-result", gate: { ...gate(), evidence: [] } });
  const first = advancePersistedLoop(input, taxonomy, policy);
  assert.equal(first.attempt, 1);
  assert.equal(advancePersistedLoop({ ...input, loop_id: "other-work" }, taxonomy, policy).attempt, 1);
  const second = advancePersistedLoop({ ...input, attempt: 0 }, taxonomy, policy);
  assert.equal(second.outcome, "stop");
  assert.equal(second.attempt, 1);
  const repeated = advancePersistedLoop({ ...input, event: "deterministic-rerun", rerun: { check_id: "verification", input_sha256: first.input_sha256, previous_input_sha256: first.input_sha256 } }, taxonomy, policy);
  assert.equal(repeated.outcome, "stop");
  assert.throws(() => advancePersistedLoop({ ...input, result_ref: "other-result", event: "deterministic-rerun", rerun: { check_id: "verification", input_sha256: first.input_sha256, previous_input_sha256: first.input_sha256 } }, taxonomy, policy), /persisted input/);
});

test("brief projection retains decisions and bindings without repeating the acceptance contract", () => {
  const full = advance(acceptedWork());
  const brief = summarizeLoop(full);
  assert.equal(brief.workflow_complete, full.workflow_complete);
  assert.deepEqual(brief.bindings, full.bindings);
  assert.deepEqual(brief.progress, full.progress);
  assert.equal(Object.hasOwn(brief, "execution"), false);
  assert.equal(Object.hasOwn(brief, "acceptance"), false);
  assert.ok(JSON.stringify(brief).length < JSON.stringify(full).length);
});

test("Host Gate adapter returns a nonzero verdict before the guarded action", (context) => {
  const f = fixture(context);
  const file = path.join(f.dir, "gate.json");
  fs.writeFileSync(file, JSON.stringify({ ...gate(), mutates_files: true, claims_completion: false, evidence: [] }));
  const result = spawnSync(process.execPath, [path.join(root, "scripts/zipzap.mjs"), "gate", "--input", file, "--enforce", "--compact"], { encoding: "utf8" });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).execution_allowed, false);
});

test("handoff round trip preserves design-only continuation and rejects contradictory completion", (context) => {
  const f = fixture(context);
  const input = { schema_version: 1, project: { locator: f.dir }, base: f.base, status: "partial", summary: "Design only",
    work: { goal: "Deliver design without implementation", return_to: "design", completion_stage: "design",
      inputs: [{ id: "intent", locator: "spec.md", commit_sha: f.base, accepted_ref: "host:accepted" }] } };
  assert.equal(validateSchemaFile(root, "schemas/handoff-input.schema.yml", input).valid, true);
  const prepared = prepareGitHandoff(input);
  f.git("commit", "--amend", "-qm", prepared.commit_message);
  const inspected = inspectGitHandoff({ project: input.project });
  assert.deepEqual(inspected.work, input.work);
  assert.equal(inspected.ready_to_resume, true);
  assert.throws(() => prepareGitHandoff({ ...input, status: "complete", verification: [{ command: "tests", status: "failed" }] }), /passing verification/);
  assert.throws(() => prepareGitHandoff({ ...input, status: "complete", verification: [{ command: "tests", status: "passed" }], issues: [{ severity: "high", title: "Unresolved failure" }] }), /unresolved issues/);
  assert.throws(() => prepareGitHandoff({ ...input, summary: "Summary\nZipZap-Status: complete" }), /single-line/);
  f.git("commit", "--amend", "-qm", prepared.commit_message.replace("ZipZap-Status: partial", "ZipZap-Status: complete"));
  const contradictory = inspectGitHandoff({ project: input.project });
  assert.equal(contradictory.consistency.status, "blocked");
  assert.equal(contradictory.ready_to_resume, false);
});
