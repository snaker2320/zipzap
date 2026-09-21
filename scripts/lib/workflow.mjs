import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { evidenceDigest, evidenceReferenceExists, inspectArtifact } from "./evidence.mjs";
import { defaultHostCapabilities, readHostCapabilities } from "./host-capabilities.mjs";

const LOOP_TYPES = new Set(["work", "feedback", "maintenance"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);
const RISK_ORDER = new Map([["low", 0], ["medium", 1], ["high", 2]]);
const ENTRY_CHECKS = new Set(["scope-understood", "human-authorized"]);
const SDLC_STAGES = new Set(["plan", "design", "implement", "verify", "deploy", "maintain"]);
const ISSUE_STATUSES = new Set(["open", "resolved", "closed"]);
const PROPOSAL_STATUSES = new Set(["proposed", "approved", "applied", "closed"]);
const ACCEPTANCE_TYPES = new Set(["positive", "negative", "boundary", "regression"]);
const ALLOWED_STAGE_TRANSITIONS = new Map([
  ["plan", new Set(["design"])],
  ["design", new Set(["plan", "implement", "verify"])],
  ["implement", new Set(["design", "verify"])],
  ["verify", new Set(["design", "implement", "deploy"])],
  ["deploy", new Set(["implement", "verify", "maintain"])],
  ["maintain", new Set(["plan", "design", "implement"])]
]);

function isEntryCheck(id) {
  return ENTRY_CHECKS.has(id) || id.startsWith("approval-");
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function repositoryIdentity(projectRoot) {
  const root = path.resolve(projectRoot);
  const git = path.join(root, ".git");
  let gitIdentity = root;
  if (fs.existsSync(git)) {
    gitIdentity = fs.statSync(git).isDirectory()
      ? fs.realpathSync(git)
      : fs.readFileSync(git, "utf8").trim();
  }
  return sha256(`${root}\0${gitIdentity}`).slice(0, 24);
}

export function workflowCachePath(projectRoot, cacheRoot) {
  return path.join(
    cacheRoot ?? path.join(os.homedir(), ".cache", "zipzap"),
    repositoryIdentity(projectRoot),
    "workflow-state.json"
  );
}

export function evaluateGate(input, riskTaxonomy = null, context = {}) {
  const declaredRisk = input.risk ?? "medium";
  if (!RISK_LEVELS.has(declaredRisk)) throw new Error(`unsupported risk level: ${declaredRisk}`);
  let risk = declaredRisk;
  const evidence = new Map();
  for (const item of input.evidence ?? []) {
    if (evidence.has(item.id)) throw new Error(`duplicate gate evidence: ${item.id}`);
    evidence.set(item.id, item);
  }
  const required = new Set(input.required_checks ?? []);
  const approvals = new Set();
  for (const signal of input.signals ?? []) {
    const policy = riskTaxonomy?.signals?.[signal];
    if (!policy) throw new Error(`risk signal is unavailable: ${signal}`);
    if (!RISK_LEVELS.has(policy.risk)) throw new Error(`risk signal has no valid level: ${signal}`);
    if (RISK_ORDER.get(policy.risk) > RISK_ORDER.get(risk)) risk = policy.risk;
    for (const id of policy.effects?.required_evidence ?? []) required.add(id);
    for (const id of policy.effects?.required_gates ?? []) required.add(id);
    for (const approval of policy.effects?.requires_approval ?? []) {
      approvals.add(approval);
      required.add(`approval-${approval}`);
    }
  }
  if (input.mutates_files !== false) required.add("scope-understood");
  if (input.destructive === true || input.external_effect === true || approvals.size) {
    required.add("human-authorized");
  }
  if (input.claims_completion !== false) required.add("verification-passed");
  if (risk === "high") required.add("independent-review-passed");

  const checks = [...required].sort().map((id) => {
    const item = evidence.get(id);
    const entry = isEntryCheck(id);
    const due = entry || input.claims_completion !== false;
    let passed = item?.status === "passed" && evidenceReferenceExists(item.evidence_ref, context.projectRoot);
    if (passed && context.commitSha && !isEntryCheck(id)) passed = item.commit_sha === context.commitSha;
    for (const key of ["inputs_sha256", "acceptance_sha256"]) {
      if (passed && !entry && context[key]) passed = item[key] === context[key];
    }
    const independentReview = id === "independent-review-passed" || id.includes("independent-review") || id.startsWith("review-independent");
    const independentTest = id.includes("independent-testing");
    if (passed && (independentReview || independentTest)) {
      const authors = new Set([...(input.authors ?? []), ...(context.ownerAgentId ? [context.ownerAgentId] : [])]);
      passed = authors.size > 0 && Boolean(item.actor?.trim()) && !authors.has(item.actor) && item.actor_type === "agent";
      if (passed && independentReview && required.has("review-independent-from-testing")) {
        const testers = [...evidence.values()].filter((entry) =>
          entry.id.includes("independent-testing") && entry.status === "passed" && entry.actor);
        passed = testers.length > 0 && testers.every((entry) => entry.actor !== item.actor);
      }
      if (passed && context.enforceCheckIdentity) {
        passed = context.checkActors?.get(id) === item.actor;
      }
    }
    if (passed && (id === "human-authorized" || id.startsWith("approval-"))) {
      passed = item.actor_type === "human" && Boolean(item.actor);
    }
    return {
      id,
      passed,
      phase: entry ? "entry" : "exit",
      due,
      status: passed ? "passed" : item?.status === "passed" ? "invalid" : item?.status ?? "not-run",
      evidence_ref: item?.evidence_ref ?? null,
      commit_sha: item?.commit_sha ?? null,
      actor: item?.actor ?? null,
      actor_type: item?.actor_type ?? null
    };
  });
  const failed = checks.filter((check) => check.due && !check.passed);
  const failedEntryChecks = failed.filter((check) => isEntryCheck(check.id));
  return {
    schema_version: 1,
    gate: input.gate ?? "work-completion",
    risk,
    declared_risk: declaredRisk,
    signals: input.signals ?? [],
    required_approvals: [...approvals].sort(),
    enforcement: "decision-only",
    evidence_authority: "host-attested-with-local-binding-checks",
    status: failed.length ? "blocked" : input.claims_completion === false ? "pending" : "passed",
    allowed: failed.length === 0,
    execution_allowed: failedEntryChecks.length === 0,
    completion_allowed: input.claims_completion !== false && failed.length === 0,
    checks,
    issues: failed.map((check) => ({
      fingerprint: `gate:${check.id}`,
      severity: risk === "high" ? "high" : "medium",
      title: `门禁缺少 ${check.id}`,
      detail: `必须提供 ${check.id} 的通过证据。`
    }))
  };
}

function needsIndependentActor(id) {
  return id === "independent-review-passed" || id.includes("independent-review") ||
    id.startsWith("review-independent") || id.includes("independent-testing");
}

function executionState(input, gate, nextStage, workflowComplete, hostCapabilities) {
  const facts = input.execution ?? {};
  const owner = facts.owner ?? null;
  const checks = facts.checks ?? [];
  const handoff = facts.handoff ?? null;
  const requiredChecks = gate.checks.filter((check) => check.due && needsIndependentActor(check.id)).map((check) => check.id);
  const result = {
    status: workflowComplete ? "completed" : "running",
    owner,
    checks,
    handoff,
    required_checks: requiredChecks,
    missing_checks: [],
    release_agents: [],
    blockers: [],
    next_action: null
  };
  if (!owner) {
    result.status = "waiting-assignment";
    result.next_action = "assign-owner";
    result.blockers.push("Work has no assigned owner");
    return result;
  }
  if (owner.status === "blocked") {
    result.status = "blocked";
    result.blockers.push(`Owner ${owner.agent_id} is blocked`);
    return result;
  }
  if (input.stage && owner.stage !== input.stage) {
    result.status = "blocked";
    result.blockers.push(`Owner stage ${owner.stage ?? "missing"} does not match ${input.stage}`);
    return result;
  }

  const checkActors = new Map();
  for (const check of checks) {
    if (checkActors.has(check.id)) result.blockers.push(`Independent check ${check.id} has multiple actors`);
    checkActors.set(check.id, check.agent_id);
    if (!requiredChecks.includes(check.id)) result.blockers.push(`Independent check ${check.id} is not due`);
    if (check.agent_id === owner.agent_id) result.blockers.push(`Independent check ${check.id} cannot be performed by the owner`);
    if ((input.gate.authors ?? []).includes(check.agent_id)) result.blockers.push(`Independent check ${check.id} cannot be performed by an author`);
  }
  result.missing_checks = requiredChecks.filter((id) => !checkActors.has(id));
  if (result.blockers.length) {
    result.status = "blocked";
    return result;
  }
  if (result.missing_checks.length) {
    result.status = "waiting-assignment";
    result.next_action = "assign-independent-checks";
    result.blockers.push(`Independent checks need actors: ${result.missing_checks.join(", ")}`);
    return result;
  }

  const testingActors = new Set(checks.filter((check) => check.id.includes("independent-testing")).map((check) => check.agent_id));
  const reviewActors = checks.filter((check) => check.id === "independent-review-passed" || check.id.startsWith("review-independent"));
  if (requiredChecks.includes("review-independent-from-testing") && reviewActors.some((check) => testingActors.has(check.agent_id))) {
    result.status = "blocked";
    result.blockers.push("Independent review and independent testing require different Agents");
    return result;
  }

  const participants = new Set([owner.agent_id, ...checks.map((check) => check.agent_id), ...(handoff ? [handoff.to_agent] : [])]);
  if (participants.size > 1) {
    const capability = hostCapabilities?.multi_agent ?? {};
    const allowed = facts.multi_agent ? facts.multi_agent === "allowed" : capability.default_allowed === true;
    if (capability.available !== true || allowed !== true || capability.stable_identity !== true) {
      result.status = "blocked";
      result.blockers.push("Host multi-Agent execution is unavailable, forbidden, or lacks stable identity");
      return result;
    }
    if (handoff && capability.handoff_acknowledgement !== true) {
      result.status = "blocked";
      result.blockers.push("Host cannot attest handoff acknowledgement");
      return result;
    }
  }

  if (handoff) {
    const targetStage = nextStage ?? input.stage;
    const artifact = input.artifacts?.find((item) => item.stage === input.stage);
    const artifactRef = artifact ? `git:${artifact.commit_sha}:${artifact.locator}` : null;
    const valid = input.loop === "work" && input.stage && nextStage && nextStage !== input.stage &&
      handoff.from_agent === owner.agent_id && handoff.to_agent !== owner.agent_id &&
      handoff.from_stage === input.stage && handoff.to_stage === targetStage &&
      (!artifactRef || handoff.artifact_ref === artifactRef);
    if (!valid) {
      result.status = "blocked";
      result.blockers.push("Handoff does not match the current owner, stage, target, and artifact");
      return result;
    }
    if (owner.status !== "completed") {
      result.status = "blocked";
      result.blockers.push("Owner must complete the current boundary before handoff");
      return result;
    }
    if (handoff.status !== "accepted") {
      result.status = "waiting-handoff";
      result.next_action = "accept-agent-handoff";
      result.blockers.push(`Handoff to ${handoff.to_agent} has not been accepted`);
      return result;
    }
  }

  const advancingStagedWork = input.loop === "work" && input.stage && nextStage && nextStage !== input.stage;
  if ((workflowComplete || advancingStagedWork) && owner.status !== "completed") {
    result.status = "blocked";
    result.blockers.push("Owner has not completed the current Work boundary");
    return result;
  }
  if (workflowComplete) {
    result.release_agents = [...participants];
    return result;
  }
  return result;
}

function progressSnapshot(input, execution, workflowComplete, outcome, nextStage, reason) {
  let status = workflowComplete ? "completed" : execution.status;
  if (!workflowComplete && status === "running" && outcome === "stop") status = "blocked";
  const transitioned = !workflowComplete && outcome === "continue" && nextStage && execution.status === "running";
  const accepted = execution.handoff?.status === "accepted";
  const owner = transitioned
    ? accepted
      ? { agent_id: execution.handoff.to_agent, status: "assigned" }
      : execution.owner ? { agent_id: execution.owner.agent_id, status: "assigned" } : null
    : execution.owner ? { agent_id: execution.owner.agent_id, status: execution.owner.status } : null;
  const blocker = execution.blockers[0] ?? (status === "blocked" ? reason : null);
  return { stage: transitioned ? nextStage : input.stage ?? "direct", status, owner, next_stage: nextStage, blocker };
}

function normalizedIssue(issue, returnTo = null) {
  const status = issue.status ?? "open";
  if (!ISSUE_STATUSES.has(status)) throw new Error(`unsupported issue status: ${status}`);
  if (status === "closed" && !issue.verification_ref) {
    throw new Error(`closed issue requires verification_ref: ${issue.fingerprint}`);
  }
  let target = issue.return_to ?? returnTo;
  if (!issue.return_to && /(?:build\.|deploy\.smoke)/.test(issue.fingerprint ?? "")) target = "implement";
  else if (!issue.return_to && /deploy\./.test(issue.fingerprint ?? "")) target = "deploy";
  if (target && target !== "direct" && !SDLC_STAGES.has(target)) {
    throw new Error(`unsupported issue return target: ${target}`);
  }
  return { ...issue, status, ...(target ? { return_to: target } : {}) };
}

function acceptanceIssues(input, returnTo) {
  if (!input.acceptance) return [];
  const ids = new Set();
  const types = new Set();
  const entries = [...input.acceptance.scenarios, ...(input.acceptance.constraints ?? [])];
  for (const item of input.acceptance.scenarios) types.add(item.type);
  for (const type of ACCEPTANCE_TYPES) {
    if (!types.has(type)) throw new Error(`acceptance contract must address ${type} scenarios`);
  }
  for (const item of entries) {
    if (ids.has(item.id)) throw new Error(`duplicate acceptance id: ${item.id}`);
    ids.add(item.id);
  }
  const evidence = new Map();
  for (const item of input.acceptance_evidence ?? []) {
    if (!ids.has(item.acceptance_id)) throw new Error(`unknown acceptance id: ${item.acceptance_id}`);
    if (evidence.has(item.acceptance_id)) throw new Error(`duplicate acceptance evidence: ${item.acceptance_id}`);
    evidence.set(item.acceptance_id, item);
  }
  if (input.gate?.claims_completion === false) return [];
  const digest = evidenceDigest(input.acceptance);
  return entries
    .filter((item) => item.applicability === "applicable")
    .filter((item) => {
      const check = evidence.get(item.id);
      return check?.status !== "passed" || check.acceptance_sha256 !== digest ||
        !evidenceReferenceExists(check.evidence_ref, input.project?.locator);
    })
    .map((item) => ({
      fingerprint: `acceptance:${item.id}`,
      checkpoint: input.loop_id ?? "unbound-work",
      title: `Acceptance item ${item.id} lacks passing evidence`,
      severity: "medium",
      status: "open",
      return_to: returnTo
    }));
}

function normalizedIssues(input, bindings) {
  const defaultReturn = input.stage ?? "direct";
  const combined = [
    ...(input.issues ?? []),
    ...(input.delivery?.issues ?? []),
    ...acceptanceIssues(input, defaultReturn)
  ];
  const stageArtifact = input.artifacts?.find((artifact) => artifact.stage === input.stage);
  if (input.gate.claims_completion !== false && input.event !== "internal-iteration") {
    const candidates = [
      ...(stageArtifact ? [{ artifact: stageArtifact, id: `stage-${input.stage}`, bindInputs: true }] : []),
      ...(input.inputs ?? []).map((artifact) => ({ artifact, id: artifact.id, bindInputs: false }))
    ];
    for (const { artifact, id, bindInputs } of candidates) {
      const checked = inspectArtifact(input.project.locator, artifact, { current: true });
      const accepted = !artifact.accepted_ref || evidenceReferenceExists(artifact.accepted_ref, input.project.locator);
      const bound = !bindInputs ||
        !bindings.inputs_sha256 || artifact.inputs_sha256 === bindings.inputs_sha256;
      if (!checked.passed || !accepted || !bound) combined.push({
        fingerprint: `artifact:${id}:invalid`, checkpoint: input.loop_id,
        title: checked.reason ?? (!accepted ? "Input acceptance reference is missing" : "Artifact input bindings are stale"),
        severity: "medium", status: "open", return_to: defaultReturn
      });
    }
  }
  if (input.loop === "work" && input.stage && !stageArtifact?.commit_sha) {
    combined.push({
      fingerprint: `sdlc:${input.stage}:artifact-required`, checkpoint: input.loop_id ?? "unbound-work",
      title: `${input.stage} requires a Git-bound stage artifact`, severity: "medium", status: "open",
      return_to: input.stage
    });
  }
  if (input.loop === "work" && !input.stage && !input.result_ref) {
    combined.push({
      fingerprint: "work:direct-result-required", checkpoint: input.loop_id ?? "unbound-work",
      title: "Direct Work requires result_ref", severity: "medium", status: "open", return_to: "direct"
    });
  }
  if (input.loop === "work" && input.stage === "deploy" && input.delivery?.operation !== "assess") {
    combined.push({
      fingerprint: "sdlc:deploy:assessment-required",
      checkpoint: input.artifacts?.at(-1)?.commit_sha ?? "unbound-delivery",
      title: "Deploy requires a delivery assessment", severity: "medium", status: "open", return_to: "deploy"
    });
  } else if (input.loop === "work" && input.stage === "deploy" && (input.delivery.allowed !== true || input.delivery.status !== "passed")) {
    combined.push({
      fingerprint: "sdlc:deploy:assessment-blocked",
      checkpoint: input.artifacts?.at(-1)?.commit_sha ?? "unbound-delivery",
      title: "Deploy delivery assessment is blocked", severity: "medium", status: "open", return_to: "deploy"
    });
  } else if (input.loop === "work" && input.stage === "deploy" &&
    (input.delivery.artifact?.commit_sha !== stageArtifact?.commit_sha || !input.delivery.checks?.length || input.delivery.checks.some((check) => !check.passed))) {
    combined.push({
      fingerprint: "sdlc:deploy:assessment-unbound", checkpoint: input.loop_id,
      title: "Deploy assessment must contain passing checks bound to the stage commit",
      severity: "medium", status: "open", return_to: "deploy"
    });
  }
  const unique = new Map();
  for (const issue of combined.map((item) => normalizedIssue(item, defaultReturn))) {
    unique.set(`${issue.fingerprint}\0${issue.checkpoint}`, issue);
  }
  return [...unique.values()];
}

function normalizedProposals(input) {
  return (input.proposals ?? []).map((proposal) => {
    if (!PROPOSAL_STATUSES.has(proposal.status)) throw new Error(`unsupported proposal status: ${proposal.status}`);
    if (proposal.status !== "proposed" && !proposal.evidence_ref) {
      throw new Error(`${proposal.status} proposal requires evidence_ref: ${proposal.fingerprint}`);
    }
    return proposal;
  });
}

function boundedFailure(attempt, highRisk, deterministicRerun) {
  if (highRisk) return { outcome: "stop", attempt, escalationRequired: true };
  if (deterministicRerun) return { outcome: "continue", attempt, escalationRequired: false };
  if (attempt < 1) return { outcome: "correct", attempt: attempt + 1, escalationRequired: false };
  return { outcome: "stop", attempt, escalationRequired: true };
}

function assertStageContract(input) {
  const artifactStages = new Set();
  for (const artifact of input.artifacts ?? []) {
    if (artifactStages.has(artifact.stage)) {
      throw new Error(`duplicate stage artifact: ${artifact.stage}`);
    }
    artifactStages.add(artifact.stage);
  }
  if (!input.stage) return;
  if (!SDLC_STAGES.has(input.stage)) throw new Error(`unsupported SDLC stage: ${input.stage}`);
  if (!SDLC_STAGES.has(input.completion_stage)) throw new Error("staged Work requires completion_stage");
  if (input.next_stage) {
    if (!ALLOWED_STAGE_TRANSITIONS.get(input.stage).has(input.next_stage)) {
      throw new Error(`unsupported SDLC transition: ${input.stage} -> ${input.next_stage}`);
    }
    if (input.stage === input.completion_stage) throw new Error("completed stage cannot request next_stage");
  }
}

export function advanceLoop(input, riskTaxonomy = null, workflowPolicy = {}, hostCapabilities = defaultHostCapabilities()) {
  if (!LOOP_TYPES.has(input.loop)) throw new Error(`unsupported loop: ${input.loop}`);
  assertStageContract(input);
  if (input.loop === "work" && input.resume && (
    input.resume.return_to !== (input.stage ?? "direct") ||
    input.resume.completion_stage !== input.completion_stage ||
    (!input.stage && input.resume.result_ref !== input.result_ref)
  )) throw new Error("maintenance return boundary must preserve the current Work contract");
  const attempt = input.attempt ?? 0;
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("loop attempt must be a non-negative integer");
  const deterministicRerun = input.event === "deterministic-rerun";
  if (deterministicRerun && (!input.rerun || input.rerun.input_sha256 !== input.rerun.previous_input_sha256)) {
    throw new Error("deterministic rerun requires the same current and previous input_sha256");
  }
  const stageArtifact = input.artifacts?.find((artifact) => artifact.stage === input.stage);
  const inputIds = (input.inputs ?? []).map((item) => item.id);
  if (new Set(inputIds).size !== inputIds.length) throw new Error("duplicate input id");
  const bindings = {
    ...(input.inputs?.length ? { inputs_sha256: evidenceDigest([...input.inputs].sort((a, b) => a.id.localeCompare(b.id))) } : {}),
    ...(input.acceptance ? { acceptance_sha256: evidenceDigest(input.acceptance) } : {})
  };
  const gate = evaluateGate(input.gate, riskTaxonomy, {
    commitSha: stageArtifact?.commit_sha ?? null,
    projectRoot: input.project.locator,
    ownerAgentId: input.execution?.owner?.agent_id ?? null,
    checkActors: new Map((input.execution?.checks ?? []).map((check) => [check.id, check.agent_id])),
    enforceCheckIdentity: true,
    ...bindings
  });
  const issues = normalizedIssues(input, bindings).map((issue) =>
    input.loop === "feedback" &&
    input.event === "feedback-verification-failed" &&
    issue.status === "resolved"
      ? { ...issue, status: "open" }
      : issue
  );
  const proposals = normalizedProposals(input);
  const activeIssues = issues.filter((issue) => issue.status !== "closed");
  const openIssues = activeIssues.filter((issue) => issue.status === "open");
  const activeProposals = proposals.filter((proposal) => proposal.status !== "closed" &&
    (input.loop === "maintenance" || proposal.blocks_work === true));
  const highRiskOpenIssues = openIssues.some((issue) => issue.severity === "high");
  const proposedStandardChange = activeProposals.some((proposal) => proposal.status === "proposed");
  let outcome = "complete";
  let nextAttempt = attempt;
  let escalationRequired = false;
  let nextLoop = null;
  let nextStage = null;
  const completionAction = input.handoff_required === true ? "prepare-git-handoff" : "report-result";
  let nextAction = completionAction;
  let reason = null;

  const returnTarget = (items) => items.find((issue) => issue.return_to)?.return_to ?? (input.stage ?? "direct");
  const applyBoundedFailure = (highRisk, action) => {
    const failure = boundedFailure(attempt, highRisk, deterministicRerun);
    ({ outcome, attempt: nextAttempt, escalationRequired } = failure);
    nextLoop = input.loop;
    nextAction = escalationRequired ? "escalate" : action;
    reason = escalationRequired
      ? highRisk ? "高风险门禁或问题项失败，立即停止并转人工。" : "一次自动修正后仍未通过，停止并携带证据转交。"
      : null;
  };
  const failedEntry = gate.checks.some((check) => isEntryCheck(check.id) && !check.passed);

  if (failedEntry) {
    outcome = "stop";
    nextLoop = input.loop;
    nextStage = input.stage ?? null;
    nextAction = "satisfy-entry-gate";
  } else if (highRiskOpenIssues) {
    outcome = "stop";
    escalationRequired = true;
    nextLoop = input.loop === "work" ? "feedback" : input.loop;
    const target = returnTarget(activeIssues);
    nextStage = target === "direct" ? null : target;
    nextAction = "escalate";
    reason = "高风险问题项阻止自动整改，停止并转人工。";
  } else if (proposedStandardChange) {
    outcome = "stop";
    escalationRequired = true;
    nextLoop = "maintenance";
    nextAction = "obtain-human-review";
    reason = "标准改进提议必须先由人审阅，不得自批准。";
    if (input.loop !== "maintenance" && !input.resume) {
      nextAction = "record-maintenance-return";
      reason = "必要的标准改进阻塞当前交付；先记录原 Work 的目标、返回位置和结束节点。";
    }
  } else if (input.event === "internal-iteration") {
    outcome = "continue";
    nextLoop = input.loop;
    nextStage = input.stage ?? null;
    nextAction = "continue-internal-iteration";
  } else if (input.loop === "work" && activeIssues.length) {
    const highRisk = gate.risk === "high" || activeIssues.some((issue) => issue.severity === "high");
    outcome = highRisk ? "stop" : "continue";
    escalationRequired = highRisk;
    nextLoop = "feedback";
    const target = returnTarget(activeIssues);
    nextStage = target === "direct" ? null : target;
    nextAction = highRisk ? "escalate" : "enter-feedback";
    reason = highRisk ? "高风险问题项阻止自动整改，停止并转人工。" : null;
  } else if (input.loop === "feedback" && activeIssues.length) {
    nextLoop = "feedback";
    const target = returnTarget(activeIssues);
    nextStage = target === "direct" ? null : target;
    if (input.event === "feedback-verification-failed") {
      applyBoundedFailure(gate.risk === "high", "resolve-issues");
    } else if (!openIssues.length) {
      outcome = "continue";
      nextAction = "verify-issues";
    } else {
      outcome = "continue";
      nextAction = "resolve-issues";
    }
  } else if (activeProposals.length) {
    nextLoop = "maintenance";
    const approved = activeProposals.some((proposal) => proposal.status === "approved");
    if (approved) {
      outcome = "continue";
      nextAction = "apply-approved-standard-change";
    } else {
      outcome = "continue";
      nextAction = "verify-standard-change";
    }
  } else if (!gate.allowed) {
    if (input.event === "submitted-result" || deterministicRerun) {
      applyBoundedFailure(gate.risk === "high", "satisfy-gate");
    } else {
      outcome = "stop";
      nextLoop = input.loop;
      nextAction = "satisfy-gate";
      reason = "出口门禁尚未通过；只有 submitted-result 失败才消耗自动修正次数。";
    }
    nextStage = input.stage ?? null;
  } else if (input.gate.claims_completion === false) {
    outcome = "continue";
    nextLoop = input.loop;
    nextStage = input.stage ?? null;
    nextAction = "continue-internal-iteration";
  } else if (input.loop === "work" && input.stage) {
    if (input.stage === input.completion_stage) nextAction = completionAction;
    else if (input.next_stage) {
      outcome = "continue";
      nextLoop = "work";
      nextStage = input.next_stage;
      nextAction = `advance-${input.next_stage}`;
    } else {
      outcome = "stop";
      nextLoop = "work";
      nextAction = "await-explicit-next-stage";
      reason = `当前阶段 ${input.stage} 已通过，但结束节点是 ${input.completion_stage}；必须显式提供 next_stage。`;
    }
  } else if (input.loop === "feedback") {
    const target = returnTarget(issues);
    outcome = "continue";
    nextLoop = "work";
    nextStage = target === "direct" ? null : target;
    nextAction = target === "direct" ? "resume-direct-work" : `resume-${target}`;
  } else if (input.loop === "maintenance" && input.resume) {
    outcome = "continue";
    nextLoop = "work";
    nextStage = input.resume.return_to === "direct" ? null : input.resume.return_to;
    nextAction = nextStage ? `resume-${nextStage}` : "resume-direct-work";
  }

  let workflowComplete = outcome === "complete" && nextLoop === null;
  const completedBeforeExecutionCheck = workflowComplete;
  const execution = executionState(input, gate, nextStage, workflowComplete, hostCapabilities);
  if (["waiting-assignment", "waiting-handoff", "blocked"].includes(execution.status)) {
    outcome = "stop";
    if (completedBeforeExecutionCheck) nextLoop = input.loop;
    nextAction = execution.next_action ?? "resolve-execution-blocker";
    reason = execution.blockers[0] ??
      (execution.status === "waiting-assignment" ? "等待 Host 分配真实 Agent。" : "等待显式 Agent 交接。");
    workflowComplete = false;
  }
  const progress = progressSnapshot(input, execution, workflowComplete, outcome, nextStage, reason);
  return {
    schema_version: 3,
    loop: input.loop,
    outcome,
    attempt: nextAttempt,
    model_corrections_remaining: Math.max(0, 1 - nextAttempt),
    gate,
    work_kind: input.stage || input.completion_stage ? "staged" : "direct",
    stage: input.stage ?? null,
    completion_stage: input.completion_stage ?? input.resume?.completion_stage ?? null,
    next_stage: nextStage,
    next_loop: nextLoop,
    next_action: nextAction,
    result_ref: input.result_ref ?? null,
    resume: input.resume ?? null,
    inputs: input.inputs ?? [],
    bindings,
    handoff_required: input.handoff_required === true,
    artifacts: input.artifacts ?? [],
    acceptance: input.acceptance ?? null,
    acceptance_evidence: input.acceptance_evidence ?? [],
    issues,
    proposals,
    workflow_complete: workflowComplete,
    execution,
    progress,
    escalation_required: escalationRequired,
    reason
  };
}

export function summarizeLoop(result) {
  const { artifacts, acceptance, acceptance_evidence, issues, proposals, inputs, gate, execution, ...summary } = result;
  return {
    ...summary,
    view: "summary",
    gate: {
      status: gate.status, risk: gate.risk, execution_allowed: gate.execution_allowed,
      completion_allowed: gate.completion_allowed, enforcement: gate.enforcement,
      missing: gate.checks.filter((check) => check.due && !check.passed).map(({ id, status }) => ({ id, status }))
    },
    issues: issues.filter((issue) => issue.status !== "closed"),
    proposals: proposals.filter((proposal) => proposal.status !== "closed").map(({ fingerprint, status, blocks_work }) => ({ fingerprint, status, blocks_work: blocks_work === true })),
    artifact_refs: artifacts.map(({ stage, locator, commit_sha }) => ({ stage, locator, commit_sha })),
    input_refs: inputs.map(({ id, locator, commit_sha }) => ({ id, locator, commit_sha }))
  };
}

function loopStatePath(input) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.loop_id)) throw new Error("invalid loop id");
  return path.join(path.dirname(workflowCachePath(input.project.locator, input.cache_root)), "loops", `${input.loop_id}.json`);
}

