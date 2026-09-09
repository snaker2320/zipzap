import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LOOP_TYPES = new Set(["work", "feedback", "maintenance"]);
const RISK_LEVELS = new Set(["low", "medium", "high"]);

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

export function evaluateGate(input) {
  const risk = input.risk ?? "medium";
  if (!RISK_LEVELS.has(risk)) throw new Error(`unsupported risk level: ${risk}`);
  const evidence = new Map((input.evidence ?? []).map((item) => [item.id, item]));
  const required = new Set(input.required_checks ?? []);
  if (input.mutates_files !== false) required.add("scope-understood");
  if (input.destructive === true || input.external_effect === true) required.add("human-authorized");
  if (input.claims_completion !== false) required.add("verification-passed");
  if (risk === "high") required.add("independent-review-passed");

  const checks = [...required].sort().map((id) => {
    const item = evidence.get(id);
    return {
      id,
      passed: item?.status === "passed",
      evidence_ref: item?.evidence_ref ?? null
    };
  });
  const failed = checks.filter((check) => !check.passed);
  return {
    schema_version: 1,
    gate: input.gate ?? "work-completion",
    risk,
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

export function advanceLoop(input) {
  if (!LOOP_TYPES.has(input.loop)) throw new Error(`unsupported loop: ${input.loop}`);
  const attempt = input.attempt ?? 0;
  if (!Number.isInteger(attempt) || attempt < 0) throw new Error("loop attempt must be a non-negative integer");
  const gate = evaluateGate(input.gate);
  const highRiskFailure = gate.risk === "high" && !gate.allowed;
  const deterministicRerun = input.event === "deterministic-rerun";
  let outcome;
  let nextAttempt = attempt;
  if (gate.allowed) {
    outcome = "complete";
  } else if (highRiskFailure) {
    outcome = "stop";
  } else if (deterministicRerun) {
    outcome = "continue";
  } else if (attempt < 1) {
    outcome = "correct";
    nextAttempt += 1;
  } else {
    outcome = "stop";
  }
  return {
    schema_version: 1,
    loop: input.loop,
    outcome,
    attempt: nextAttempt,
    model_corrections_remaining: Math.max(0, 1 - nextAttempt),
    gate,
    escalation_required: outcome === "stop",
    reason: outcome === "stop"
      ? highRiskFailure
        ? "高风险门禁失败，立即停止并转人工。"
        : "一次自动修正后仍未通过，停止并携带证据转交。"
      : null
  };
}

export function saveLoopState(input, result) {
  const locator = workflowCachePath(input.project.locator, input.cache_root);
  fs.mkdirSync(path.dirname(locator), { recursive: true });
  const state = {
    schema_version: 1,
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
  for (const issue of input.issues ?? []) {
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
      checkpoints,
      occurrences: occurrences.length,
      status: shouldPropose ? "standard-improvement-proposed" : "observed"
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
  return {
    schema_version: 1,
    label: "问题项",
    issues,
    proposals,
    accumulation_policy: "deduplicate-and-merge",
    history_database_created: false
  };
}
