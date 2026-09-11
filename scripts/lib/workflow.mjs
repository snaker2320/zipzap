import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOOP_TYPES = new Set(["work", "feedback", "maintenance"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);
const RISK_ORDER = new Map([["low", 0], ["medium", 1], ["high", 2]]);
const ENTRY_CHECKS = new Set([
  "scope-understood",
  "human-authorized",
  "collaboration-mode-selected"
]);
const SDLC_STAGES = new Set(["plan", "design", "build", "test", "deploy", "maintain"]);
const ISSUE_STATUSES = new Set(["open", "resolved", "closed"]);
const PROPOSAL_STATUSES = new Set(["proposed", "approved", "applied", "closed"]);
const DEFAULT_NEXT_STAGE = new Map([
  ["plan", "design"],
  ["design", "build"],
  ["build", "test"],
  ["test", "deploy"],
  ["deploy", "maintain"]
]);
const ALLOWED_STAGE_TRANSITIONS = new Map([
  ["plan", new Set(["plan", "design"])],
  ["design", new Set(["plan", "design", "build"])],
  ["build", new Set(["design", "build", "test"])],
  ["test", new Set(["design", "build", "test", "deploy"])],
  ["deploy", new Set(["build", "test", "deploy", "maintain"])],
  ["maintain", new Set(["plan", "design", "build", "maintain"])]
]);

function isEntryCheck(id) {
  return ENTRY_CHECKS.has(id) || id.startsWith("approval-");
}

function policyMode(policy, key, teamOrder) {
  const mode = key === "default_mode" ? policy?.default_mode : policy?.recommendation?.[key];
  if (!teamOrder.includes(mode)) throw new Error(`collaboration policy has no valid ${key} mode`);
  return mode;
}

function recommendedTeam(risk, required, policy, teamOrder) {
  if (risk === "high" || required.has("reviewer-independent-from-tester")) {
    return policyMode(policy, "high_risk_or_full_separation", teamOrder);
  }
  if ([...required].some((id) => id.includes("independent-testing") || id.includes("independent-review"))) {
    return policyMode(policy, "developer_assurance_separation", teamOrder);
  }
  if (required.has("peer-challenge") || required.has("second-context")) {
    return policyMode(policy, "second_context", teamOrder);
  }
  return policyMode(policy, "default_mode", teamOrder);
}

function decisionOptions(recommended, policy, teamOrder) {
  const labels = {
    copilot: {
      recommended: "Copilot 当前工作需要第二上下文质疑",
      stronger: "Copilot 提供第二上下文质疑"
    },
    trio: {
      recommended: "Trio 当前变更需要开发与验证分离",
      stronger: "Trio 提供更强的开发与验证分离"
    },
    squad: {
      recommended: "Squad 当前工作需要完整角色分离",
      stronger: "Squad 提供完整角色分离"
    }
  };
  const options = teamOrder
    .slice(teamOrder.indexOf(recommended))
    .filter((mode) => mode !== "solo")
    .map((mode) => ({
      id: mode,
      label: `${mode === recommended ? `${policy.recommended_prefix} ` : ""}${
        mode === recommended ? labels[mode].recommended : labels[mode].stronger
      }`
    }));
  if (options.length === 1) {
    options.push({
      id: "defer",
      label: "暂不执行 当前风险未满足前保持停止"
    });
  }
  return options;
}

export function assessCollaboration(input, risk, required, policy, teamOrder) {
  if (!Array.isArray(teamOrder) || !teamOrder.length) {
    throw new Error("collaboration team order is unavailable");
  }
  if (!policy?.recommended_prefix) {
    throw new Error("collaboration policy is unavailable");
  }
  const recommended = recommendedTeam(risk, required, policy, teamOrder);
  const selection = input.collaboration ?? null;
  if (
    selection &&
    (!teamOrder.includes(selection.mode) || !selection.actor || !selection.evidence_ref)
  ) {
    throw new Error("collaboration selection requires a valid mode, actor, and evidence_ref");
  }
  const defaultMode = policyMode(policy, "default_mode", teamOrder);
  const selected = selection?.mode ?? (recommended === defaultMode ? defaultMode : null);
  const selectedStrength = selected ? teamOrder.indexOf(selected) : -1;
  const requiredStrength = teamOrder.indexOf(recommended);
  const selectionSatisfied =
    selectedStrength >= requiredStrength &&
    (selected === defaultMode || (Boolean(selection?.actor) && Boolean(selection?.evidence_ref)));
  const decisionRequired = recommended !== defaultMode && !selectionSatisfied;
  return {
    recommended_mode: recommended,
    selected_mode: selectionSatisfied ? selected : null,
    selection_source: selectionSatisfied
      ? selection
        ? "human"
        : "default"
      : null,
    decision_required: decisionRequired,
    decision_options: decisionRequired ? decisionOptions(recommended, policy, teamOrder) : []
  };
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
  const collaboration = assessCollaboration(
    input,
    risk,
    required,
    context.collaborationPolicy,
    context.teamOrder
  );
  if (collaboration.decision_required || input.collaboration?.mode !== undefined) {
    required.add("collaboration-mode-selected");
  }

  const checks = [...required].sort().map((id) => {
    if (id === "collaboration-mode-selected") {
      const passed = collaboration.selected_mode !== null;
      return {
        id,
        passed,
        evidence_ref: passed ? input.collaboration.evidence_ref : null,
        commit_sha: null,
        actor: passed ? input.collaboration.actor : null,
        role: passed ? "human" : null
      };
    }
    const item = evidence.get(id);
    let passed = item?.status === "passed" && Boolean(item.evidence_ref?.trim());
    if (passed && context.commitSha && !isEntryCheck(id)) {
      passed = item.commit_sha === context.commitSha;
    }
    if (
      passed &&
      (id === "independent-review-passed" || id.includes("independent-review") || id.startsWith("reviewer-independent"))
    ) {
      passed = item.role === "reviewer" && Boolean(item.actor);
    }
    if (passed && id.includes("independent-testing")) {
      passed = item.role === "tester" && Boolean(item.actor);
    }
    if (passed && (id === "human-authorized" || id.startsWith("approval-"))) {
      passed = item.role === "human" && Boolean(item.actor);
    }
    return {
      id,
      passed,
      evidence_ref: item?.evidence_ref ?? null,
      commit_sha: item?.commit_sha ?? null,
      actor: item?.actor ?? null,
      role: item?.role ?? null
    };
  });
  const failed = checks.filter((check) => !check.passed);
  return {
    schema_version: 1,
    gate: input.gate ?? "work-completion",
    risk,
    declared_risk: declaredRisk,
    signals: input.signals ?? [],
    collaboration,
    required_approvals: [...approvals].sort(),
    status: failed.length ? "blocked" : "passed",
    allowed: failed.length === 0,
    checks,
    issues: failed.map((check) => ({
      fingerprint: `gate:${check.id}`,
      severity: risk === "high" ? "high" : "medium",
      title: `门禁缺少 ${check.id}`,
      detail: `必须提供 ${check.id} 的通过证据。`
    }))
  };
}

function normalizedIssue(issue, stage = null) {
  const status = issue.status ?? "open";
  if (!ISSUE_STATUSES.has(status)) throw new Error(`unsupported issue status: ${status}`);
  if (status === "closed" && !issue.verification_ref) {
    throw new Error(`closed issue requires verification_ref: ${issue.fingerprint}`);
  }
  let returnStage = issue.return_stage ?? stage;
  if (!issue.return_stage && /(?:build\.|deploy\.smoke)/.test(issue.fingerprint ?? "")) {
    returnStage = "build";
  } else if (!issue.return_stage && /deploy\./.test(issue.fingerprint ?? "")) {
    returnStage = "deploy";
  }
  if (returnStage && !SDLC_STAGES.has(returnStage)) {
    throw new Error(`unsupported issue return stage: ${returnStage}`);
  }
  return {
    ...issue,
    status,
    ...(returnStage ? { return_stage: returnStage } : {})
  };
}

function normalizedIssues(input) {
  const combined = [
    ...(input.issues ?? []),
    ...(input.delivery?.issues ?? [])
  ];
  const stageArtifact = input.artifacts?.find((artifact) => artifact.stage === input.stage);
  if (input.loop === "work" && input.stage && !stageArtifact?.commit_sha) {
    combined.push({
      fingerprint: `sdlc:${input.stage}:artifact-required`,
      checkpoint: input.loop_id ?? "unbound-work",
      title: `${input.stage} requires a Git-bound stage artifact`,
      severity: "medium",
      status: "open",
      return_stage: input.stage
    });
  } else if (input.loop === "work" && input.stage === "build" && !stageArtifact.sha256) {
    combined.push({
      fingerprint: "sdlc:build:artifact-digest-required",
      checkpoint: stageArtifact.commit_sha,
      title: "Build artifact requires a SHA-256 digest",
      severity: "medium",
      status: "open",
      return_stage: "build"
    });
  }
  if (
    input.loop === "work" &&
    input.stage === "deploy" &&
    input.delivery?.operation !== "assess"
  ) {
    combined.push({
      fingerprint: "sdlc:deploy:assessment-required",
      checkpoint: input.artifacts?.at(-1)?.commit_sha ?? "unbound-delivery",
      title: "Deploy requires a delivery assessment",
      severity: "medium",
      status: "open",
      return_stage: "deploy"
    });
  } else if (
    input.loop === "work" &&
    input.stage === "deploy" &&
    (input.delivery.allowed !== true || input.delivery.status !== "passed")
  ) {
    combined.push({
      fingerprint: "sdlc:deploy:assessment-blocked",
      checkpoint: input.artifacts?.at(-1)?.commit_sha ?? "unbound-delivery",
      title: "Deploy delivery assessment is blocked",
      severity: "medium",
      status: "open",
      return_stage: "deploy"
    });
  }
  const unique = new Map();
  for (const issue of combined.map((item) => normalizedIssue(item, input.stage))) {
    unique.set(`${issue.fingerprint}\0${issue.checkpoint}`, issue);
  }
  return [...unique.values()];
}

function normalizedProposals(input) {
  return (input.proposals ?? []).map((proposal) => {
    if (!PROPOSAL_STATUSES.has(proposal.status)) {
      throw new Error(`unsupported proposal status: ${proposal.status}`);
    }
    if (proposal.status !== "proposed" && !proposal.evidence_ref) {
      throw new Error(`${proposal.status} proposal requires evidence_ref: ${proposal.fingerprint}`);
    }
    return proposal;
  });
}

function boundedFailure(attempt, highRisk, deterministicRerun) {
  if (highRisk) return { outcome: "stop", attempt, escalationRequired: true };
  if (deterministicRerun) {
    return { outcome: "continue", attempt, escalationRequired: false };
  }
  if (attempt < 1) {
    return { outcome: "correct", attempt: attempt + 1, escalationRequired: false };
  }
  return { outcome: "stop", attempt, escalationRequired: true };
}

function resolveNextStage(current, requested) {
  if (!current) return requested ?? null;
  const next = requested ?? DEFAULT_NEXT_STAGE.get(current) ?? null;
  if (next && !ALLOWED_STAGE_TRANSITIONS.get(current).has(next)) {
    throw new Error(`unsupported SDLC transition: ${current} -> ${next}`);
  }
  return next;
}

export function advanceLoop(input, riskTaxonomy = null, collaborationContext = {}) {
  if (!LOOP_TYPES.has(input.loop)) throw new Error(`unsupported loop: ${input.loop}`);
  if (input.stage && !SDLC_STAGES.has(input.stage)) throw new Error(`unsupported SDLC stage: ${input.stage}`);
  const attempt = input.attempt ?? 0;
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("loop attempt must be a non-negative integer");
  const deterministicRerun = input.event === "deterministic-rerun";
  if (
    deterministicRerun &&
    (!input.rerun || input.rerun.input_sha256 !== input.rerun.previous_input_sha256)
  ) {
    throw new Error("deterministic rerun requires the same current and previous input_sha256");
  }
  const stageArtifact = input.artifacts?.find((artifact) => artifact.stage === input.stage);
  const gate = evaluateGate(input.gate, riskTaxonomy, {
    commitSha: stageArtifact?.commit_sha ?? null,
    ...collaborationContext
  });
  const issues = normalizedIssues(input);
  const proposals = normalizedProposals(input);
  const activeIssues = issues.filter((issue) => issue.status !== "closed");
  const openIssues = activeIssues.filter((issue) => issue.status === "open");
  const activeProposals = proposals.filter((proposal) => proposal.status !== "closed");
  let outcome = "complete";
  let nextAttempt = attempt;
  let escalationRequired = false;
  let nextLoop = null;
  let nextStage = input.stage ?? null;
  let nextAction = "prepare-git-handoff";
  let reason = null;

  const blockOnGate = () => {
    const failure = boundedFailure(attempt, gate.risk === "high", deterministicRerun);
    ({ outcome, attempt: nextAttempt, escalationRequired } = failure);
    nextLoop = input.loop;
    nextAction = escalationRequired ? "escalate" : "satisfy-gate";
    reason = escalationRequired
      ? gate.risk === "high"
        ? "高风险门禁失败，立即停止并转人工。"
        : "一次自动修正后仍未通过，停止并携带证据转交。"
      : null;
  };
  const entryGateBlocked = gate.checks.some(
    (check) => isEntryCheck(check.id) && !check.passed
  );

  if (gate.collaboration.decision_required) {
    outcome = "stop";
    nextLoop = input.loop;
    nextAction = "select-collaboration-mode";
  } else if (entryGateBlocked) {
    blockOnGate();
  } else if (input.loop === "work" && activeIssues.length) {
    const highRisk = gate.risk === "high" || activeIssues.some((issue) => issue.severity === "high");
    outcome = highRisk ? "stop" : "continue";
    escalationRequired = highRisk;
    nextLoop = "feedback";
    nextStage = activeIssues.find((issue) => issue.return_stage)?.return_stage ?? input.stage ?? null;
    nextAction = highRisk ? "escalate" : "enter-feedback";
    reason = highRisk ? "高风险问题项阻止自动整改，停止并转人工。" : null;
  } else if (input.loop === "feedback" && activeIssues.length) {
    nextLoop = "feedback";
    nextStage = activeIssues.find((issue) => issue.return_stage)?.return_stage ?? input.stage ?? null;
    if (!openIssues.length) {
      outcome = "continue";
      nextAction = "verify-issues";
    } else {
      const highRisk = gate.risk === "high" || openIssues.some((issue) => issue.severity === "high");
      const failure = boundedFailure(attempt, highRisk, deterministicRerun);
      ({ outcome, attempt: nextAttempt, escalationRequired } = failure);
      nextAction = escalationRequired ? "escalate" : "resolve-issues";
      reason = escalationRequired
        ? highRisk
          ? "高风险问题项必须转人工处置。"
          : "一次自动整改后问题项仍未解决，停止并携带证据转交。"
        : null;
    }
  } else if (activeProposals.length) {
    nextLoop = "maintenance";
    const proposed = activeProposals.some((proposal) => proposal.status === "proposed");
    const approved = activeProposals.some((proposal) => proposal.status === "approved");
    if (proposed) {
      outcome = "stop";
      escalationRequired = true;
      nextAction = "obtain-human-review";
      reason = "标准改进提议必须先由人审阅，不得自批准。";
    } else if (approved) {
      const failure = boundedFailure(attempt, false, deterministicRerun);
      ({ outcome, attempt: nextAttempt, escalationRequired } = failure);
      nextAction = escalationRequired ? "escalate" : "apply-approved-standard-change";
      reason = escalationRequired
        ? "一次自动修订后标准改进仍未应用，停止并携带证据转交。"
        : null;
    } else {
      outcome = "continue";
      nextAction = "verify-standard-change";
    }
  } else if (!gate.allowed) {
    blockOnGate();
  } else if (input.loop === "work") {
    nextStage = resolveNextStage(input.stage, input.next_stage);
    nextLoop = nextStage ? "work" : null;
    nextAction = nextStage ? `advance-${nextStage}` : "prepare-git-handoff";
  } else if (input.loop === "feedback") {
    nextStage = input.next_stage ?? issues.find((issue) => issue.return_stage)?.return_stage ?? input.stage ?? null;
    nextLoop = nextStage ? "work" : null;
    nextAction = nextStage ? `resume-${nextStage}` : "prepare-git-handoff";
  } else {
    nextStage = input.next_stage ?? null;
    nextLoop = nextStage ? "work" : null;
    nextAction = nextStage ? `resume-${nextStage}` : "prepare-git-handoff";
  }
  return {
    schema_version: 2,
    loop: input.loop,
    outcome,
    attempt: nextAttempt,
    model_corrections_remaining: Math.max(0, 1 - nextAttempt),
    gate,
    stage: input.stage ?? null,
    next_stage: nextStage,
    next_loop: nextLoop,
    next_action: nextAction,
    artifacts: input.artifacts ?? [],
    issues,
    proposals,
    workflow_complete: outcome === "complete" && nextLoop === null,
    escalation_required: escalationRequired,
    reason
  };
}

export function saveLoopState(input, result) {
  const locator = workflowCachePath(input.project.locator, input.cache_root);
  fs.mkdirSync(path.dirname(locator), { recursive: true });
  const state = {
    schema_version: 2,
    updated_at: new Date().toISOString(),
    loop_id: input.loop_id,
    result
  };
  const temporary = `${locator}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`);
  fs.renameSync(temporary, locator);
  return locator;
}

