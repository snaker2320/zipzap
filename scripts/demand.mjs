#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const TASK_SCRIPT = path.join(SCRIPT_DIR, "task.mjs");
const DEMAND_POLICY = JSON.parse(
  fs.readFileSync(path.join(DEFAULT_ROOT, "config", "demand-policy.json"), "utf8")
);
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DEMAND_TYPES = new Set(Object.keys(DEMAND_POLICY.demand_standard.types));
const DEMAND_STATUSES = new Set(DEMAND_POLICY.demand_standard.statuses);
const PRIORITIES = new Set(DEMAND_POLICY.demand_standard.priorities);
const PLAN_STATUSES = new Set(DEMAND_POLICY.phase_plan.statuses);
const DEMAND_TRANSITIONS = Object.fromEntries(
  Object.entries(DEMAND_POLICY.demand_standard.transitions).map(
    ([status, targets]) => [status, new Set(targets)]
  )
);
const TYPE_TO_WORK = DEMAND_POLICY.demand_standard.types;
const PROJECT_GITIGNORE = `# Derived or machine-local ZipZap state
/reports/
/cache/
/state/
/locks/
/index.json
*.tmp
`;

const COMMANDS = {
  validate: {
    summary: "Validate one lightweight Demand Standard v1 record.",
    usage: "validate [--project <dir>] --input <file> [--compact]",
    schema: "schemas/demand.schema.json",
    example: "examples/demand/create.json"
  },
  create: {
    summary: "Create one Git-shareable requirement, defect, or technical-debt Demand.",
    usage: "create [--project <dir>] --input <file> [--compact]",
    schema: "schemas/demand.schema.json",
    example: "examples/demand/create.json"
  },
  show: {
    summary: "Show one Demand by identifier.",
    usage: "show [--project <dir>] --id <demand-id> [--compact]"
  },
  list: {
    summary: "List Demands with optional type or status filters.",
    usage: "list [--project <dir>] [--type <type>] [--status <status>] [--compact]"
  },
  update: {
    summary: "Patch a Demand with optimistic revision control.",
    usage: "update [--project <dir>] --input <file> [--compact]",
    schema: "schemas/demand-update.schema.json"
  },
  promote: {
    summary: "Promote a triaged or planned Demand into a Ready Task with source traceability.",
    usage: "promote [--project <dir>] --input <file> [--compact]",
    schema: "schemas/demand-promotion.schema.json",
    example: "examples/demand/promote.json"
  },
  capture: {
    summary: "Preview or confirm a prefilled discussion finding without automatic persistence.",
    usage: "capture [--project <dir>] --input <file> [--compact]",
    schema: "schemas/capture-suggestion-input.schema.json",
    example: "examples/demand/capture.json"
  },
  "plan-create": {
    summary: "Create a lightweight phase plan that references Demands or Tasks.",
    usage: "plan-create [--project <dir>] --input <file> [--compact]",
    schema: "schemas/phase-plan.schema.json",
    example: "examples/demand/plan.json"
  },
  "plan-show": {
    summary: "Show one phase plan by identifier.",
    usage: "plan-show [--project <dir>] --id <plan-id> [--compact]"
  },
  "plan-list": {
    summary: "List lightweight phase plans.",
    usage: "plan-list [--project <dir>] [--status <status>] [--compact]"
  },
  "plan-update": {
    summary: "Replace an editable phase plan with optimistic revision control.",
    usage: "plan-update [--project <dir>] --input <file> [--compact]",
    schema: "schemas/phase-plan-update.schema.json"
  },
  "plan-assess": {
    summary: "Derive blocked, at-risk, and overdue warnings for one phase plan.",
    usage: "plan-assess [--project <dir>] --id <plan-id> [--as-of <date>] [--warning-days <n>] [--compact]",
    schema: "schemas/phase-plan-assessment.schema.json"
  }
};