export function advancePersistedLoop(input, riskTaxonomy, workflowPolicy, hostCapabilities = null) {
  const capabilities = hostCapabilities ?? readHostCapabilities(input.cache_root).profile;
  if (input.persist === false) return { ...advanceLoop(input, riskTaxonomy, workflowPolicy, capabilities), persistence: "simulation", cache_locator: null };
  const locator = loopStatePath(input);
  fs.mkdirSync(path.dirname(locator), { recursive: true });
  const lock = `${locator}.lock`;
  try { fs.mkdirSync(lock); } catch (error) {
    if (error.code === "EEXIST") throw new Error("loop is being advanced; inspect the lock before retrying");
    throw error;
  }
  try {
    const legacy = readLoopState(input.project.locator, input.cache_root).state;
    const previous = fs.existsSync(locator) ? JSON.parse(fs.readFileSync(locator, "utf8")) : legacy?.loop_id === input.loop_id ? legacy : null;
    const { event, rerun, attempt, persist, cache_root, ...payload } = input;
    const digest = evidenceDigest(payload);
    const restored = { ...input, attempt: Math.max(input.attempt ?? 0, previous?.result.attempt ?? 0) };
    if (input.loop === "maintenance" && previous?.result.resume && !restored.resume) restored.resume = previous.result.resume;
    const previousAcceptance = previous?.acceptance_sha256 ?? previous?.result.bindings?.acceptance_sha256;
    const currentAcceptance = input.acceptance ? evidenceDigest(input.acceptance) : null;
    if (input.loop === "work" && previousAcceptance && previousAcceptance !== currentAcceptance &&
      !evidenceReferenceExists(input.acceptance_change_ref, input.project.locator)) {
      throw new Error("changing or removing acceptance requires acceptance_change_ref and fresh evidence");
    }
    if (input.event === "deterministic-rerun") {
      if (!previous || previous.input_sha256 !== digest || input.rerun.input_sha256 !== digest ||
        input.rerun.previous_input_sha256 !== digest) throw new Error("deterministic rerun does not match the persisted input");
      return { ...previous.result, cache_locator: locator, deterministic_rerun: true };
    }
    const result = advanceLoop(restored, riskTaxonomy, workflowPolicy, capabilities);
    const state = {
      schema_version: 3, updated_at: new Date().toISOString(), loop_id: input.loop_id,
      input_sha256: digest, acceptance_sha256: input.loop === "work" ? currentAcceptance : previousAcceptance ?? null, result
    };
    const temporary = `${locator}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state)}\n`);
    fs.renameSync(temporary, locator);
    return { ...result, persistence: "recorded", input_sha256: digest, cache_locator: locator };
  } finally { fs.rmdirSync(lock); }
}