export function readLoopState(projectRoot, cacheRoot) {
  const locator = workflowCachePath(projectRoot, cacheRoot);
  if (!fs.existsSync(locator)) return { locator, state: null };
  return { locator, state: JSON.parse(fs.readFileSync(locator, "utf8")) };
}

export function consolidateIssues(input) {
  const grouped = new Map();
  for (const rawIssue of input.issues ?? []) {
    const issue = normalizedIssue(rawIssue);
    if (!issue.fingerprint || !issue.checkpoint) {
      throw new Error("每个问题项都需要 fingerprint 和 checkpoint");
    }
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
      ...(representative.return_stage ? { return_stage: representative.return_stage } : {}),
      ...(representative.verification_ref ? { verification_ref: representative.verification_ref } : {}),
      checkpoints,
      occurrences: occurrences.length,
      standard_improvement: shouldPropose ? "proposed" : "not-proposed"
    });
    if (shouldPropose) {
      const bootstrapGap = representative.bootstrap_gap === true;
      proposals.push({
        fingerprint,
        target: bootstrapGap
          ? "AGENTS.md"
          : representative.standard_target ?? null,
        action: bootstrapGap
          ? "propose-revision"
          : representative.standard_target
            ? "merge"
            : "decide-target",
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
    schema_version: 1,
    label: "问题项",
    issues,
    proposals,
    next_loop: activeIssues.length ? "feedback" : proposals.length ? "maintenance" : "work",
    next_action: activeIssues.length
      ? activeIssues.some((issue) => issue.status === "open")
        ? "resolve-issues"
        : "verify-issues"
      : proposals.length
        ? "review-standard-proposals"
        : "resume-work",
    accumulation_policy: "deduplicate-and-merge",
    history_database_created: false
  };
}