class CliUsageError extends Error {
  constructor(code, message, hint, details = null) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function now() {
  return new Date().toISOString();
}

function nonEmpty(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validDate(value) {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertAllowed(value, fields, label) {
  assertObject(value, label);
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw new Error(`unknown ${label} field: ${field}`);
  }
}

function layout(projectRoot) {
  const zipzap = path.join(projectRoot, ".zipzap");
  return {
    zipzap,
    demands: path.join(zipzap, "demands"),
    plans: path.join(zipzap, "plans"),
    tasks: path.join(zipzap, "tasks")
  };
}

function ensureLayout(projectRoot) {
  const directories = layout(projectRoot);
  for (const directory of [directories.zipzap, directories.demands, directories.plans]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const gitignore = path.join(directories.zipzap, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, PROJECT_GITIGNORE);
  return directories;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function recordFile(projectRoot, kind, id) {
  if (!ID_PATTERN.test(id ?? "")) throw new Error(`invalid ${kind} id: ${id}`);
  const directory = kind === "Demand" ? layout(projectRoot).demands : layout(projectRoot).plans;
  return path.join(directory, `${id}.json`);
}

function demandIssues(demand) {
  const issues = [];
  try {
    assertAllowed(
      demand,
      new Set([
        "schema_version", "demand_id", "revision", "type", "status", "summary",
        "expected_outcome", "priority", "owner_id", "timing", "source_refs",
        "notes", "promotion", "created_at", "updated_at"
      ]),
      "Demand"
    );
  } catch (error) {
    return [error.message];
  }
  if (demand.schema_version !== 1) issues.push("schema_version must be 1");
  if (!ID_PATTERN.test(demand.demand_id ?? "")) issues.push("demand_id must be kebab-case");
  if (!Number.isInteger(demand.revision) || demand.revision < 1) issues.push("revision must be positive");
  if (!DEMAND_TYPES.has(demand.type)) issues.push("type must be requirement, defect, or technical-debt");
  if (!DEMAND_STATUSES.has(demand.status)) issues.push("status is invalid");
  if (!nonEmpty(demand.summary)) issues.push("summary is required");
  if (demand.expected_outcome != null && !nonEmpty(demand.expected_outcome)) issues.push("expected_outcome must be non-empty");
  if (!PRIORITIES.has(demand.priority)) issues.push("priority is invalid");
  if (demand.owner_id != null && !nonEmpty(demand.owner_id)) issues.push("owner_id must be non-empty or null");
  if (!demand.timing || typeof demand.timing !== "object" || Array.isArray(demand.timing)) {
    issues.push("timing must be an object");
  } else {
    const allowed = new Set(["not_before", "target_start", "target_finish", "deadline"]);
    for (const [field, value] of Object.entries(demand.timing)) {
      if (!allowed.has(field)) issues.push(`unknown timing field: ${field}`);
      else if (value != null && !validDate(value)) issues.push(`timing.${field} must be a date-time or null`);
    }
    const ordered = ["not_before", "target_start", "target_finish", "deadline"]
      .map((field) => [field, demand.timing[field]])
      .filter(([, value]) => value != null);
    for (let index = 1; index < ordered.length; index += 1) {
      if (Date.parse(ordered[index - 1][1]) > Date.parse(ordered[index][1])) {
        issues.push(`timing.${ordered[index - 1][0]} must not be after timing.${ordered[index][0]}`);
      }
    }
  }
  if (!Array.isArray(demand.source_refs)) issues.push("source_refs must be an array");
  else {
    const ids = new Set();
    for (const source of demand.source_refs) {
      if (!source || typeof source !== "object" || Array.isArray(source)) {
        issues.push("source_refs entries must be objects");
        continue;
      }
      const keys = Object.keys(source);
      if (keys.some((key) => !["id", "kind", "locator"].includes(key)) ||
          !ID_PATTERN.test(source.id ?? "") || ids.has(source.id) ||
          !["requirement", "issue", "review", "decision", "other"].includes(source.kind) ||
          !nonEmpty(source.locator)) {
        issues.push(`invalid or duplicate source_ref: ${source.id ?? "unknown"}`);
      }
      ids.add(source.id);
    }
  }
  if (demand.notes != null && (!Array.isArray(demand.notes) || demand.notes.some((note) => !nonEmpty(note)))) issues.push("notes must contain non-empty strings");
  if (demand.created_at != null && !validDate(demand.created_at)) issues.push("created_at is invalid");
  if (demand.updated_at != null && !validDate(demand.updated_at)) issues.push("updated_at is invalid");
  if (demand.status === "promoted") {
    const promotion = demand.promotion;
    if (!promotion || !ID_PATTERN.test(promotion.task_id ?? "") ||
        !nonEmpty(promotion.task_locator) || !validDate(promotion.promoted_at) ||
        Object.keys(promotion).some((key) => !["task_id", "task_locator", "promoted_at"].includes(key))) {
      issues.push("promoted Demand requires a valid promotion record");
    }
  } else if (demand.promotion != null) {
    issues.push("only a promoted Demand may contain promotion");
  }
  return [...new Set(issues)];
}

function validateDemand(demand) {
  const issues = demandIssues(demand);
  if (issues.length > 0) {
    throw new CliUsageError(
      "invalid-demand",
      "Demand does not satisfy Demand Standard v1.",
      "Run the validate command and correct the reported fields.",
      { errors: issues }
    );
  }
  return demand;
}

function normalizeDemand(input, creating = false) {
  const timestamp = creating ? input.created_at ?? now() : now();
  return {
    ...clone(input),
    schema_version: 1,
    revision: input.revision ?? 1,
    status: input.status ?? "captured",
    timing: clone(input.timing ?? {}),
    source_refs: clone(input.source_refs ?? []),
    notes: clone(input.notes ?? []),
    ...(creating ? { created_at: timestamp } : {}),
    updated_at: timestamp
  };
}

function loadDemand(projectRoot, demandId) {
  const file = recordFile(projectRoot, "Demand", demandId);
  if (!fs.existsSync(file)) throw new Error(`Demand does not exist: ${demandId}`);
  return validateDemand(readJson(file));
}

function saveDemand(projectRoot, demand) {
  validateDemand(demand);
  writeJsonAtomic(path.join(ensureLayout(projectRoot).demands, `${demand.demand_id}.json`), demand);
}

function createDemand(projectRoot, input) {
  const demand = validateDemand(normalizeDemand(input, true));
  const file = recordFile(projectRoot, "Demand", demand.demand_id);
  if (fs.existsSync(file)) throw new Error(`Demand already exists: ${demand.demand_id}`);
  saveDemand(projectRoot, demand);
  return { demand, locator: `.zipzap/demands/${demand.demand_id}.json` };
}

function listDemands(projectRoot) {
  const directory = layout(projectRoot).demands;
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort()
    .map((name) => loadDemand(projectRoot, name.slice(0, -5)));
}

function updateDemand(projectRoot, input) {
  assertAllowed(input, new Set(["schema_version", "demand_id", "expected_revision", "patch"]), "Demand update");
  if (input.schema_version !== 1 || !ID_PATTERN.test(input.demand_id ?? "") ||
      !Number.isInteger(input.expected_revision) || input.expected_revision < 1) {
    throw new Error("Demand update identity or revision is invalid");
  }
  const current = loadDemand(projectRoot, input.demand_id);
  if (current.revision !== input.expected_revision) {
    throw new Error(`Demand revision mismatch: expected ${input.expected_revision}, stored ${current.revision}`);
  }
  assertAllowed(input.patch, new Set([
    "status", "summary", "expected_outcome", "priority", "owner_id", "timing", "source_refs", "notes"
  ]), "Demand patch");
  const nextStatus = input.patch.status ?? current.status;
  if (!DEMAND_TRANSITIONS[current.status].has(nextStatus) || nextStatus === "promoted") {
    throw new Error(`Demand cannot transition from ${current.status} to ${nextStatus} through update`);
  }
  const next = normalizeDemand({
    ...current,
    ...clone(input.patch),
    revision: current.revision + 1,
    created_at: current.created_at
  });
  saveDemand(projectRoot, next);
  return { demand: next, previous_revision: current.revision };
}

function runTask(command, projectRoot, input = null, args = []) {
  const result = spawnSync(process.execPath, [TASK_SCRIPT, command, "--project", projectRoot, ...args, "--compact"], {
    cwd: projectRoot,
    encoding: "utf8",
    input: input == null ? undefined : JSON.stringify(input)
  });
  let payload = null;
  try {
    payload = JSON.parse(result.stdout || result.stderr);
  } catch {
    payload = { raw: result.stderr || result.stdout };
  }
  if (result.status !== 0) {
    throw new CliUsageError(
      "task-command-failed",
      payload?.error?.message ?? `Task command failed: ${command}.`,
      payload?.error?.hint ?? `Correct the Task state and retry ${command}.`,
      payload?.error?.details ?? payload
    );
  }
  return payload;
}

function promoteDemand(projectRoot, input) {
  assertAllowed(input, new Set(["schema_version", "demand_id", "expected_revision", "task"]), "Demand promotion");
  if (input.schema_version !== 1 || !ID_PATTERN.test(input.demand_id ?? "") ||
      !Number.isInteger(input.expected_revision) || input.expected_revision < 1) {
    throw new Error("Demand promotion identity or revision is invalid");
  }
  const demand = loadDemand(projectRoot, input.demand_id);
  if (demand.revision !== input.expected_revision) {
    throw new Error(`Demand revision mismatch: expected ${input.expected_revision}, stored ${demand.revision}`);
  }
  if (!new Set(DEMAND_POLICY.demand_standard.promotion_source_statuses).has(demand.status)) {
    throw new Error(`Demand must be triaged or planned before promotion: ${demand.status}`);
  }
  assertObject(input.task, "promotion Task");
  if (input.task.work?.kind !== TYPE_TO_WORK[demand.type]) {
    throw new Error(`Demand type ${demand.type} requires Task work kind ${TYPE_TO_WORK[demand.type]}`);
  }
  const taskId = input.task.task_id;
  if (!ID_PATTERN.test(taskId ?? "")) throw new Error("promotion Task task_id is invalid");
  const taskLocator = `.zipzap/tasks/${taskId}.json`;
  if (fs.existsSync(path.join(projectRoot, taskLocator))) throw new Error(`Task already exists: ${taskId}`);
  const demandLocator = `.zipzap/demands/${demand.demand_id}.json`;
  const sourceId = "origin-demand";
  if ((input.task.source_refs ?? []).some((source) => source.id === sourceId)) {
    throw new Error(`promotion Task source_refs already uses reserved id: ${sourceId}`);
  }
  const task = {
    ...clone(input.task),
    origin: { kind: "demand", ref: demand.demand_id, locator: demandLocator },
    planning: {
      ...clone(input.task.planning),
      priority: demand.priority,
      ...(input.task.planning?.target_start == null && demand.timing.target_start != null
        ? { target_start: demand.timing.target_start } : {}),
      ...(input.task.planning?.target_finish == null && demand.timing.target_finish != null
        ? { target_finish: demand.timing.target_finish } : {}),
      ...(input.task.planning?.deadline == null && demand.timing.deadline != null
        ? { deadline: demand.timing.deadline } : {})
    },
    accountability: {
      ...clone(input.task.accountability),
      ...(input.task.accountability?.subject_id == null && demand.owner_id != null
        ? { subject_id: demand.owner_id } : {})
    },
    source_refs: [
      ...(clone(input.task.source_refs ?? [])),
      {
        id: sourceId,
        kind: demand.type === "requirement" ? "requirement" : "issue",
        locator: demandLocator
      }
    ]
  };
  const readiness = runTask("validate", projectRoot, task);
  if (!readiness.status_compatible) {
    throw new CliUsageError(
      "task-not-ready",
      "Demand promotion requires a Ready or explicitly blocked Task.",
      "Resolve the Task Standard validation result before retrying promotion.",
      readiness
    );
  }
  const promotedAt = now();
  const promotedDemand = validateDemand({
    ...demand,
    revision: demand.revision + 1,
    status: "promoted",
    promotion: { task_id: taskId, task_locator: taskLocator, promoted_at: promotedAt },
    updated_at: promotedAt
  });
  const created = runTask("create", projectRoot, task);
  saveDemand(projectRoot, promotedDemand);
  return {
    demand: promotedDemand,
    task: created.task,
    trace: {
      demand_locator: demandLocator,
      task_locator: taskLocator,
      task_origin: created.task.origin
    }
  };
}

function validateSuggestion(suggestion) {
  assertAllowed(
    suggestion,
    new Set([
      "suggestion_id",
      "type",
      "summary",
      "expected_outcome",
      "severity",
      "current_work_impact",
      "current_task_id",
      "active_plan_id",
      "task_candidate",
      "evidence"
    ]),
    "capture suggestion"
  );
  if (
    !ID_PATTERN.test(suggestion.suggestion_id ?? "") ||
    !DEMAND_TYPES.has(suggestion.type) ||
    !nonEmpty(suggestion.summary) ||
    (suggestion.expected_outcome != null &&
      !nonEmpty(suggestion.expected_outcome)) ||
    !["blocker", "high", "medium", "low", "advisory"].includes(
      suggestion.severity
    ) ||
    !["blocking", "related", "unrelated"].includes(
      suggestion.current_work_impact
    ) ||
    (suggestion.current_task_id != null &&
      !ID_PATTERN.test(suggestion.current_task_id)) ||
    (suggestion.active_plan_id != null &&
      !ID_PATTERN.test(suggestion.active_plan_id)) ||
    !Array.isArray(suggestion.evidence) ||
    suggestion.evidence.length === 0
  ) {
    throw new Error("capture suggestion identity, classification, or evidence is invalid");
  }
  const evidenceIds = new Set();
  for (const evidence of suggestion.evidence) {
    assertAllowed(
      evidence,
      new Set(["id", "kind", "locator", "statement"]),
      "capture suggestion evidence"
    );
    if (
      !ID_PATTERN.test(evidence.id ?? "") ||
      evidenceIds.has(evidence.id) ||
      ![
        "analysis",
        "artifact",
        "implementation",
        "test",
        "review",
        "decision",
        "other"
      ].includes(evidence.kind) ||
      !nonEmpty(evidence.locator) ||
      !nonEmpty(evidence.statement)
    ) {
      throw new Error(
        `capture suggestion evidence is invalid or duplicate: ${evidence.id}`
      );
    }
    evidenceIds.add(evidence.id);
  }
  return clone(suggestion);
}

function capturePriority(severity) {
  return {
    blocker: "critical",
    high: "high",
    medium: "medium",
    low: "low",
    advisory: "low"
  }[severity];
}

function findingPriority(severity) {
  return {
    blocker: "p0",
    high: "p1",
    medium: "p2",
    low: "p3",
    advisory: "p3"
  }[severity];
}

function capturePromptTiming(suggestion) {
  const policy = DEMAND_POLICY.capture_suggestion;
  if (
    suggestion.current_work_impact === "blocking" ||
    policy.immediate_severities.includes(suggestion.severity)
  ) {
    return "immediate";
  }
  if (
    suggestion.current_work_impact === "related" ||
    policy.stage_end_severities.includes(suggestion.severity)
  ) {
    return "stage-end";
  }
  return "completion-summary";
}

function recommendedCaptureAction(suggestion) {
  return suggestion.current_task_id &&
    suggestion.current_work_impact !== "unrelated"
    ? DEMAND_POLICY.capture_suggestion.current_task_action
    : DEMAND_POLICY.capture_suggestion.default_action;
}

function captureLabels(locale) {
  return locale === "en"
    ? {
        title: "Record this finding?",
        action: "Action",
        priority: "Priority",
        owner: "Owner (optional)",
        target: "Target finish (optional)",
        deadline: "Latest deadline (optional)",
        addPlan: "Add to the active phase plan",
        prompt: "A material finding was discovered. How should ZipZap handle it?",
        demand: "Record Demand",
        attach: "Attach to current Task",
        task: "Create Task",
        dismiss: "Do not record"
      }
    : {
        title: "是否记录这个发现？",
        action: "处理方式",
        priority: "优先级",
        owner: "负责人（可选）",
        target: "目标完成时间（可选）",
        deadline: "最晚期限（可选）",
        addPlan: "加入当前阶段计划",
        prompt: "讨论中发现了一个重要问题，ZipZap 应如何处理？",
        demand: "记录为 Demand",
        attach: "附加到当前 Task",
        task: "创建新 Task",
        dismiss: "暂不记录"
      };
}

function captureOptions(suggestion, recommendedAction, locale) {
  const labels = captureLabels(locale);
  const options = [
    {
      value: "create-demand",
      label: labels.demand,
      description:
        locale === "en"
          ? "Keep it lightweight until it is triaged and ready."
          : "先轻量记录，完成分析和准备后再提升为 Task。"
    },
    ...(suggestion.current_task_id
      ? [
          {
            value: "attach-current-task",
            label: labels.attach,
            description:
              locale === "en"
                ? "Add an open Finding and its evidence to the current Task."
                : "将开放 Finding 和证据加入当前 Task。"
          }
        ]
      : []),
    {
      value: "create-task",
      label: labels.task,
      description:
        locale === "en"
          ? "Create only when a complete Task Standard input is available."
          : "仅在具备完整 Task Standard 输入时直接创建。"
    },
    {
      value: "dismiss",
      label: labels.dismiss,
      description:
        locale === "en"
          ? "Continue without writing project state."
          : "继续讨论，不写入项目状态。"
    }
  ];
  return options.map((option) => ({
    ...option,
    recommended: option.value === recommendedAction
  }));
}

function captureSourceRevisions(projectRoot, suggestion) {
  const revisions = {};
  if (suggestion.current_task_id) {
    const filePath = path.join(
      layout(projectRoot).tasks,
      `${suggestion.current_task_id}.json`
    );
    if (fs.existsSync(filePath)) {
      const task = readJson(filePath);
      if (Number.isInteger(task.revision) && task.revision > 0) {
        revisions.current_task_revision = task.revision;
      }
    }
  }
  if (suggestion.active_plan_id) {
    const filePath = recordFile(
      projectRoot,
      "Phase plan",
      suggestion.active_plan_id
    );
    if (fs.existsSync(filePath)) {
      const plan = readJson(filePath);
      if (Number.isInteger(plan.revision) && plan.revision > 0) {
        revisions.active_plan_revision = plan.revision;
      }
    }
  }
  return revisions;
}

function startCaptureSuggestion(projectRoot, input) {
  assertAllowed(
    input,
    new Set(["schema_version", "operation", "locale", "presentation", "suggestion"]),
    "capture suggestion input"
  );
  if (input.schema_version !== 1 || input.operation !== "start") {
    throw new Error("capture suggestion start input is invalid");
  }
  const locale = input.locale ?? "zh-CN";
  const presentation = input.presentation ?? "form";
  if (!["en", "zh-CN"].includes(locale) || !["form", "stepwise"].includes(presentation)) {
    throw new Error("capture suggestion locale or presentation is invalid");
  }
  const suggestion = validateSuggestion(input.suggestion);
  const recommendedAction = recommendedCaptureAction(suggestion);
  const promptTiming = capturePromptTiming(suggestion);
  const labels = captureLabels(locale);
  const options = captureOptions(suggestion, recommendedAction, locale);
  const state = {
    revision: 1,
    locale,
    presentation,
    suggestion,
    recommended_action: recommendedAction,
    prompt_timing: promptTiming,
    ...captureSourceRevisions(projectRoot, suggestion)
  };
  const common = {
    schema_version: 1,
    status: "decision-required",
    write_performed: false,
    state,
    preview: {
      summary: suggestion.summary,
      type: suggestion.type,
      severity: suggestion.severity,
      evidence_count: suggestion.evidence.length,
      recommended_action: recommendedAction,
      prompt_timing: promptTiming,
      persistence: "none-until-confirmed"
    },
    required_actions: ["Choose one capture action."],
    limitations: [
      "The suggestion is AI-prepared and not persisted until user confirmation."
    ]
  };
  if (presentation === "stepwise") {
    return {
      ...common,
      question: {
        id: "capture-action",
        prompt: `${labels.prompt} ${suggestion.summary}`,
        options
      }
    };
  }
  return {
    ...common,
    form: {
      id: "capture-suggestion",
      title: labels.title,
      summary: suggestion.summary,
      fields: [
        {
          id: "action",
          type: "single-select",
          label: labels.action,
          required: true,
          default: recommendedAction,
          options
        },
        {
          id: "priority",
          type: "single-select",
          label: labels.priority,
          required: true,
          default: capturePriority(suggestion.severity),
          options: [...PRIORITIES].map((priority) => ({
            value: priority,
            label: priority,
            description: priority,
            recommended: priority === capturePriority(suggestion.severity)
          }))
        },
        {
          id: "owner_id",
          type: "text",
          label: labels.owner,
          required: false
        },
        {
          id: "target_finish",
          type: "date-time",
          label: labels.target,
          required: false
        },
        {
          id: "deadline",
          type: "date-time",
          label: labels.deadline,
          required: false
        },
        ...(suggestion.active_plan_id
          ? [
              {
                id: "add_to_plan",
                type: "boolean",
                label: labels.addPlan,
                required: false,
                default: false
              }
            ]
          : [])
      ]
    }
  };
}

function validateCaptureState(state) {
  assertAllowed(
    state,
    new Set([
      "revision",
      "locale",
      "presentation",
      "suggestion",
      "recommended_action",
      "prompt_timing",
      "current_task_revision",
      "active_plan_revision"
    ]),
    "capture suggestion state"
  );
  if (
    !Number.isInteger(state.revision) ||
    state.revision < 1 ||
    !["en", "zh-CN"].includes(state.locale) ||
    !["form", "stepwise"].includes(state.presentation) ||
    (state.current_task_revision != null &&
      (!Number.isInteger(state.current_task_revision) ||
        state.current_task_revision < 1)) ||
    (state.active_plan_revision != null &&
      (!Number.isInteger(state.active_plan_revision) ||
        state.active_plan_revision < 1))
  ) {
    throw new Error("capture suggestion state is invalid");
  }
  validateSuggestion(state.suggestion);
  const recommended = recommendedCaptureAction(state.suggestion);
  const timing = capturePromptTiming(state.suggestion);
  if (
    state.recommended_action !== recommended ||
    state.prompt_timing !== timing
  ) {
    throw new Error("capture suggestion state derivation is stale or invalid");
  }
  return clone(state);
}

function demandSourceKind(suggestion, evidence) {
  if (evidence.kind === "decision") return "decision";
  if (evidence.kind === "review") return "review";
  if (suggestion.type === "requirement") return "requirement";
  return "issue";
}

function taskEvidenceKind(kind) {
  if (["artifact", "implementation"].includes(kind)) return "artifact";
  if (kind === "test") return "verification";
  if (kind === "review") return "review";
  return "host-observation";
}

function taskSourceKind(suggestion, evidence) {
  if (evidence.kind === "decision") return "decision";
  if (suggestion.type === "requirement") return "requirement";
  return "issue";
}

function preparePlanAddition(projectRoot, suggestion, decision, item) {
  if (decision.add_to_plan !== true) return null;
  if (!suggestion.active_plan_id) {
    throw new Error("capture suggestion has no active plan to update");
  }
  if (!Number.isInteger(decision.plan_expected_revision)) {
    throw new Error("adding a captured record to a plan requires plan_expected_revision");
  }
  const plan = loadPlan(projectRoot, suggestion.active_plan_id);
  if (plan.revision !== decision.plan_expected_revision) {
    throw new Error(
      `Phase plan revision mismatch: expected ${decision.plan_expected_revision}, stored ${plan.revision}`
    );
  }
  if (plan.items.some((existing) => existing.kind === item.kind && existing.ref === item.ref)) {
    throw new Error(`Phase plan already references ${item.kind}:${item.ref}`);
  }
  return validatePlan(
    normalizePlan({
      ...plan,
      revision: plan.revision + 1,
      created_at: plan.created_at,
      items: [...plan.items, item]
    })
  );
}

function applyPlanAddition(projectRoot, plan) {
  if (!plan) return null;
  savePlan(projectRoot, plan);
  return {
    plan_id: plan.plan_id,
    plan_revision: plan.revision,
    locator: `.zipzap/plans/${plan.plan_id}.json`
  };
}

function attachSuggestionToTask(projectRoot, suggestion, decision) {
  if (!suggestion.current_task_id) {
    throw new Error("capture suggestion does not identify a current Task");
  }
  const task = runTask(
    "show",
    projectRoot,
    null,
    ["--id", suggestion.current_task_id]
  );
  const expectedRevision =
    decision.current_task_expected_revision ?? task.revision;
  if (expectedRevision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${expectedRevision}, stored ${task.revision}`
    );
  }
  if ((task.findings ?? []).some((finding) => finding.id === suggestion.suggestion_id)) {
    throw new Error(`Task Finding already exists: ${suggestion.suggestion_id}`);
  }
  const evidence = suggestion.evidence.map((item) => ({
    id: `capture-${item.id}`,
    kind: taskEvidenceKind(item.kind),
    locator: item.locator,
    statement: item.statement
  }));
  const usedEvidence = new Set((task.evidence ?? []).map((item) => item.id));
  for (const item of evidence) {
    if (usedEvidence.has(item.id)) {
      throw new Error(`Task evidence already exists: ${item.id}`);
    }
  }
  const nextTask = {
    ...task,
    evidence: [...(task.evidence ?? []), ...evidence],
    findings: [
      ...(task.findings ?? []),
      {
        id: suggestion.suggestion_id,
        statement: suggestion.summary,
        status: "open",
        severity: suggestion.severity,
        priority: findingPriority(suggestion.severity),
        blocking:
          suggestion.severity === "blocker" ||
          suggestion.current_work_impact === "blocking",
        evidence_refs: evidence.map((item) => item.id)
      }
    ]
  };
  return runTask("update", projectRoot, {
    expected_revision: expectedRevision,
    task: nextTask
  });
}

function createTaskFromSuggestion(projectRoot, suggestion, decision) {
  const candidate = clone(decision.task ?? suggestion.task_candidate);
  if (!candidate) return null;
  if (candidate.work?.kind !== TYPE_TO_WORK[suggestion.type]) {
    throw new Error(
      `Suggestion type ${suggestion.type} requires Task work kind ${TYPE_TO_WORK[suggestion.type]}`
    );
  }
  const existingSourceIds = new Set(
    (candidate.source_refs ?? []).map((source) => source.id)
  );
  const capturedSources = suggestion.evidence.map((evidence) => {
    const id = `capture-${evidence.id}`;
    if (existingSourceIds.has(id)) {
      throw new Error(`Task source_refs already uses reserved id: ${id}`);
    }
    return {
      id,
      kind: taskSourceKind(suggestion, evidence),
      locator: evidence.locator,
      statement: evidence.statement
    };
  });
  const task = {
    ...candidate,
    planning: {
      ...candidate.planning,
      priority: decision.priority ?? capturePriority(suggestion.severity),
      ...(candidate.planning?.target_finish == null &&
      decision.timing?.target_finish != null
        ? { target_finish: decision.timing.target_finish }
        : {}),
      ...(candidate.planning?.deadline == null && decision.timing?.deadline != null
        ? { deadline: decision.timing.deadline }
        : {})
    },
    accountability: {
      ...candidate.accountability,
      ...(candidate.accountability?.subject_id == null && decision.owner_id != null
        ? { subject_id: decision.owner_id }
        : {})
    },
    source_refs: [...(candidate.source_refs ?? []), ...capturedSources]
  };
  const readiness = runTask("validate", projectRoot, task);
  if (!readiness.status_compatible) {
    throw new CliUsageError(
      "task-not-ready",
      "The suggested Task does not satisfy Task Standard v1.",
      "Complete the Task scope, acceptance, estimate, accountability, and schedule before confirming.",
      readiness
    );
  }
  return runTask("create", projectRoot, task);
}

function confirmCaptureSuggestion(projectRoot, input) {
  assertAllowed(
    input,
    new Set([
      "schema_version",
      "operation",
      "state",
      "expected_revision",
      "decision"
    ]),
    "capture suggestion input"
  );
  if (input.schema_version !== 1 || input.operation !== "confirm") {
    throw new Error("capture suggestion confirm input is invalid");
  }
  const state = validateCaptureState(input.state);
  if (input.expected_revision !== state.revision) {
    throw new Error(
      `Capture suggestion revision mismatch: expected ${input.expected_revision}, state ${state.revision}`
    );
  }
  assertAllowed(
    input.decision,
    new Set([
      "action",
      "demand_id",
      "priority",
      "owner_id",
      "timing",
      "current_task_expected_revision",
      "task",
      "add_to_plan",
      "plan_expected_revision"
    ]),
    "capture suggestion decision"
  );
  const decision = clone(input.decision);
  if (
    decision.current_task_expected_revision == null &&
    state.current_task_revision != null
  ) {
    decision.current_task_expected_revision = state.current_task_revision;
  }
  if (
    decision.plan_expected_revision == null &&
    state.active_plan_revision != null
  ) {
    decision.plan_expected_revision = state.active_plan_revision;
  }
  if (!DEMAND_POLICY.capture_suggestion.actions.includes(decision.action)) {
    throw new Error(`capture suggestion action is invalid: ${decision.action}`);
  }
  const suggestion = state.suggestion;
  if (decision.action === "dismiss") {
    return {
      schema_version: 1,
      status: "completed",
      write_performed: false,
      result: {
        action: "dismiss",
        summary: suggestion.summary,
        persisted: false
      },
      required_actions: [],
      limitations: ["The finding remains only in the current conversation context."]
    };
  }

  if (decision.action === "create-demand") {
    const demandId = decision.demand_id ?? suggestion.suggestion_id;
    const plan = preparePlanAddition(projectRoot, suggestion, decision, {
      kind: "demand",
      ref: demandId,
      committed: false,
      ...(decision.timing?.target_finish
        ? { target_finish: decision.timing.target_finish }
        : {})
    });
    const created = createDemand(projectRoot, {
      schema_version: 1,
      demand_id: demandId,
      revision: 1,
      type: suggestion.type,
      status: "captured",
      summary: suggestion.summary,
      ...(suggestion.expected_outcome
        ? { expected_outcome: suggestion.expected_outcome }
        : {}),
      priority: decision.priority ?? capturePriority(suggestion.severity),
      ...(decision.owner_id !== undefined ? { owner_id: decision.owner_id } : {}),
      timing: clone(decision.timing ?? {}),
      source_refs: suggestion.evidence.map((evidence) => ({
        id: evidence.id,
        kind: demandSourceKind(suggestion, evidence),
        locator: evidence.locator
      })),
      notes: []
    });
    const planResult = applyPlanAddition(projectRoot, plan);
    return {
      schema_version: 1,
      status: "completed",
      write_performed: true,
      result: {
        action: "create-demand",
        demand_id: created.demand.demand_id,
        locator: created.locator,
        ...(planResult ? { phase_plan: planResult } : {})
      },
      required_actions: [],
      limitations: []
    };
  }

  if (decision.action === "attach-current-task") {
    if (!suggestion.current_task_id) {
      return {
        schema_version: 1,
        status: "blocked",
        write_performed: false,
        result: { action: "attach-current-task" },
        required_actions: ["Provide current_task_id or choose another action."],
        limitations: []
      };
    }
    const plan = preparePlanAddition(projectRoot, suggestion, decision, {
      kind: "task",
      ref: suggestion.current_task_id,
      committed: true,
      ...(decision.timing?.target_finish
        ? { target_finish: decision.timing.target_finish }
        : {})
    });
    const updated = attachSuggestionToTask(projectRoot, suggestion, decision);
    const planResult = applyPlanAddition(projectRoot, plan);
    return {
      schema_version: 1,
      status: "completed",
      write_performed: true,
      result: {
        action: "attach-current-task",
        task_id: updated.task.task_id,
        task_revision: updated.task.revision,
        finding_id: suggestion.suggestion_id,
        locator: `.zipzap/tasks/${updated.task.task_id}.json`,
        ...(planResult ? { phase_plan: planResult } : {})
      },
      required_actions: [],
      limitations: []
    };
  }

  const taskCandidate = decision.task ?? suggestion.task_candidate;
  if (!taskCandidate) {
    return {
      schema_version: 1,
      status: "blocked",
      write_performed: false,
      result: { action: "create-task" },
      required_actions: [
        "Provide a complete Task Standard v1 candidate, or record the finding as a Demand."
      ],
      limitations: ["A short capture form cannot invent Task scope or acceptance criteria."]
    };
  }
  const plan = preparePlanAddition(projectRoot, suggestion, decision, {
    kind: "task",
    ref: taskCandidate.task_id,
    committed: true,
    ...(decision.timing?.target_finish
      ? { target_finish: decision.timing.target_finish }
      : {})
  });
  const created = createTaskFromSuggestion(projectRoot, suggestion, decision);
  const planResult = applyPlanAddition(projectRoot, plan);
  return {
    schema_version: 1,
    status: "completed",
    write_performed: true,
    result: {
      action: "create-task",
      task_id: created.task.task_id,
      locator: `.zipzap/tasks/${created.task.task_id}.json`,
      ...(planResult ? { phase_plan: planResult } : {})
    },
    required_actions: [],
    limitations: []
  };
}

function captureSuggestion(projectRoot, input) {
  if (input?.operation === "start") return startCaptureSuggestion(projectRoot, input);
  if (input?.operation === "confirm") {
    return confirmCaptureSuggestion(projectRoot, input);
  }
  throw new Error("capture suggestion operation must be start or confirm");
}

function planIssues(plan) {
  const issues = [];
  try {
    assertAllowed(plan, new Set([
      "schema_version", "plan_id", "revision", "status", "title", "window", "items", "created_at", "updated_at"
    ]), "phase plan");
  } catch (error) {
    return [error.message];
  }
  if (plan.schema_version !== 1) issues.push("schema_version must be 1");
  if (!ID_PATTERN.test(plan.plan_id ?? "")) issues.push("plan_id must be kebab-case");
  if (!Number.isInteger(plan.revision) || plan.revision < 1) issues.push("revision must be positive");
  if (!PLAN_STATUSES.has(plan.status)) issues.push("plan status is invalid");
  if (!nonEmpty(plan.title)) issues.push("plan title is required");
  if (!plan.window || !validDate(plan.window.start) || !validDate(plan.window.end) ||
      Date.parse(plan.window.start) >= Date.parse(plan.window.end) ||
      Object.keys(plan.window ?? {}).some((key) => !["start", "end"].includes(key))) {
    issues.push("plan window must contain ordered start and end date-times");
  }
  if (!Array.isArray(plan.items) || plan.items.length === 0) issues.push("plan items must not be empty");
  else {
    const refs = new Set();
    for (const item of plan.items) {
      const key = `${item?.kind}:${item?.ref}`;
      if (!item || !["demand", "task"].includes(item.kind) || !ID_PATTERN.test(item.ref ?? "") ||
          refs.has(key) || (item.committed != null && typeof item.committed !== "boolean") ||
          (item.target_finish != null && !validDate(item.target_finish)) ||
          Object.keys(item ?? {}).some((field) => !["kind", "ref", "committed", "target_finish"].includes(field))) {
        issues.push(`invalid or duplicate plan item: ${key}`);
      }
      refs.add(key);
    }
  }
  if (plan.created_at != null && !validDate(plan.created_at)) issues.push("created_at is invalid");
  if (plan.updated_at != null && !validDate(plan.updated_at)) issues.push("updated_at is invalid");
  return [...new Set(issues)];
}

function validatePlan(plan) {
  const issues = planIssues(plan);
  if (issues.length > 0) {
    throw new CliUsageError("invalid-plan", "Phase plan is invalid.", "Correct the reported plan fields.", { errors: issues });
  }
  return plan;
}

function normalizePlan(input, creating = false) {
  const timestamp = creating ? input.created_at ?? now() : now();
  return {
    ...clone(input),
    schema_version: 1,
    revision: input.revision ?? 1,
    status: input.status ?? "draft",
    items: (input.items ?? []).map((item) => ({ committed: false, ...clone(item) })),
    ...(creating ? { created_at: timestamp } : {}),
    updated_at: timestamp
  };
}

function loadPlan(projectRoot, planId) {
  const file = recordFile(projectRoot, "Plan", planId);
  if (!fs.existsSync(file)) throw new Error(`Phase plan does not exist: ${planId}`);
  return validatePlan(readJson(file));
}

function savePlan(projectRoot, plan) {
  validatePlan(plan);
  writeJsonAtomic(path.join(ensureLayout(projectRoot).plans, `${plan.plan_id}.json`), plan);
}

function createPlan(projectRoot, input) {
  const plan = validatePlan(normalizePlan(input, true));
  const file = recordFile(projectRoot, "Plan", plan.plan_id);
  if (fs.existsSync(file)) throw new Error(`Phase plan already exists: ${plan.plan_id}`);
  savePlan(projectRoot, plan);
  return { plan, locator: `.zipzap/plans/${plan.plan_id}.json` };
}

function updatePlan(projectRoot, input) {
  assertAllowed(input, new Set(["schema_version", "expected_revision", "plan"]), "phase plan update");
  if (input.schema_version !== 1 || !Number.isInteger(input.expected_revision) || input.expected_revision < 1) {
    throw new Error("phase plan update revision is invalid");
  }
  const current = loadPlan(projectRoot, input.plan?.plan_id);
  if (current.revision !== input.expected_revision) {
    throw new Error(`Phase plan revision mismatch: expected ${input.expected_revision}, stored ${current.revision}`);
  }
  const next = validatePlan(normalizePlan({
    ...clone(input.plan),
    revision: current.revision + 1,
    created_at: current.created_at
  }));
  savePlan(projectRoot, next);
  return { plan: next, previous_revision: current.revision };
}

function readTask(projectRoot, taskId) {
  const file = path.join(layout(projectRoot).tasks, `${taskId}.json`);
  return fs.existsSync(file) ? readJson(file) : null;
}

function timingFor(kind, record) {
  return kind === "demand" ? record.timing ?? {} : record.planning ?? {};
}

function assessPlan(projectRoot, planId, asOfValue, warningDays) {
  const plan = loadPlan(projectRoot, planId);
  const asOf = asOfValue ? new Date(asOfValue) : new Date();
  if (Number.isNaN(asOf.getTime())) throw new Error("--as-of must be a valid date-time");
  const warningMs = warningDays * 86400000;
  const items = plan.items.map((item) => {
    let kind = item.kind;
    let ref = item.ref;
    let record = kind === "demand"
      ? (() => { try { return loadDemand(projectRoot, ref); } catch { return null; } })()
      : readTask(projectRoot, ref);
    const reasons = [];
    if (!record) {
      return { kind, ref, committed: item.committed, state: "invalid", reasons: ["referenced-record-missing"], due_at: null };
    }
    if (kind === "demand" && record.status === "promoted") {
      const task = readTask(projectRoot, record.promotion.task_id);
      if (!task) {
        return { kind, ref, committed: item.committed, state: "invalid", reasons: ["promoted-task-missing"], due_at: null };
      }
      kind = "task";
      ref = task.task_id;
      record = task;
      reasons.push(`promoted-from:${item.ref}`);
    }
    const timing = timingFor(kind, record);
    const targetFinish = item.target_finish ?? timing.target_finish ?? null;
    const deadline = timing.deadline ?? null;
    const due = deadline ?? targetFinish ?? (item.committed ? plan.window.end : null);
    let state = "on-track";
    if (kind === "task" && record.status === "completed") state = "completed";
    else if (kind === "task" && record.status === "blocked") {
      state = "blocked";
      reasons.push("task-blocked");
    } else if (kind === "task" && record.status === "cancelled") {
      state = "invalid";
      reasons.push("task-cancelled");
    } else if (kind === "demand" && ["deferred", "rejected"].includes(record.status)) {
      state = "invalid";
      reasons.push(`demand-${record.status}`);
    } else if (deadline && Date.parse(deadline) < asOf.getTime()) {
      state = "overdue";
      reasons.push("deadline-passed");
    } else if (targetFinish && Date.parse(targetFinish) < asOf.getTime()) {
      state = "at-risk";
      reasons.push("target-finish-passed");
    } else if (deadline && Date.parse(deadline) <= asOf.getTime() + warningMs) {
      state = "at-risk";
      reasons.push("deadline-near");
    } else if (item.target_finish && Date.parse(item.target_finish) > Date.parse(plan.window.end)) {
      state = "at-risk";
      reasons.push("target-outside-plan-window");
    } else if (kind === "demand" && record.status === "captured") {
      state = "at-risk";
      reasons.push("demand-not-triaged");
    }
    return {
      kind: item.kind,
      ref: item.ref,
      effective_kind: kind,
      effective_ref: ref,
      committed: item.committed,
      state,
      reasons,
      due_at: due,
      source_status: record.status
    };
  });
  const count = (state) => items.filter((item) => item.state === state).length;
  const summary = {
    total: items.length,
    completed: count("completed"),
    on_track: count("on-track"),
    at_risk: count("at-risk"),
    overdue: count("overdue"),
    blocked: count("blocked"),
    invalid: count("invalid")
  };
  const status = summary.invalid > 0 ? "invalid"
    : summary.blocked > 0 ? "blocked"
      : summary.overdue > 0 ? "overdue"
        : summary.at_risk > 0 ? "at-risk" : "on-track";
  const nextActions = items.filter((item) => !["completed", "on-track"].includes(item.state))
    .map((item) => `${item.kind}:${item.ref} — ${item.reasons.join(", ")}`);
  return {
    schema_version: 1,
    plan_id: plan.plan_id,
    plan_revision: plan.revision,
    as_of: asOf.toISOString(),
    status,
    summary,
    items,
    next_actions: nextActions
  };
}

function parseInputJson(text, source, command) {
  if (!nonEmpty(text)) throw new CliUsageError("input-required", `Command ${command} requires JSON input.`, `Use --input or run \`node scripts/demand.mjs ${command} --example\`.`);
  try { return JSON.parse(text); }
  catch (error) { throw new CliUsageError("invalid-json", `Invalid JSON from ${source}: ${error.message}`, `Start from \`node scripts/demand.mjs ${command} --example\`.`); }
}

function readInput(inputPath, command) {
  if (inputPath) {
    try { return parseInputJson(fs.readFileSync(path.resolve(inputPath), "utf8"), inputPath, command); }
    catch (error) {
      if (error.code === "ENOENT") throw new CliUsageError("input-file-not-found", `Input file does not exist: ${inputPath}`, "Correct the path or print an example.");
      throw error;
    }
  }
  if (!process.stdin.isTTY) return parseInputJson(fs.readFileSync(0, "utf8"), "stdin", command);
  throw new CliUsageError("input-required", `Command ${command} requires JSON input.`, `Use --input or run \`node scripts/demand.mjs ${command} --example\`.`);
}

function optionValue(args, flag) {
  if (args.length === 0 || args[0].startsWith("-")) throw new CliUsageError("missing-option-value", `${flag} requires a value.`, "Run command help for usage.");
  return args.shift();
}

function parseArgs(argv) {
  const args = [...argv];
  if (["-h", "--help"].includes(args[0])) return { command: null, help: true };
  if (args[0] === "help") { args.shift(); return { command: args.shift() ?? null, help: true }; }
  const command = args.shift() ?? null;
  const options = { command, project: ".", input: null, id: null, type: null, status: null, asOf: null, warningDays: DEMAND_POLICY.phase_plan.default_warning_days, compact: false, example: false, help: command == null };
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--project") options.project = optionValue(args, flag);
    else if (flag === "--input") options.input = optionValue(args, flag);
    else if (flag === "--id") options.id = optionValue(args, flag);
    else if (flag === "--type") options.type = optionValue(args, flag);
    else if (flag === "--status") options.status = optionValue(args, flag);
    else if (flag === "--as-of") options.asOf = optionValue(args, flag);
    else if (flag === "--warning-days") {
      options.warningDays = Number(optionValue(args, flag));
      if (!Number.isInteger(options.warningDays) || options.warningDays < 0) throw new CliUsageError("invalid-option-value", "--warning-days must be a non-negative integer.", "Use the number of days before a due date should become at-risk.");
    } else if (["-h", "--help"].includes(flag)) options.help = true;
    else if (flag === "--example") options.example = true;
    else if (flag === "--compact") options.compact = true;
    else throw new CliUsageError("unknown-argument", `Unknown argument for ${command}: ${flag}`, `Run \`node scripts/demand.mjs ${command} --help\`.`);
  }
  return options;
}

function commandHelp(command) {
  const metadata = COMMANDS[command];
  if (!metadata) throw new CliUsageError("unknown-command", `Unknown Demand command: ${command}`, "Run global help to list commands.");
  return [
    `Usage: node scripts/demand.mjs ${metadata.usage}`, "", metadata.summary,
    ...(metadata.schema ? ["", `Related schema: ${metadata.schema}`] : []),
    ...(metadata.example ? [`Example input: ${metadata.example}`, `Print example: node scripts/demand.mjs ${command} --example`] : []),
    "", "Use --compact for single-line JSON output."
  ].join("\n") + "\n";
}

function globalHelp() {
  const commands = Object.entries(COMMANDS).map(([name, metadata]) => `  ${name.padEnd(16)} ${metadata.summary}`).join("\n");
  return `ZipZap lightweight Demand and phase-plan CLI\n\nUsage:\n  node scripts/demand.mjs <command> [options]\n  node scripts/demand.mjs <command> --help\n  node scripts/demand.mjs <command> --example\n\nCommands:\n${commands}\n\nGlobal options:\n  -h, --help          Show help.\n  --project <dir>     Select the project root.\n  --compact           Emit single-line JSON.\n`;
}

function structuredError(error, command) {
  return {
    ok: false,
    error: {
      code: error.code ?? "invalid-input",
      message: error.message,
      hint: error.hint ?? (command ? `Run \`node scripts/demand.mjs ${command} --help\`.` : "Run `node scripts/demand.mjs --help`."),
      help: command ? `node scripts/demand.mjs ${command} --help` : "node scripts/demand.mjs --help",
      ...(error.details != null ? { details: error.details } : {})
    }
  };
}

function output(value, compact) {
  process.stdout.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { process.stdout.write(options.command ? commandHelp(options.command) : globalHelp()); return; }
  if (!COMMANDS[options.command]) throw new CliUsageError("unknown-command", `Unknown Demand command: ${options.command}`, "Run global help to list commands.");
  if (options.example) {
    const example = COMMANDS[options.command].example;
    if (!example) throw new CliUsageError("example-unavailable", `Command ${options.command} has no standalone example.`, "Run command help for its contract.");
    output(readJson(path.join(DEFAULT_ROOT, example)), options.compact);
    return;
  }
  const projectRoot = path.resolve(options.project);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) throw new CliUsageError("project-unavailable", `Project is not an available directory: ${options.project}`, "Pass an existing project root.");
  const needsId = new Set(["show", "plan-show", "plan-assess"]);
  if (needsId.has(options.command) && !options.id) throw new CliUsageError("missing-option", `Command ${options.command} requires --id.`, "Pass the Demand or plan identifier.");
  let result;
  if (options.command === "validate") {
    const errors = demandIssues(normalizeDemand(readInput(options.input, options.command), true));
    result = { standard_version: 1, valid: errors.length === 0, errors };
  } else if (options.command === "create") result = createDemand(projectRoot, readInput(options.input, options.command));
  else if (options.command === "show") result = loadDemand(projectRoot, options.id);
  else if (options.command === "list") result = listDemands(projectRoot)
    .filter((demand) => !options.type || demand.type === options.type)
    .filter((demand) => !options.status || demand.status === options.status)
    .map((demand) => ({ demand_id: demand.demand_id, type: demand.type, status: demand.status, priority: demand.priority, summary: demand.summary, deadline: demand.timing.deadline ?? null, updated_at: demand.updated_at ?? null }));
  else if (options.command === "update") result = updateDemand(projectRoot, readInput(options.input, options.command));
  else if (options.command === "promote") result = promoteDemand(projectRoot, readInput(options.input, options.command));
  else if (options.command === "capture") result = captureSuggestion(projectRoot, readInput(options.input, options.command));
  else if (options.command === "plan-create") result = createPlan(projectRoot, readInput(options.input, options.command));
  else if (options.command === "plan-show") result = loadPlan(projectRoot, options.id);
  else if (options.command === "plan-list") {
    const directory = layout(projectRoot).plans;
    result = !fs.existsSync(directory) ? [] : fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort()
      .map((name) => loadPlan(projectRoot, name.slice(0, -5)))
      .filter((plan) => !options.status || plan.status === options.status)
      .map((plan) => ({ plan_id: plan.plan_id, revision: plan.revision, status: plan.status, title: plan.title, window: plan.window, items: plan.items.length }));
  } else if (options.command === "plan-update") result = updatePlan(projectRoot, readInput(options.input, options.command));
  else if (options.command === "plan-assess") result = assessPlan(projectRoot, options.id, options.asOf, options.warningDays);
  output(result, options.compact);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const command = process.argv[2]?.startsWith("-") ? null : process.argv[2] === "help" ? process.argv[3] ?? null : process.argv[2] ?? null;
    process.stderr.write(`${JSON.stringify(structuredError(error, command), null, 2)}\n`);
    process.exitCode = 1;
  });
}