export function saveLoopState(input, result) {
  const locator = workflowCachePath(input.project.locator, input.cache_root);
  fs.mkdirSync(path.dirname(locator), { recursive: true });
  const state = { schema_version: 3, updated_at: new Date().toISOString(), loop_id: input.loop_id, result };
  const temporary = `${locator}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, locator);
  return locator;
}

export function readLoopState(projectRoot, cacheRoot, loopId = null) {
  const locator = loopId ? loopStatePath({ project: { locator: projectRoot }, cache_root: cacheRoot, loop_id: loopId }) : workflowCachePath(projectRoot, cacheRoot);
  if (!fs.existsSync(locator)) return { locator, state: null };
  return { locator, state: JSON.parse(fs.readFileSync(locator, "utf8")) };
}

export function consolidateIssues(input) {
  const grouped = new Map();
  for (const rawIssue of input.issues ?? []) {
    const issue = normalizedIssue(rawIssue);
    if (!issue.fingerprint || !issue.checkpoint) throw new Error("每个问题项都需要 fingerprint 和 checkpoint");
    if (!grouped.has(issue.fingerprint)) grouped.set(issue.fingerprint, []);
    grouped.get(issue.fingerprint).push(issue);
  }
  const issues = [];
  const proposals = [];
  for (const [fingerprint, occurrences] of grouped) {
    const checkpoints = [...new Set(occurrences.map((item) => item.checkpoint))];
    const representative = occurrences.at(-1);
    const highRisk = occurrences.some((item) => item.severity === "high");
    const shouldPropose = highRisk || checkpoints.length >= 2;
    issues.push({
      fingerprint,
      title: representative.title,
      severity: highRisk ? "high" : representative.severity ?? "medium",
      status: representative.status,
      ...(representative.return_to ? { return_to: representative.return_to } : {}),
      ...(representative.verification_ref ? { verification_ref: representative.verification_ref } : {}),
      checkpoints,
      occurrences: occurrences.length,
      standard_improvement: shouldPropose ? "proposed" : "not-proposed"
    });
    if (shouldPropose) {
      const bootstrapGap = representative.bootstrap_gap === true;
      proposals.push({
        fingerprint,
        target: bootstrapGap ? "AGENTS.md" : representative.standard_target ?? null,
        action: bootstrapGap ? "propose-revision" : representative.standard_target ? "merge" : "decide-target",
        status: "proposed",
        instruction: bootstrapGap
          ? "这是重复出现的路由入口缺口；提出最小 AGENTS.md 修订，必须人工审阅，不得自动应用。"
          : representative.standard_target
            ? `合并或修订 ${representative.standard_target} 的现有规则；不要追加重复段落。`
            : "先选择最窄的现有 standards 文件；仅在没有合适权威来源时新建。",
        auto_apply: false,
        agents_md_allowed: bootstrapGap
      });
    }
  }
  const activeIssues = issues.filter((issue) => issue.status !== "closed");
  return {
    schema_version: 2,
    label: "问题项",
    issues,
    proposals,
    next_loop: activeIssues.length ? "feedback" : proposals.length ? "maintenance" : "work",
    next_action: activeIssues.length
      ? activeIssues.some((issue) => issue.status === "open") ? "resolve-issues" : "verify-issues"
      : proposals.length ? "review-standard-proposals" : "resume-work",
    accumulation_policy: "deduplicate-and-merge",
    history_database_created: false
  };
}
