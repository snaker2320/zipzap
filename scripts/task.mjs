#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TASK_STATUSES = new Set([
  "ready",
  "in-progress",
  "blocked",
  "review",
  "completed",
  "cancelled"
]);
const TASK_CREATION_STATUSES = new Set(["ready", "blocked"]);
const NON_WAIVABLE_READY_REQUIREMENTS = new Set([
  "work.objective",
  "work.acceptance_criteria",
  "accountability.role"
]);
const EXPEDITE_WAIVABLE_REQUIREMENTS = new Set([
  "work.affected_components",
  "planning.target_finish-or-deadline"
]);
const OPEN_FINDING_STATUSES = new Set(["open", "deferred"]);
const TASK_EVENT_TYPES = new Set([
  "created",
  "updated",
  "transitioned",
  "git-tracking-configured",
  "git-synced",
  "review-recorded",
  "review-updated",
  "completion-assessed",
  "usage-recorded"
]);
const PROJECT_GITIGNORE = `# Derived or machine-local ZipZap state
/reports/
/cache/
/state/
/locks/
/index.json
*.tmp
`;
const TRANSITIONS = {
  ready: new Set(["in-progress", "blocked", "cancelled"]),
  "in-progress": new Set(["blocked", "review", "completed", "cancelled"]),
  blocked: new Set(["ready", "in-progress", "cancelled"]),
  review: new Set(["in-progress", "blocked", "completed", "cancelled"]),
  completed: new Set(["in-progress"]),
  cancelled: new Set(["ready"])
};
const TASK_COMMANDS = {
  validate: {
    summary: "Evaluate a Task against Task Standard v1 and Definition of Ready.",
    usage: "validate [--project <dir>] --input <file> [--compact]",
    schema: "schemas/task.schema.json",
    example: "examples/task/create.json"
  },
  create: {
    summary: "Create a project Task and its first immutable event.",
    usage: "create [--project <dir>] --input <file> [--compact]",
    schema: "schemas/task.schema.json",
    example: "examples/task/create.json"
  },
  show: {
    summary: "Show one Task by identifier.",
    usage: "show [--project <dir>] --id <task-id> [--compact]"
  },
  list: {
    summary: "List Tasks with optional status or participant filters.",
    usage:
      "list [--project <dir>] [--status <status>] [--subject <id>] [--team <id>] [--compact]"
  },
  update: {
    summary: "Replace editable Task state with optimistic revision control.",
    usage: "update [--project <dir>] --input <file> [--compact]",
    schema: "schemas/task.schema.json"
  },
  "apply-patch": {
    summary: "Apply a derived L5 Task Adapter patch.",
    usage: "apply-patch [--project <dir>] --input <file> [--compact]",
    schema: "schemas/task-adapter-output.schema.json"
  },
  transition: {
    summary: "Move a Task through an allowed status transition.",
    usage: "transition [--project <dir>] --input <file> [--compact]",
    example: "examples/task/transition.json"
  },
  "track-git": {
    summary: "Configure Git evidence collection for a Task.",
    usage: "track-git [--project <dir>] --input <file> [--compact]",
    example: "examples/task/track-git.json"
  },
  "git-scan": {
    summary: "Inspect confirmed and candidate Git activity without writing.",
    usage: "git-scan [--project <dir>] --id <task-id> [--compact]"
  },
  "sync-git": {
    summary: "Persist the current Git snapshot with a revision check.",
    usage:
      "sync-git [--project <dir>] --id <task-id> --expected-revision <n> [--compact]"
  },
  "record-review": {
    summary: "Record Review evidence and import its Findings.",
    usage: "record-review [--project <dir>] --input <file> [--compact]",
    schema: "schemas/review-result.schema.json",
    example: "examples/task/record-review.json"
  },
  "update-review": {
    summary: "Replace a Review and reconcile its Findings.",
    usage: "update-review [--project <dir>] --input <file> [--compact]",
    schema: "schemas/review-result.schema.json"
  },
  "record-usage": {
    summary: "Record exact host token usage or explicit telemetry unavailability.",
    usage: "record-usage [--project <dir>] --input <file> [--compact]",
    schema: "schemas/resource-usage.schema.json",
    example: "examples/task/record-usage.json"
  },
  assess: {
    summary: "Assess evidence-backed Task completion.",
    usage:
      "assess [--project <dir>] --id <task-id> [--write --expected-revision <n>] [--compact]"
  },
  report: {
    summary: "Build a daily or weekly person or team report.",
    usage:
      "report [--project <dir>] --period daily|weekly --scope person|team [--subject <id>] [--team <id>] [--from <date>] [--to <date>] [--write] [--compact]",
    schema: "schemas/task-report.schema.json"
  },
  capability: {
    summary: "Build evidence-scoped AI-programming capability profiles.",
    usage:
      "capability [--project <dir>] [--subject <id>] [--from <date>] [--to <date>] [--compact]",
    schema: "schemas/capability-report.schema.json"
  },
  feedback: {
    summary: "Capture immutable project Feedback with optional Task context.",
    usage: "feedback [--project <dir>] --input <file> [--compact]",
    schema: "schemas/feedback.schema.json",
    example: "examples/task/feedback.json"
  },
  "feedback-list": {
    summary: "List captured Feedback records.",
    usage: "feedback-list [--project <dir>] [--compact]",
    schema: "schemas/feedback.schema.json"
  }
};

class CliUsageError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

function taskCommandHelp(command) {
  const metadata = TASK_COMMANDS[command];
  if (!metadata) {
    throw new CliUsageError(
      "unknown-command",
      `Unknown Task command: ${command}`,
      "Run `node scripts/task.mjs --help` to list available commands."
    );
  }
  const details = [
    `Usage: node scripts/task.mjs ${metadata.usage}`,
    "",
    metadata.summary
  ];
  if (metadata.schema) details.push("", `Related schema: ${metadata.schema}`);
  if (metadata.example) {
    details.push(
      `Example input: ${metadata.example}`,
      `Print example: node scripts/task.mjs ${command} --example`
    );
  }
  details.push("", "Use --compact for single-line JSON output.");
  return `${details.join("\n")}\n`;
}

function taskGlobalHelp() {
  const commands = Object.entries(TASK_COMMANDS)
    .map(([command, metadata]) => `  ${command.padEnd(16)} ${metadata.summary}`)
    .join("\n");
  return `ZipZap project Task CLI

Usage:
  node scripts/task.mjs <command> [options]
  node scripts/task.mjs <command> --help
  node scripts/task.mjs <command> --example

Commands:
${commands}

Global options:
  -h, --help        Show global or command help.
  --project <dir>   Select the project root; defaults to the current directory.
  --compact         Emit single-line JSON.

Run \`node scripts/task.mjs <command> --help\` for command details.
`;
}

function optionValue(args, flag) {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(
      "missing-option-value",
      `${flag} requires a value.`,
      "Run `node scripts/task.mjs --help` or command-level --help."
    );
  }
  return value;
}

function parseInputJson(text, source, command) {
  if (!text.trim()) {
    throw new CliUsageError(
      "input-required",
      `No JSON input was provided for ${command}.`,
      `Use --input <file>, pipe JSON on stdin, or run \`node scripts/task.mjs ${command} --example\`.`
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliUsageError(
      "invalid-json",
      `Invalid JSON from ${source}: ${error.message}`,
      `Compare the input with \`node scripts/task.mjs ${command} --example\` and its related schema.`
    );
  }
}

function structuredCliError(error, command) {
  const knownCommand = TASK_COMMANDS[command] ? command : null;
  let code = error.code ?? "command-failed";
  let hint = error.hint;
  if (error instanceof SyntaxError) code = "invalid-json";
  if (!hint && error.code === "ENOENT") {
    code = "file-not-found";
    hint = "Check the supplied file or project path and try again.";
  }
  if (!error.code && /revision mismatch/i.test(error.message)) {
    code = "revision-conflict";
    hint = "Reload the Task, use its current revision, and retry.";
  }
  if (!error.code && /\bdoes not exist\b/i.test(error.message)) {
    code = "not-found";
    hint = "Check the Task or Review identifier and selected project root.";
  }
  if (!error.code && /\balready exists\b/i.test(error.message)) {
    code = "conflict";
    hint = "Choose a new identifier or update the existing record.";
  }
  if (!error.code && /invalid Task transition/i.test(error.message)) {
    code = "invalid-transition";
    hint = "Inspect the current Task status and choose an allowed transition.";
  }
  if (
    !error.code &&
    /\b(must|requires|invalid|cannot)\b/i.test(error.message) &&
    code === "command-failed"
  ) {
    code = "invalid-input";
  }
  if (!hint) {
    hint = knownCommand
      ? "Check the command options, example input, and related schema."
      : "Run the global help to select a supported command.";
  }
  return {
    ok: false,
    error: {
      code,
      message: error.message,
      hint,
      ...(error.details ? { details: error.details } : {}),
      help: knownCommand
        ? `node scripts/task.mjs ${knownCommand} --help`
        : "node scripts/task.mjs --help"
    }
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function identityFingerprint(value) {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

function normalizeParticipantIdentities(task) {
  for (const participant of task.participants ?? []) {
    const supplied = participant.git_identities ?? [];
    const existing = participant.git_identity_hashes ?? [];
    if (supplied.length > 0 || existing.length > 0) {
      participant.git_identity_hashes = [
        ...new Set([
          ...existing,
          ...supplied.map((identity) => identityFingerprint(identity))
        ])
      ].sort();
    }
    delete participant.git_identities;
  }
  return task;
}

function now() {
  return new Date().toISOString();
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertId(value, label) {
  if (!ID_PATTERN.test(value ?? "")) {
    throw new Error(`${label} must be a kebab-case identifier`);
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function validDateTime(value) {
  return nonEmptyString(value) && Number.isFinite(Date.parse(value));
}

function validEstimate(estimate) {
  return Boolean(
    estimate &&
      typeof estimate === "object" &&
      !Array.isArray(estimate) &&
      [estimate.min, estimate.likely, estimate.max].every(
        (value) => typeof value === "number" && value >= 0
      ) &&
      estimate.min <= estimate.likely &&
      estimate.likely <= estimate.max &&
      ["hours", "days", "points"].includes(estimate.unit) &&
      ["low", "medium", "high"].includes(estimate.confidence)
  );
}

function validAcceptanceCriteria(criteria) {
  if (!Array.isArray(criteria) || criteria.length === 0) return false;
  const ids = new Set();
  return criteria.every((criterion) => {
    const valid =
      criterion &&
      typeof criterion === "object" &&
      !Array.isArray(criterion) &&
      ID_PATTERN.test(criterion.id ?? "") &&
      nonEmptyString(criterion.statement) &&
      nonEmptyString(criterion.verification) &&
      Array.isArray(criterion.required_evidence) &&
      criterion.required_evidence.length > 0 &&
      criterion.required_evidence.every(nonEmptyString) &&
      !ids.has(criterion.id);
    if (valid) ids.add(criterion.id);
    return valid;
  });
}

function taskReadiness(task) {
  const missing = [];
  const warnings = [];
  const decisionsRequired = [];
  const requireValue = (requirement, condition) => {
    if (!condition) missing.push(requirement);
  };

  requireValue(
    "origin.kind",
    ["direct", "backlog-item", "review-finding", "imported"].includes(
      task?.origin?.kind
    )
  );
  if (
    ["backlog-item", "review-finding", "imported"].includes(
      task?.origin?.kind
    )
  ) {
    requireValue("origin.ref", nonEmptyString(task.origin.ref));
  }
  requireValue(
    "work.kind",
    [
      "requirement-delivery",
      "defect-fix",
      "technical-debt-remediation",
      "research",
      "maintenance",
      "other"
    ].includes(task?.work?.kind)
  );
  requireValue("work.objective", nonEmptyString(task?.work?.objective));
  requireValue(
    "work.scope",
    Array.isArray(task?.work?.scope) &&
      task.work.scope.length > 0 &&
      task.work.scope.every(nonEmptyString)
  );
  requireValue(
    "work.exclusions",
    Array.isArray(task?.work?.exclusions) &&
      task.work.exclusions.every(nonEmptyString)
  );
  requireValue(
    "work.requested_action",
    nonEmptyString(task?.work?.requested_action)
  );
  requireValue(
    "work.affected_components",
    Array.isArray(task?.work?.affected_components) &&
      task.work.affected_components.length > 0 &&
      task.work.affected_components.every(nonEmptyString)
  );
  requireValue(
    "work.constraints",
    Array.isArray(task?.work?.constraints) &&
      task.work.constraints.every(nonEmptyString)
  );
  requireValue(
    "work.acceptance_criteria",
    validAcceptanceCriteria(task?.work?.acceptance_criteria)
  );
  requireValue(
    "planning.priority",
    ["critical", "high", "medium", "low"].includes(task?.planning?.priority)
  );
  requireValue("planning.estimate", validEstimate(task?.planning?.estimate));
  requireValue(
    "planning.target_finish-or-deadline",
    validDateTime(task?.planning?.target_finish) ||
      validDateTime(task?.planning?.deadline)
  );
  requireValue(
    "accountability.role",
    nonEmptyString(task?.accountability?.role)
  );
  requireValue(
    "dependencies",
    Array.isArray(task?.dependencies) &&
      task.dependencies.every(
        (dependency) =>
          dependency &&
          nonEmptyString(dependency.ref) &&
          ["blocks", "requires", "related"].includes(dependency.type)
      )
  );
  const blockerIds = new Set();
  requireValue(
    "blockers",
    Array.isArray(task?.blockers) &&
      task.blockers.every((blocker) => {
        const valid =
          blocker &&
          ID_PATTERN.test(blocker.id ?? "") &&
          !blockerIds.has(blocker.id) &&
          nonEmptyString(blocker.statement) &&
          ["open", "resolved"].includes(blocker.status) &&
          nonEmptyString(blocker.resolution_condition);
        if (valid) blockerIds.add(blocker.id);
        return valid;
      })
  );
  const sourceIds = new Set();
  requireValue(
    "source_refs",
    Array.isArray(task?.source_refs) &&
      task.source_refs.every((source) => {
        const valid =
          source &&
          ID_PATTERN.test(source.id ?? "") &&
          !sourceIds.has(source.id) &&
          [
            "project-rule",
            "requirement",
            "design",
            "issue",
            "decision",
            "other"
          ].includes(source.kind) &&
          nonEmptyString(source.locator);
        if (valid) sourceIds.add(source.id);
        return valid;
      })
  );
  requireValue(
    "readiness_policy.mode",
    ["standard", "expedite"].includes(task?.readiness_policy?.mode)
  );

  const policy = task?.readiness_policy;
  let effectiveMissing = [...new Set(missing)];
  if (policy?.mode === "expedite") {
    const waiverValid =
      nonEmptyString(policy.authority) &&
      nonEmptyString(policy.reason) &&
      Array.isArray(policy.waived_requirements) &&
      policy.waived_requirements.length > 0 &&
      nonEmptyString(policy.expires_at) &&
      Number.isFinite(Date.parse(policy.expires_at)) &&
      Date.parse(policy.expires_at) > Date.now();
    if (!waiverValid) {
      decisionsRequired.push("complete-valid-expedite-authorization");
    } else {
      const waived = new Set(policy.waived_requirements);
      for (const requirement of waived) {
        if (!missing.includes(requirement)) {
          warnings.push(`waiver-not-needed:${requirement}`);
        }
        if (!EXPEDITE_WAIVABLE_REQUIREMENTS.has(requirement)) {
          decisionsRequired.push(
            `${NON_WAIVABLE_READY_REQUIREMENTS.has(requirement)
              ? "non-waivable"
              : "unsupported-waiver"}:${requirement}`
          );
        }
      }
      effectiveMissing = missing.filter(
        (requirement) =>
          !waived.has(requirement) ||
          !EXPEDITE_WAIVABLE_REQUIREMENTS.has(requirement)
      );
      for (const requirement of missing) {
        if (!effectiveMissing.includes(requirement)) {
          warnings.push(`waived:${requirement}`);
        }
      }
    }
  } else if (
    Array.isArray(policy?.waived_requirements) &&
    policy.waived_requirements.length > 0
  ) {
    warnings.push("standard-policy-ignores-waivers");
  }

  const openBlockers = (task?.blockers ?? []).filter(
    (blocker) => blocker?.status === "open"
  );
  if (openBlockers.length > 0) {
    decisionsRequired.push("resolve-open-blockers");
  } else if (task?.status === "blocked") {
    decisionsRequired.push("add-open-blocker");
  }
  const requirementsSatisfied =
    effectiveMissing.length === 0 &&
    decisionsRequired.every((decision) =>
      ["resolve-open-blockers", "add-open-blocker"].includes(decision)
    );
  const ready = requirementsSatisfied && openBlockers.length === 0;
  let statusCompatible = false;
  if (task?.status === "ready") statusCompatible = ready;
  else if (task?.status === "blocked") {
    statusCompatible =
      requirementsSatisfied &&
      openBlockers.length > 0 &&
      !decisionsRequired.includes("add-open-blocker");
  } else if (["in-progress", "review", "completed"].includes(task?.status)) {
    statusCompatible = ready;
  } else if (task?.status === "cancelled") {
    statusCompatible = true;
  } else {
    decisionsRequired.push("choose-valid-task-status");
  }

  return {
    standard_version: 1,
    ready,
    status_compatible: statusCompatible,
    missing: effectiveMissing,
    warnings: [...new Set(warnings)],
    decisions_required: [...new Set(decisionsRequired)]
  };
}

function assertCreationReady(task) {
  const report = taskReadiness(task);
  if (!TASK_CREATION_STATUSES.has(task.status)) {
    const error = new Error(
      `Task creation status must be ready or blocked: ${task.status}`
    );
    error.code = "invalid-creation-status";
    error.hint = "Create an execution-ready Task or record an explicit blocker.";
    error.details = report;
    throw error;
  }
  if (!report.status_compatible) {
    const error = new Error(
      `Task does not satisfy Task Standard v1 for status ${task.status}`
    );
    error.code = "task-not-ready";
    error.hint =
      "Run `node scripts/task.mjs validate --input <file>` and resolve its missing fields or decisions.";
    error.details = report;
    throw error;
  }
  return report;
}

function projectPath(projectRoot, locator) {
  const resolved = path.resolve(projectRoot, locator);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${locator}`);
  }
  return resolved;
}

function layout(projectRoot) {
  const zipzap = path.join(projectRoot, ".zipzap");
  return {
    zipzap,
    tasks: path.join(zipzap, "tasks"),
    events: path.join(zipzap, "events"),
    reviews: path.join(zipzap, "reviews"),
    feedback: path.join(zipzap, "feedback"),
    reports: path.join(zipzap, "reports")
  };
}

function ensureLayout(projectRoot) {
  const directories = layout(projectRoot);
  for (const directory of [
    directories.zipzap,
    directories.tasks,
    directories.events,
    directories.reviews,
    directories.feedback,
    directories.reports
  ]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const gitignore = path.join(directories.zipzap, ".gitignore");
  if (!fs.existsSync(gitignore)) {
    fs.writeFileSync(gitignore, PROJECT_GITIGNORE);
  }
  return directories;
}

function writeJsonAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temporary, filePath);
}

function validateTask(task) {
  assertObject(task, "Task");
  if (task.schema_version !== 1) {
    throw new Error("Task schema_version must be 1");
  }
  assertId(task.task_id, "Task task_id");
  if (!Number.isInteger(task.revision) || task.revision < 1) {
    throw new Error("Task revision must be a positive integer");
  }
  if (!TASK_STATUSES.has(task.status)) {
    throw new Error(`invalid Task status: ${task.status}`);
  }
  if (
    !task.origin ||
    !task.work ||
    !task.planning ||
    !task.accountability ||
    !Array.isArray(task.dependencies) ||
    !Array.isArray(task.blockers) ||
    !Array.isArray(task.source_refs) ||
    !task.readiness_policy ||
    !Array.isArray(task.evidence)
  ) {
    throw new Error("Task is missing Task Standard v1 fields");
  }
  if (
    !["direct", "backlog-item", "review-finding", "imported"].includes(
      task.origin.kind
    ) ||
    (task.origin.kind !== "direct" && !nonEmptyString(task.origin.ref))
  ) {
    throw new Error("Task origin is invalid");
  }
  if (
    ![
      "requirement-delivery",
      "defect-fix",
      "technical-debt-remediation",
      "research",
      "maintenance",
      "other"
    ].includes(task.work.kind) ||
    !nonEmptyString(task.work.objective) ||
    !Array.isArray(task.work.scope) ||
    task.work.scope.length === 0 ||
    !Array.isArray(task.work.exclusions) ||
    !nonEmptyString(task.work.requested_action) ||
    !Array.isArray(task.work.affected_components) ||
    !Array.isArray(task.work.constraints) ||
    !validAcceptanceCriteria(task.work.acceptance_criteria)
  ) {
    throw new Error("Task work or acceptance criteria is invalid");
  }
  if (
    !["critical", "high", "medium", "low"].includes(task.planning.priority) ||
    !validEstimate(task.planning.estimate)
  ) {
    throw new Error("Task planning estimate is invalid");
  }
  if (
    !nonEmptyString(task.accountability.role) ||
    !["standard", "expedite"].includes(task.readiness_policy.mode)
  ) {
    throw new Error("Task accountability or readiness policy is invalid");
  }
  if (
    task.readiness_policy.mode === "expedite" &&
    (!nonEmptyString(task.readiness_policy.authority) ||
      !nonEmptyString(task.readiness_policy.reason) ||
      !Array.isArray(task.readiness_policy.waived_requirements) ||
      task.readiness_policy.waived_requirements.length === 0 ||
      task.readiness_policy.waived_requirements.some(
        (requirement) => !EXPEDITE_WAIVABLE_REQUIREMENTS.has(requirement)
      ) ||
      !validDateTime(task.readiness_policy.expires_at))
  ) {
    throw new Error("Task expedite authorization is invalid");
  }
  if (
    task.work.scope.some((item) => !nonEmptyString(item)) ||
    task.work.exclusions.some((item) => !nonEmptyString(item)) ||
    task.work.affected_components.some((item) => !nonEmptyString(item)) ||
    task.work.constraints.some((item) => !nonEmptyString(item)) ||
    task.dependencies.some(
      (dependency) =>
        !dependency ||
        !nonEmptyString(dependency.ref) ||
        !["blocks", "requires", "related"].includes(dependency.type)
    )
  ) {
    throw new Error("Task work list or dependency is invalid");
  }
  for (const blocker of task.blockers) {
    if (
      !ID_PATTERN.test(blocker?.id ?? "") ||
      !nonEmptyString(blocker.statement) ||
      !["open", "resolved"].includes(blocker.status) ||
      !nonEmptyString(blocker.resolution_condition)
    ) {
      throw new Error(`Task blocker is invalid: ${blocker?.id ?? "unknown"}`);
    }
  }
  for (const source of task.source_refs) {
    if (
      !ID_PATTERN.test(source?.id ?? "") ||
      ![
        "project-rule",
        "requirement",
        "design",
        "issue",
        "decision",
        "other"
      ].includes(source.kind) ||
      !nonEmptyString(source.locator)
    ) {
      throw new Error(`Task source reference is invalid: ${source?.id ?? "unknown"}`);
    }
  }
  for (const participant of task.participants ?? []) {
    if (
      !participant.subject_id ||
      !["human", "agent"].includes(participant.kind) ||
      !Array.isArray(participant.roles) ||
      (participant.git_identity_hashes ?? []).some(
        (fingerprint) => !/^[0-9a-f]{64}$/.test(fingerprint)
      )
    ) {
      throw new Error("Task participant is invalid");
    }
  }
  if (
    task.resource_budget != null &&
    (!Number.isInteger(task.resource_budget.token_budget) ||
      task.resource_budget.token_budget < 1 ||
      !["not-requested", "explicit-user", "denied"].includes(
        task.resource_budget.goal_authorization
      ) ||
      (task.resource_budget.goal_id != null &&
        (!nonEmptyString(task.resource_budget.goal_id) ||
          task.resource_budget.goal_authorization !== "explicit-user")))
  ) {
    throw new Error("Task resource budget is invalid");
  }
  return task;
}

function taskFile(projectRoot, taskId) {
  assertId(taskId, "Task ID");
  return path.join(layout(projectRoot).tasks, `${taskId}.json`);
}

function loadTask(projectRoot, taskId) {
  const filePath = taskFile(projectRoot, taskId);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Task does not exist: ${taskId}`);
  }
  return validateTask(readJson(filePath));
}

function saveTask(projectRoot, task) {
  validateTask(task);
  const directories = ensureLayout(projectRoot);
  writeJsonAtomic(path.join(directories.tasks, `${task.task_id}.json`), task);
}

function listTasks(projectRoot) {
  const directory = layout(projectRoot).tasks;
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => validateTask(readJson(path.join(directory, name))));
}

function validateTaskEvent(event) {
  assertObject(event, "Task event");
  if (
    event.schema_version !== 1 ||
    !nonEmptyString(event.event_id) ||
    !ID_PATTERN.test(event.task_id ?? "") ||
    !TASK_EVENT_TYPES.has(event.type) ||
    !validDateTime(event.occurred_at) ||
    !event.data ||
    typeof event.data !== "object" ||
    Array.isArray(event.data)
  ) {
    throw new Error(`Task event is invalid: ${event?.event_id ?? "unknown"}`);
  }
  return event;
}

function appendEvent(projectRoot, event) {
  validateTaskEvent(event);
  const directories = ensureLayout(projectRoot);
  const taskDirectory = path.join(directories.events, event.task_id);
  fs.mkdirSync(taskDirectory, { recursive: true });
  const filePath = path.join(taskDirectory, `${event.event_id}.json`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Task event already exists: ${event.event_id}`);
  }
  writeJsonAtomic(filePath, event);
  return filePath;
}

function taskEvent(taskId, type, data, options = {}) {
  const occurredAt = options.occurred_at ?? now();
  return {
    schema_version: 1,
    event_id: `${occurredAt.replace(/[^0-9]/g, "").slice(0, 17)}-${crypto
      .randomUUID()
      .slice(0, 8)}`,
    task_id: taskId,
    type,
    occurred_at: occurredAt,
    actor_id: options.actor_id ?? null,
    base_revision: options.base_revision ?? null,
    next_revision: options.next_revision ?? null,
    data: clone(data)
  };
}

function readEvents(projectRoot, from, to) {
  const directory = layout(projectRoot).events;
  if (!fs.existsSync(directory)) return [];
  const eventsById = new Map();
  const visitJsonEvents = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        visitJsonEvents(entryPath);
      } else if (entry.isFile() && entry.name.endsWith(".json")) {
        const event = validateTaskEvent(readJson(entryPath));
        eventsById.set(event.event_id, event);
      }
    }
  };
  visitJsonEvents(directory);
  for (const name of fs
    .readdirSync(directory)
    .filter((item) => item.endsWith(".jsonl"))) {
    const lines = fs
      .readFileSync(path.join(directory, name), "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    for (const line of lines) {
      const event = validateTaskEvent(JSON.parse(line));
      if (!eventsById.has(event.event_id)) {
        eventsById.set(event.event_id, event);
      }
    }
  }
  return [...eventsById.values()]
    .filter((event) => {
      const timestamp = Date.parse(event.occurred_at);
      return timestamp >= from.getTime() && timestamp <= to.getTime();
    })
    .sort(
      (left, right) =>
        left.occurred_at.localeCompare(right.occurred_at) ||
        left.event_id.localeCompare(right.event_id)
    );
}

function reviewFile(projectRoot, reviewId) {
  assertId(reviewId, "Review ID");
  return path.join(layout(projectRoot).reviews, `${reviewId}.json`);
}

function validateReview(review) {
  assertObject(review, "Review");
  if (review.schema_version !== 1) {
    throw new Error("Review schema_version must be 1");
  }
  assertId(review.review_id, "Review ID");
  assertId(review.task_id, "Review task_id");
  if (
    !review.reviewer?.subject_id ||
    !["self", "peer", "independent"].includes(
      review.reviewer.independence
    ) ||
    !["approved", "changes-requested", "blocked", "advisory"].includes(
      review.outcome
    ) ||
    !Array.isArray(review.findings)
  ) {
    throw new Error("Review result is invalid");
  }
  if (
    review.subject_snapshot != null &&
    (!Number.isInteger(review.subject_snapshot.task_revision) ||
      review.subject_snapshot.task_revision < 1 ||
      !Array.isArray(review.subject_snapshot.artifact_refs) ||
      (review.subject_snapshot.git_head != null &&
        !nonEmptyString(review.subject_snapshot.git_head)) ||
      review.subject_snapshot.artifact_refs.some(
        (reference) =>
          !reference ||
          !nonEmptyString(reference.locator) ||
          (reference.version != null && !nonEmptyString(reference.version))
      ))
  ) {
    throw new Error("Review subject snapshot is invalid");
  }
  for (const finding of review.findings) {
    if (
      !nonEmptyString(finding?.id) ||
      !nonEmptyString(finding.statement) ||
      !["blocker", "high", "medium", "low", "advisory"].includes(
        finding.severity
      ) ||
      (finding.priority != null &&
        !["p0", "p1", "p2", "p3"].includes(finding.priority)) ||
      typeof finding.blocking !== "boolean" ||
      ![
        "open",
        "fixed",
        "accepted",
        "deferred",
        "duplicate",
        "not-reproducible"
      ].includes(finding.status) ||
      !Array.isArray(finding.evidence_refs)
    ) {
      throw new Error(`Review Finding is invalid: ${finding?.id ?? "unknown"}`);
    }
  }
  return review;
}

function listReviews(projectRoot, taskId = null, from = null, to = null) {
  const directory = layout(projectRoot).reviews;
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => validateReview(readJson(path.join(directory, name))))
    .filter((review) => !taskId || review.task_id === taskId)
    .filter((review) => {
      if (!from || !to) return true;
      const timestamp = Date.parse(review.created_at);
      return timestamp >= from.getTime() && timestamp <= to.getTime();
    });
}

function feedbackFile(projectRoot, feedbackId) {
  assertId(feedbackId, "Feedback ID");
  return path.join(layout(projectRoot).feedback, `${feedbackId}.json`);
}

function validateFeedback(feedback) {
  assertObject(feedback, "Feedback");
  if (feedback.schema_version !== 1) {
    throw new Error("Feedback schema_version must be 1");
  }
  assertId(feedback.feedback_id, "Feedback feedback_id");
  if (
    !["problem", "suggestion", "success", "question"].includes(feedback.kind) ||
    ![
      "initialization",
      "source-routing",
      "risk-assessment",
      "team-selection",
      "execution",
      "task-management",
      "git-tracking",
      "review",
      "reporting",
      "performance",
      "other"
    ].includes(feedback.area) ||
    !nonEmptyString(feedback.summary) ||
    !nonEmptyString(feedback.observed) ||
    !["blocker", "high", "medium", "low"].includes(feedback.impact) ||
    !Array.isArray(feedback.artifact_refs)
  ) {
    throw new Error("Feedback core fields are invalid");
  }
  if (feedback.task_id != null) {
    assertId(feedback.task_id, "Feedback task_id");
  }
  for (const reference of feedback.artifact_refs) {
    if (
      !reference ||
      ![
        "task",
        "review",
        "event",
        "command",
        "git",
        "file",
        "other"
      ].includes(reference.kind) ||
      !nonEmptyString(reference.locator)
    ) {
      throw new Error("Feedback artifact reference is invalid");
    }
  }
  if (feedback.created_at != null && !validDateTime(feedback.created_at)) {
    throw new Error("Feedback created_at is invalid");
  }
  return feedback;
}

function createFeedback(projectRoot, input) {
  assertObject(input, "Feedback input");
  ensureLayout(projectRoot);
  const task = input.task_id ? loadTask(projectRoot, input.task_id) : null;
  const reviews = task ? listReviews(projectRoot, task.task_id) : [];
  const assessment = task ? completionAssessment(task, reviews) : null;
  const lifecycle = readJson(path.join(DEFAULT_ROOT, "config", "lifecycle.json"));
  const automaticTaskRef = task
    ? {
        kind: "task",
        locator: `.zipzap/tasks/${task.task_id}.json`,
        statement: "Task snapshot source for this Feedback."
      }
    : null;
  const artifactRefs = clone(input.artifact_refs ?? []);
  if (
    automaticTaskRef &&
    !artifactRefs.some(
      (reference) =>
        reference.kind === automaticTaskRef.kind &&
        reference.locator === automaticTaskRef.locator
    )
  ) {
    artifactRefs.push(automaticTaskRef);
  }
  const feedback = validateFeedback({
    ...clone(input),
    schema_version: 1,
    artifact_refs: artifactRefs,
    created_at: input.created_at ?? now(),
    zipzap_snapshot: {
      skill_version: lifecycle.skill.current_version,
      task_standard_version: 1
    },
    ...(task
      ? {
          task_snapshot: {
            task_id: task.task_id,
            revision: task.revision,
            status: task.status,
            work_kind: task.work.kind,
            completion: assessment.status,
            effective_team: task.runtime_snapshot?.effective_team ?? null,
            review_count: reviews.length,
            open_findings:
              assessment.open_findings.blocking +
              assessment.open_findings.non_blocking
          }
        }
      : {})
  });
  const filePath = feedbackFile(projectRoot, feedback.feedback_id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Feedback already exists: ${feedback.feedback_id}`);
  }
  writeJsonAtomic(filePath, feedback);
  return {
    feedback,
    locator: path
      .relative(projectRoot, filePath)
      .split(path.sep)
      .join("/")
  };
}

function listFeedback(projectRoot) {
  const directory = layout(projectRoot).feedback;
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => validateFeedback(readJson(path.join(directory, name))))
    .map((feedback) => ({
      feedback_id: feedback.feedback_id,
      kind: feedback.kind,
      area: feedback.area,
      impact: feedback.impact,
      summary: feedback.summary,
      task_id: feedback.task_id ?? null,
      created_at: feedback.created_at ?? null,
      locator: `.zipzap/feedback/${feedback.feedback_id}.json`
    }));
}

function runGit(repository, args, options = {}) {
  const result = spawnSync("git", args, {
    cwd: repository,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `git ${args[0]} failed: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return {
    status: result.status,
    stdout: result.stdout.trimEnd(),
    stderr: result.stderr.trimEnd()
  };
}

function resolveRepository(projectRoot, locator = ".") {
  const canonicalProjectRoot = fs.realpathSync(projectRoot);
  const requested = fs.realpathSync(projectPath(projectRoot, locator));
  const repositoryRoot = fs.realpathSync(
    runGit(requested, ["rev-parse", "--show-toplevel"]).stdout
  );
  const relative = path.relative(canonicalProjectRoot, repositoryRoot);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Git repository root is outside the ZipZap project");
  }
  return repositoryRoot;
}

function commitStats(repository, sha, paths) {
  const args = ["show", "--format=", "--numstat", "--no-renames", sha];
  if (paths.length > 0) args.push("--", ...paths);
  const output = runGit(repository, args).stdout;
  let insertions = 0;
  let deletions = 0;
  const changedPaths = [];
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [added, removed, ...fileParts] = line.split("\t");
    const file = fileParts.join("\t");
    if (!file) continue;
    changedPaths.push(file);
    if (added !== "-") insertions += Number(added);
    if (removed !== "-") deletions += Number(removed);
  }
  return {
    changed_paths: [...new Set(changedPaths)].sort(),
    insertions,
    deletions
  };
}

function mapSubject(task, authorName, authorEmail) {
  const actual = new Set(
    [authorName, authorEmail].map((value) => identityFingerprint(value))
  );
  for (const participant of task.participants ?? []) {
    if (
      (participant.git_identity_hashes ?? []).some((fingerprint) =>
        actual.has(fingerprint)
      )
    ) {
      return participant.subject_id;
    }
  }
  return null;
}

function readCommit(repository, sha, task, explicitRefs, paths) {
  const format = "%H%x09%an%x09%ae%x09%aI%x09%s";
  const line = runGit(repository, [
    "show",
    "-s",
    `--format=${format}`,
    sha
  ]).stdout;
  const [fullSha, authorName, authorEmail, authoredAt, ...subjectParts] =
    line.split("\t");
  const body = runGit(repository, ["show", "-s", "--format=%B", fullSha])
    .stdout;
  const trailerPattern = new RegExp(
    `^ZipZap-Task:\\s*${task.task_id}\\s*$`,
    "mi"
  );
  const association = explicitRefs.has(fullSha)
    ? "explicit"
    : trailerPattern.test(body)
      ? "trailer"
      : "candidate";
  const stats = commitStats(repository, fullSha, paths);
  return {
    sha: fullSha,
    subject: subjectParts.join("\t"),
    authored_at: authoredAt,
    subject_id: mapSubject(task, authorName, authorEmail),
    association,
    changed_files: stats.changed_paths.length,
    insertions: stats.insertions,
    deletions: stats.deletions,
    changed_paths: stats.changed_paths
  };
}

function rangeCommitShas(repository, baseCommit, headRef, paths, maxCommits) {
  const range = baseCommit ? `${baseCommit}..${headRef}` : headRef;
  const args = [
    "log",
    `--max-count=${maxCommits}`,
    "--format=%H",
    range
  ];
  if (paths.length > 0) args.push("--", ...paths);
  const output = runGit(repository, args).stdout;
  return output ? output.split(/\r?\n/).filter(Boolean) : [];
}

function scanGit(projectRoot, task) {
  if (!task.git_tracking) {
    throw new Error(`Task ${task.task_id} does not define git_tracking`);
  }
  const tracking = task.git_tracking;
  const repository = resolveRepository(
    projectRoot,
    tracking.repository ?? "."
  );
  const headRef = tracking.head_ref ?? "HEAD";
  const head = runGit(repository, ["rev-parse", `${headRef}^{commit}`]).stdout;
  const branchResult = runGit(
    repository,
    ["symbolic-ref", "--short", "-q", "HEAD"],
    { allowFailure: true }
  );
  const paths = tracking.paths ?? [];
  const explicitRefs = new Set();
  for (const ref of tracking.commit_refs ?? []) {
    explicitRefs.add(
      runGit(repository, ["rev-parse", `${ref}^{commit}`]).stdout
    );
  }
  const shas = rangeCommitShas(
    repository,
    tracking.base_commit ?? null,
    headRef,
    paths,
    tracking.max_commits ?? 100
  );
  for (const sha of explicitRefs) {
    if (!shas.includes(sha)) shas.push(sha);
  }
  const commits = shas.map((sha) =>
    readCommit(repository, sha, task, explicitRefs, paths)
  );
  const confirmed = commits.filter((commit) =>
    ["explicit", "trailer"].includes(commit.association)
  );
  const candidates = commits.filter(
    (commit) => commit.association === "candidate"
  );
  const statusArgs = ["status", "--short", "--untracked-files=all"];
  if (paths.length > 0) statusArgs.push("--", ...paths);
  const workingStatus = runGit(repository, statusArgs).stdout;
  const changedPaths = [
    ...new Set(commits.flatMap((commit) => commit.changed_paths))
  ].sort();
  const publicCommit = ({ changed_paths, ...commit }) => commit;
  return {
    derived: true,
    task_revision: task.revision,
    repository_head: head,
    branch: branchResult.status === 0 ? branchResult.stdout || null : null,
    base_commit: tracking.base_commit ?? null,
    synced_at: now(),
    confirmed_commits: confirmed.map(publicCommit),
    candidate_commits: candidates.map(publicCommit),
    changed_paths: changedPaths,
    insertions: commits.reduce((total, commit) => total + commit.insertions, 0),
    deletions: commits.reduce((total, commit) => total + commit.deletions, 0),
    contributors: [
      ...new Set(commits.map((commit) => commit.subject_id).filter(Boolean))
    ].sort(),
    uncommitted_changes: Boolean(workingStatus)
  };
}

function criterionIds(task) {
  return (task.work.acceptance_criteria ?? []).map(
    (criterion) => criterion.id
  );
}

function completionAssessment(task, reviews) {
  const criteria = criterionIds(task);
  const passed = new Set(
    task.evidence
      .filter((evidence) => evidence.status === "pass")
      .flatMap((evidence) => evidence.criteria_refs ?? [])
  );
  const findings = [
    ...(task.findings ?? []).filter((finding) => !finding.review_ref),
    ...reviews.flatMap((review) =>
      review.findings.map((finding) => ({
        ...finding,
        review_ref: review.review_id
      }))
    )
  ];
  const open = findings.filter((finding) =>
    OPEN_FINDING_STATUSES.has(finding.status)
  );
  const blocking = open.filter(
    (finding) => finding.blocking === true || finding.severity === "blocker"
  );
  const changesRequested = reviews.some((review) =>
    ["changes-requested", "blocked"].includes(review.outcome)
  );
  const requiredGates = task.governance_snapshot?.required_gates ?? [];
  const satisfiedGates = new Set(
    (task.gate_results ?? [])
      .filter((gate) => gate.status === "satisfied")
      .map((gate) => gate.id)
  );
  const approvedReviews = reviews.filter(
    (review) =>
      review.outcome === "approved" &&
      review.reviewer.independence !== "self"
  );
  for (const gate of requiredGates) {
    if (/review/.test(gate) && approvedReviews.length > 0) {
      satisfiedGates.add(gate);
    }
  }
  const missingGates = requiredGates.filter(
    (gate) => !satisfiedGates.has(gate)
  );
  const verified = criteria.filter((id) => passed.has(id)).length;
  const nextActions = [];
  let status = "in-progress";
  if (task.status === "blocked") {
    status = "blocked";
    nextActions.push("Resolve the recorded Task blocker.");
  } else if (blocking.length > 0 || changesRequested) {
    status = "changes-requested";
    if (blocking.length > 0) {
      nextActions.push(
        ...blocking.map(
          (finding) =>
            `Resolve blocking Finding ${finding.review_ref ?? "task"}:${finding.id}.`
        )
      );
    } else {
      nextActions.push("Resolve the latest Review changes request.");
    }
  } else if (criteria.length === 0) {
    status = "verification-needed";
    nextActions.push("Define acceptance criteria before claiming completion.");
  } else if (verified < criteria.length) {
    status = "verification-needed";
    nextActions.push(
      `Provide passing evidence for ${criteria.length - verified} acceptance criteria.`
    );
  } else if (missingGates.some((gate) => /review/.test(gate))) {
    status = "review-needed";
    nextActions.push("Satisfy the required non-self Review gate.");
  } else if (missingGates.length > 0) {
    status = "in-progress";
    nextActions.push(`Satisfy gates: ${missingGates.join(", ")}.`);
  } else if (task.status === "completed") {
    status = "complete";
  } else {
    status = "ready-to-complete";
    nextActions.push("Transition the Task to completed.");
  }
  if (task.git_snapshot?.uncommitted_changes) {
    nextActions.push("Reconcile uncommitted project changes.");
  }
  const completionLabel =
    status === "complete"
      ? task.governance_snapshot?.claim_limit ??
        (approvedReviews.length > 0
          ? "independently-reviewed"
          : "verified-complete")
      : status === "ready-to-complete"
        ? "verified-ready-to-complete"
        : status;
  const executionView = task.runtime_snapshot
    ? {
        stamp: task.runtime_snapshot.execution_stamp ?? null,
        effective_team: task.runtime_snapshot.effective_team,
        assurance_mode: task.runtime_snapshot.assurance_mode,
        active_perspective:
          clone(task.runtime_snapshot.active_perspective ?? null),
        participants: clone(task.runtime_snapshot.participants ?? [])
      }
    : null;
  return {
    derived: true,
    task_revision: task.revision,
    status,
    completion_label: completionLabel,
    execution_view: executionView,
    assessed_at: now(),
    criteria: {
      verified,
      total: criteria.length
    },
    open_findings: {
      blocking: blocking.length,
      non_blocking: open.length - blocking.length
    },
    missing_gates: missingGates,
    next_actions: [...new Set(nextActions)]
  };
}

function parseDate(value, label) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is invalid`);
  return date;
}

function reportWindow(period, fromValue, toValue) {
  const to = toValue ? parseDate(toValue, "--to") : new Date();
  let from;
  if (fromValue) {
    from = parseDate(fromValue, "--from");
  } else if (period === "daily") {
    from = new Date(to);
    from.setHours(0, 0, 0, 0);
  } else {
    from = new Date(to);
    const day = (from.getDay() + 6) % 7;
    from.setDate(from.getDate() - day);
    from.setHours(0, 0, 0, 0);
  }
  return { from, to };
}

function taskInScope(task, scope, subjectId, teamId) {
  if (scope === "person") {
    return (task.participants ?? []).some(
      (participant) => participant.subject_id === subjectId
    );
  }
  return !teamId || task.team_id === teamId;
}

function taskSummary(task, reviews) {
  const assessment = completionAssessment(task, reviews);
  return {
    task_id: task.task_id,
    objective: task.work.objective,
    status: task.status,
    completion: assessment.status,
    completion_label: assessment.completion_label,
    execution: assessment.execution_view
      ? {
          stamp: assessment.execution_view.stamp,
          effective_team: assessment.execution_view.effective_team,
          assurance_mode: assessment.execution_view.assurance_mode
        }
      : null,
    criteria: assessment.criteria,
    open_findings: assessment.open_findings,
    git: {
      confirmed_commits: task.git_snapshot?.confirmed_commits.length ?? 0,
      candidate_commits: task.git_snapshot?.candidate_commits.length ?? 0,
      changed_paths: task.git_snapshot?.changed_paths.length ?? 0,
      uncommitted_changes: task.git_snapshot?.uncommitted_changes ?? false
    },
    next_actions: assessment.next_actions
  };
}

function summarizeUsage(events) {
  const records = events
    .filter((event) => event.type === "usage-recorded")
    .map((event) => event.data.resource_usage);
  const exact = records.filter((usage) => usage.measurement === "exact");
  const unavailable = records.length - exact.length;
  const sum = (field) =>
    exact.reduce((total, usage) => total + usage[field], 0);
  return {
    measurement:
      records.length === 0 || exact.length === 0
        ? "unavailable"
        : unavailable > 0
          ? "mixed"
          : "exact",
    exact_records: exact.length,
    unavailable_records: unavailable,
    input_tokens: sum("input_tokens"),
    output_tokens: sum("output_tokens"),
    tool_result_tokens: sum("tool_result_tokens"),
    total_tokens: sum("total_tokens")
  };
}

function buildReport(projectRoot, options) {
  const { from, to } = reportWindow(
    options.period,
    options.from,
    options.to
  );
  const events = readEvents(projectRoot, from, to);
  const eventTaskIds = new Set(events.map((event) => event.task_id));
  const tasks = listTasks(projectRoot).filter((task) =>
    taskInScope(task, options.scope, options.subject, options.team)
  );
  const selected = tasks.filter((task) => {
    if (eventTaskIds.has(task.task_id)) return true;
    const updated = Date.parse(task.updated_at ?? task.created_at ?? 0);
    return updated >= from.getTime() && updated <= to.getTime();
  });
  const selectedTaskIds = new Set(selected.map((task) => task.task_id));
  const scopedEvents = events.filter((event) =>
    selectedTaskIds.has(event.task_id)
  );
  const summaries = selected.map((task) => ({
    ...taskSummary(task, listReviews(projectRoot, task.task_id)),
    resource_usage: summarizeUsage(
      scopedEvents.filter((event) => event.task_id === task.task_id)
    )
  }));
  const statusCounts = {};
  for (const summary of summaries) {
    statusCounts[summary.status] = (statusCounts[summary.status] ?? 0) + 1;
  }
  return {
    schema_version: 1,
    period: options.period,
    scope: options.scope,
    ...(options.subject ? { subject_id: options.subject } : {}),
    ...(options.team ? { team_id: options.team } : {}),
    window: {
      from: from.toISOString(),
      to: to.toISOString()
    },
    summary: {
      tasks_touched: summaries.length,
      active_tasks: summaries.filter(
        (task) => !["completed", "cancelled"].includes(task.status)
      ).length,
      status_counts: statusCounts,
      completed_transitions: scopedEvents.filter(
        (event) =>
          event.type === "transitioned" && event.data.to === "completed"
      ).length,
      git_syncs: scopedEvents.filter(
        (event) => event.type === "git-synced"
      ).length,
      reviews_recorded: scopedEvents.filter(
        (event) => event.type === "review-recorded"
      ).length,
      blocking_findings: summaries.reduce(
        (total, task) => total + task.open_findings.blocking,
        0
      )
    },
    resource_usage: summarizeUsage(scopedEvents),
    tasks: summaries,
    limitations:
      scopedEvents.length === 0
        ? ["No Task events were recorded in the selected window."]
        : []
  };
}

function confidenceFor(sampleSize) {
  if (sampleSize >= 10) return "high";
  if (sampleSize >= 3) return "medium";
  return "low";
}

function assessmentBand(value, sampleSize, direction = "high") {
  if (sampleSize < 3 || value == null) return "insufficient-evidence";
  if (direction === "low") {
    if (value <= 0.25) return "strong";
    if (value <= 0.75) return "steady";
    return "developing";
  }
  if (value >= 0.8) return "strong";
  if (value >= 0.5) return "steady";
  return "developing";
}

function capabilityProfile(projectRoot, subjectId, tasks, reviews) {
  const subjectTasks = tasks.filter((task) =>
    (task.participants ?? []).some(
      (participant) =>
        participant.subject_id === subjectId && participant.kind === "human"
    )
  );
  const taskIds = new Set(subjectTasks.map((task) => task.task_id));
  const subjectReviews = reviews.filter((review) =>
    taskIds.has(review.task_id)
  );
  const assessments = subjectTasks.map((task) =>
    completionAssessment(
      task,
      subjectReviews.filter((review) => review.task_id === task.task_id)
    )
  );
  const reviewedTaskCount = new Set(
    subjectReviews.map((review) => review.task_id)
  ).size;
  const findings = subjectReviews.flatMap((review) =>
    review.findings.map((finding) => ({
      ...finding,
      evidence_ref: `${review.review_id}:${finding.id}`
    }))
  );
  const blockingFindings = findings.filter(
    (finding) => finding.blocking || finding.severity === "blocker"
  );
  const actionableFindings = findings.filter(
    (finding) => finding.severity !== "advisory"
  );
  const fixedFindings = actionableFindings.filter(
    (finding) => finding.status === "fixed"
  );
  const totalCriteria = assessments.reduce(
    (total, assessment) => total + assessment.criteria.total,
    0
  );
  const verifiedCriteria = assessments.reduce(
    (total, assessment) => total + assessment.criteria.verified,
    0
  );
  const correctnessRate =
    reviewedTaskCount > 0 ? blockingFindings.length / reviewedTaskCount : null;
  const verificationRate =
    totalCriteria > 0 ? verifiedCriteria / totalCriteria : null;
  const responseRate =
    actionableFindings.length > 0
      ? fixedFindings.length / actionableFindings.length
      : null;
  const sourceEvidenceTasks = subjectTasks.filter((task) =>
    task.evidence.some((evidence) => evidence.kind === "project-rule")
  ).length;
  const sourceRate =
    subjectTasks.length > 0 ? sourceEvidenceTasks / subjectTasks.length : null;
  const evidenceRefs = subjectTasks.map((task) => task.task_id).slice(0, 20);
  const findingRefs = findings
    .map((finding) => finding.evidence_ref)
    .slice(0, 20);
  const workTypes = {};
  for (const task of subjectTasks) {
    const workType = task.work.work_type ?? "unspecified";
    workTypes[workType] = (workTypes[workType] ?? 0) + 1;
  }
  const confidence = confidenceFor(subjectTasks.length);
  return {
    subject_id: subjectId,
    sample: {
      tasks: subjectTasks.length,
      completed: subjectTasks.filter((task) => task.status === "completed")
        .length,
      reviewed: reviewedTaskCount,
      review_findings: findings.length,
      confirmed_commits: subjectTasks.reduce(
        (total, task) =>
          total +
          (task.git_snapshot?.confirmed_commits.filter(
            (commit) => commit.subject_id === subjectId
          ).length ?? 0),
        0
      )
    },
    task_mix: {
      work_types: workTypes,
      risk_observations: subjectTasks.map(
        (task) => task.governance_snapshot?.risk_flags.length ?? 0
      )
    },
    dimensions: {
      "implementation-correctness": {
        assessment: assessmentBand(
          correctnessRate,
          reviewedTaskCount,
          "low"
        ),
        confidence: confidenceFor(reviewedTaskCount),
        evidence_refs: findingRefs
      },
      "verification-discipline": {
        assessment: assessmentBand(
          verificationRate,
          subjectTasks.length
        ),
        confidence,
        evidence_refs: evidenceRefs
      },
      "review-responsiveness": {
        assessment: assessmentBand(
          responseRate,
          actionableFindings.length
        ),
        confidence: confidenceFor(actionableFindings.length),
        evidence_refs: findingRefs
      },
      "project-context-discipline": {
        assessment: assessmentBand(sourceRate, subjectTasks.length),
        confidence,
        evidence_refs: evidenceRefs
      }
    },
    limitations: [
      ...(subjectTasks.length < 3
        ? ["Fewer than three comparable Tasks were observed."]
        : []),
      "Git and Review evidence describe outcomes, not the fraction of code authored by AI.",
      "Task complexity and role scope may not be fully normalized."
    ]
  };
}

function buildCapabilityReport(projectRoot, options) {
  const to = options.to ? parseDate(options.to, "--to") : new Date();
  const from = options.from
    ? parseDate(options.from, "--from")
    : new Date(to.getTime() - 90 * 24 * 60 * 60 * 1000);
  const tasks = listTasks(projectRoot).filter((task) => {
    const updated = Date.parse(task.updated_at ?? task.created_at ?? 0);
    return updated >= from.getTime() && updated <= to.getTime();
  });
  const reviews = listReviews(projectRoot, null, from, to);
  const subjectIds = options.subject
    ? [options.subject]
    : [
        ...new Set(
          tasks.flatMap((task) =>
            (task.participants ?? [])
              .filter((participant) => participant.kind === "human")
              .map((participant) => participant.subject_id)
          )
        )
      ].sort();
  return {
    schema_version: 1,
    window: {
      from: from.toISOString(),
      to: to.toISOString()
    },
    profiles: subjectIds.map((subjectId) =>
      capabilityProfile(projectRoot, subjectId, tasks, reviews)
    ),
    comparison_limitations: [
      "Do not use this report as a standalone performance ranking.",
      "Compare people only when Task type, risk, role, and opportunity are materially comparable.",
      "Every assessment must remain traceable to the listed Task or Review evidence."
    ]
  };
}

function readInput(inputPath, command) {
  if (inputPath) {
    const resolved = path.resolve(inputPath);
    let text;
    try {
      text = fs.readFileSync(resolved, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new CliUsageError(
          "input-file-not-found",
          `Input file does not exist: ${inputPath}`,
          `Create the file from \`node scripts/task.mjs ${command} --example\` or correct the path.`
        );
      }
      throw error;
    }
    return parseInputJson(text, inputPath, command);
  }
  if (!process.stdin.isTTY) {
    return parseInputJson(fs.readFileSync(0, "utf8"), "stdin", command);
  }
  throw new CliUsageError(
    "input-required",
    `Command ${command} requires JSON input.`,
    `Use --input <file>, pipe JSON on stdin, or run \`node scripts/task.mjs ${command} --example\`.`
  );
}

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === "-h" || args[0] === "--help") {
    return { command: null, help: true };
  }
  if (args[0] === "help") {
    args.shift();
    return { command: args.shift() ?? null, help: true };
  }
  const command = args.shift() ?? null;
  const options = {
    command,
    project: ".",
    input: null,
    id: null,
    status: null,
    period: null,
    scope: null,
    subject: null,
    team: null,
    from: null,
    to: null,
    expectedRevision: null,
    write: false,
    compact: false,
    help: command == null,
    example: false
  };
  while (args.length > 0) {
    const flag = args.shift();
    if (flag === "--project") options.project = optionValue(args, flag);
    else if (flag === "--input") options.input = optionValue(args, flag);
    else if (flag === "--id") options.id = optionValue(args, flag);
    else if (flag === "--status") options.status = optionValue(args, flag);
    else if (flag === "--period") options.period = optionValue(args, flag);
    else if (flag === "--scope") options.scope = optionValue(args, flag);
    else if (flag === "--subject") options.subject = optionValue(args, flag);
    else if (flag === "--team") options.team = optionValue(args, flag);
    else if (flag === "--from") options.from = optionValue(args, flag);
    else if (flag === "--to") options.to = optionValue(args, flag);
    else if (flag === "--expected-revision") {
      const value = Number(optionValue(args, flag));
      if (!Number.isInteger(value) || value < 1) {
        throw new CliUsageError(
          "invalid-option-value",
          "--expected-revision must be a positive integer.",
          `Run \`node scripts/task.mjs ${command} --help\` for command usage.`
        );
      }
      options.expectedRevision = value;
    }
    else if (flag === "-h" || flag === "--help") options.help = true;
    else if (flag === "--example") options.example = true;
    else if (flag === "--write") options.write = true;
    else if (flag === "--compact") options.compact = true;
    else {
      throw new CliUsageError(
        "unknown-argument",
        `Unknown argument for ${command}: ${flag}`,
        `Run \`node scripts/task.mjs ${command} --help\` to see supported options.`
      );
    }
  }
  return options;
}

function requireTaskOption(options, field, flag) {
  if (options[field] == null || options[field] === "") {
    throw new CliUsageError(
      "missing-option",
      `Command ${options.command} requires ${flag}.`,
      `Run \`node scripts/task.mjs ${options.command} --help\` for command usage.`
    );
  }
}

function validateTaskOptions(options) {
  if (["show", "git-scan", "sync-git", "assess"].includes(options.command)) {
    requireTaskOption(options, "id", "--id <task-id>");
  }
  if (options.command === "sync-git") {
    requireTaskOption(
      options,
      "expectedRevision",
      "--expected-revision <n>"
    );
  }
  if (options.command === "assess" && options.write) {
    requireTaskOption(
      options,
      "expectedRevision",
      "--expected-revision <n> when --write is used"
    );
  }
}

function output(value, compact) {
  process.stdout.write(`${JSON.stringify(value, null, compact ? 0 : 2)}\n`);
}

function createTask(projectRoot, input) {
  const createdAt = input.created_at ?? now();
  const candidate = normalizeParticipantIdentities({
    ...clone(input),
    schema_version: 1,
    revision: input.revision ?? 1,
    status: input.status ?? "ready",
    evidence: clone(input.evidence ?? []),
    created_at: createdAt,
    updated_at: input.updated_at ?? createdAt
  });
  const readiness = assertCreationReady(candidate);
  const task = validateTask(candidate);
  const filePath = taskFile(projectRoot, task.task_id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Task already exists: ${task.task_id}`);
  }
  saveTask(projectRoot, task);
  const event = taskEvent(task.task_id, "created", {
    status: task.status,
    objective: task.work.objective,
    task_standard_version: readiness.standard_version,
    ready: readiness.ready
  }, {
    next_revision: task.revision
  });
  appendEvent(projectRoot, event);
  return { task, event_ref: event.event_id };
}

function updateTask(projectRoot, input) {
  assertObject(input, "Task update");
  const next = normalizeParticipantIdentities(clone(input.task));
  const current = loadTask(projectRoot, next.task_id);
  if (input.expected_revision !== current.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${current.revision}`
    );
  }
  if (next.status !== current.status) {
    throw new Error(
      "Task update cannot change status; use the transition command"
    );
  }
  next.schema_version = 1;
  next.revision = current.revision + 1;
  next.created_at = current.created_at;
  next.updated_at = now();
  const readiness = taskReadiness(next);
  if (!readiness.status_compatible) {
    const error = new Error(
      `Task update is incompatible with status ${next.status}`
    );
    error.code = "task-not-ready";
    error.hint =
      "Keep the Task compatible with its current status or use an atomic transition.";
    error.details = readiness;
    throw error;
  }
  saveTask(projectRoot, next);
  const event = taskEvent(next.task_id, "updated", {}, {
    actor_id: input.actor_id,
    base_revision: current.revision,
    next_revision: next.revision
  });
  appendEvent(projectRoot, event);
  return { task: next, event_ref: event.event_id };
}

function applyAdapterPatch(projectRoot, input) {
  assertObject(input, "Task adapter patch");
  const patch = input.task_patch;
  assertObject(patch, "task_patch");
  const task = loadTask(projectRoot, input.task_id);
  if (
    patch.base_revision !== task.revision ||
    patch.next_revision !== task.revision + 1
  ) {
    throw new Error(
      `Task patch revision mismatch: stored ${task.revision}, patch ${patch.base_revision}->${patch.next_revision}`
    );
  }
  const priorStatus = task.status;
  if (
    patch.status !== priorStatus &&
    !TRANSITIONS[priorStatus]?.has(patch.status)
  ) {
    throw new Error(
      `invalid Task transition: ${priorStatus} -> ${patch.status}`
    );
  }
  task.revision = patch.next_revision;
  task.status = patch.status;
  if (patch.status === "blocked") {
    const existingOpen = (task.blockers ?? []).some(
      (blocker) => blocker.status === "open"
    );
    if (!existingOpen) {
      const decisions = input.response?.decisions_required ?? [];
      if (decisions.length === 0) {
        throw new Error(
          "A blocked Task patch requires an open blocker or L5 decision"
        );
      }
      const usedBlockerIds = new Set(
        (task.blockers ?? []).map((blocker) => blocker.id)
      );
      let decisionSequence = 1;
      task.blockers = [
        ...(task.blockers ?? []),
        ...decisions.map((decision) => {
          while (usedBlockerIds.has(`l5-decision-${decisionSequence}`)) {
            decisionSequence += 1;
          }
          const id = `l5-decision-${decisionSequence}`;
          usedBlockerIds.add(id);
          decisionSequence += 1;
          return {
            id,
            statement:
              decision.message ?? decision.question ?? decision.code,
            status: "open",
            resolution_condition:
              decision.required_authority
                ? `Decision supplied by ${decision.required_authority}.`
                : "Resolve the L5 decision and reassess the Task.",
            owner_role: decision.required_authority ?? "coordinator"
          };
        })
      ];
    }
  } else if (priorStatus === "blocked") {
    task.blockers = (task.blockers ?? []).map((blocker) =>
      blocker.status === "open" && blocker.id.startsWith("l5-decision-")
        ? { ...blocker, status: "resolved" }
        : blocker
    );
  }
  task.risk_assessment = clone(patch.risk_assessment);
  task.governance_snapshot = clone(patch.governance_snapshot);
  if (patch.runtime_snapshot == null) delete task.runtime_snapshot;
  else task.runtime_snapshot = clone(patch.runtime_snapshot);
  if (patch.continuation == null) delete task.continuation;
  else task.continuation = clone(patch.continuation);
  if (patch.status === "completed") {
    const assessment = completionAssessment(
      task,
      listReviews(projectRoot, task.task_id)
    );
    if (!["ready-to-complete", "complete"].includes(assessment.status)) {
      throw new Error(
        `Task cannot complete while assessment is ${assessment.status}`
      );
    }
  }
  if (["in-progress", "review", "blocked"].includes(patch.status)) {
    const readiness = taskReadiness(task);
    if (!readiness.status_compatible) {
      const error = new Error(
        `L5 patch is incompatible with Task status ${patch.status}`
      );
      error.code = "task-not-ready";
      error.hint =
        "Resolve Ready requirements or explicit blockers before applying the patch.";
      error.details = readiness;
      throw error;
    }
  }
  delete task.completion_assessment;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "updated",
    {
      source: "l5-task-adapter",
      status: task.status,
      invalidated_previous_runtime:
        patch.invalidates_previous_runtime === true
    },
    {
      actor_id: input.actor_id,
      base_revision: patch.base_revision,
      next_revision: patch.next_revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, event_ref: event.event_id };
}

function transitionTask(projectRoot, input) {
  assertObject(input, "Task transition");
  const task = loadTask(projectRoot, input.task_id);
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
    );
  }
  if (!TRANSITIONS[task.status]?.has(input.status)) {
    throw new Error(`invalid Task transition: ${task.status} -> ${input.status}`);
  }
  let addedBlocker = null;
  const resolvedBlockerIds = new Set(input.resolve_blocker_ids ?? []);
  if (input.status === "blocked" && input.blocker) {
    addedBlocker = clone(input.blocker);
    if ((task.blockers ?? []).some((blocker) => blocker.id === addedBlocker.id)) {
      throw new Error(`Task blocker already exists: ${addedBlocker.id}`);
    }
    task.blockers = [...(task.blockers ?? []), addedBlocker];
  }
  if (task.status === "blocked" && input.status !== "blocked") {
    task.blockers = (task.blockers ?? []).map((blocker) =>
      blocker.status === "open" && resolvedBlockerIds.has(blocker.id)
        ? { ...blocker, status: "resolved" }
        : blocker
    );
  }
  if (["ready", "in-progress", "review"].includes(input.status)) {
    const readiness = taskReadiness({ ...task, status: input.status });
    if (!readiness.status_compatible) {
      const error = new Error(
        `Task cannot transition to ${input.status} until it is ready`
      );
      error.code = "task-not-ready";
      error.hint = "Resolve missing Ready requirements and open blockers first.";
      error.details = readiness;
      throw error;
    }
  }
  if (input.status === "blocked") {
    const readiness = taskReadiness({ ...task, status: "blocked" });
    if (!readiness.status_compatible) {
      const error = new Error(
        "Task cannot transition to blocked without an open blocker"
      );
      error.code = "blocker-required";
      error.hint =
        "Add a blocker with status open and a resolution condition, then retry.";
      error.details = readiness;
      throw error;
    }
  }
  if (input.status === "completed") {
    const assessment = completionAssessment(
      task,
      listReviews(projectRoot, task.task_id)
    );
    if (!["ready-to-complete", "complete"].includes(assessment.status)) {
      throw new Error(
        `Task cannot complete while assessment is ${assessment.status}`
      );
    }
  }
  const priorStatus = task.status;
  task.status = input.status;
  task.revision += 1;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "transitioned",
    {
      from: priorStatus,
      to: task.status,
      reason: input.reason ?? null,
      blocker_added: addedBlocker?.id ?? null,
      blockers_resolved: [...resolvedBlockerIds]
    },
    {
      actor_id: input.actor_id,
      base_revision: task.revision - 1,
      next_revision: task.revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, event_ref: event.event_id };
}

function configureGitTracking(projectRoot, input) {
  const task = loadTask(projectRoot, input.task_id);
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
    );
  }
  const tracking = clone(input.tracking ?? {});
  const repository = resolveRepository(
    projectRoot,
    tracking.repository ?? "."
  );
  tracking.repository = path
    .relative(fs.realpathSync(projectRoot), repository)
    .split(path.sep)
    .join("/") || ".";
  tracking.base_commit =
    tracking.base_commit ??
    runGit(repository, ["rev-parse", "HEAD^{commit}"]).stdout;
  tracking.head_ref = tracking.head_ref ?? "HEAD";
  tracking.paths = tracking.paths ?? [];
  tracking.commit_refs = tracking.commit_refs ?? [];
  tracking.association_policy =
    tracking.association_policy ?? "trailer-or-explicit";
  tracking.max_commits = tracking.max_commits ?? 100;
  task.git_tracking = tracking;
  task.git_snapshot = undefined;
  task.revision += 1;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "git-tracking-configured",
    {
      base_commit: tracking.base_commit,
      paths: tracking.paths,
      association_policy: tracking.association_policy
    },
    {
      actor_id: input.actor_id,
      base_revision: task.revision - 1,
      next_revision: task.revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, event_ref: event.event_id };
}

function syncGit(projectRoot, taskId, expectedRevision) {
  const task = loadTask(projectRoot, taskId);
  if (expectedRevision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${expectedRevision}, stored ${task.revision}`
    );
  }
  const snapshot = scanGit(projectRoot, task);
  task.git_snapshot = snapshot;
  task.revision += 1;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "git-synced",
    {
      repository_head: snapshot.repository_head,
      confirmed_commits: snapshot.confirmed_commits.length,
      candidate_commits: snapshot.candidate_commits.length,
      changed_paths: snapshot.changed_paths.length,
      uncommitted_changes: snapshot.uncommitted_changes
    },
    {
      base_revision: task.revision - 1,
      next_revision: task.revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, snapshot, event_ref: event.event_id };
}

function recordReview(projectRoot, input) {
  assertObject(input, "Review recording");
  const review = validateReview(clone(input.review));
  const task = loadTask(projectRoot, review.task_id);
  if (!review.subject_snapshot) {
    throw new Error("New Review records must include a subject_snapshot");
  }
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
    );
  }
  if (review.subject_snapshot.task_revision !== task.revision) {
    throw new Error(
      `Review subject snapshot revision ${review.subject_snapshot.task_revision} does not match stored Task revision ${task.revision}`
    );
  }
  const filePath = reviewFile(projectRoot, review.review_id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Review already exists: ${review.review_id}`);
  }
  ensureLayout(projectRoot);
  writeJsonAtomic(filePath, review);
  task.review_refs = [...new Set([...(task.review_refs ?? []), review.review_id])];
  task.findings = [
    ...(task.findings ?? []).filter(
      (finding) => finding.review_ref !== review.review_id
    ),
    ...review.findings.map((finding) => ({
      id: `${review.review_id}-${finding.id}`,
      statement: finding.statement,
      status: finding.status,
      severity: finding.severity,
      ...(finding.priority ? { priority: finding.priority } : {}),
      blocking: finding.blocking,
      review_ref: review.review_id,
      evidence_refs: clone(finding.evidence_refs)
    }))
  ];
  task.revision += 1;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "review-recorded",
    {
      review_id: review.review_id,
      outcome: review.outcome,
      subject_snapshot: clone(review.subject_snapshot),
      findings: review.findings.length,
      blocking_findings: review.findings.filter((finding) => finding.blocking)
        .length
    },
    {
      actor_id: review.reviewer.subject_id,
      base_revision: task.revision - 1,
      next_revision: task.revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, review, event_ref: event.event_id };
}

function updateReview(projectRoot, input) {
  assertObject(input, "Review update");
  const review = validateReview(clone(input.review));
  const filePath = reviewFile(projectRoot, review.review_id);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Review does not exist: ${review.review_id}`);
  }
  const existing = validateReview(readJson(filePath));
  if (!review.subject_snapshot) {
    throw new Error("Review updates must include a current subject_snapshot");
  }
  if (existing.task_id !== review.task_id) {
    throw new Error("Review update cannot change task_id");
  }
  const task = loadTask(projectRoot, review.task_id);
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
    );
  }
  if (review.subject_snapshot.task_revision !== task.revision) {
    throw new Error(
      `Review subject snapshot revision ${review.subject_snapshot.task_revision} does not match stored Task revision ${task.revision}`
    );
  }
  writeJsonAtomic(filePath, review);
  task.findings = [
    ...(task.findings ?? []).filter(
      (finding) => finding.review_ref !== review.review_id
    ),
    ...review.findings.map((finding) => ({
      id: `${review.review_id}-${finding.id}`,
      statement: finding.statement,
      status: finding.status,
      severity: finding.severity,
      ...(finding.priority ? { priority: finding.priority } : {}),
      blocking: finding.blocking,
      review_ref: review.review_id,
      evidence_refs: clone(finding.evidence_refs)
    }))
  ];
  task.revision += 1;
  task.updated_at = now();
  saveTask(projectRoot, task);
  const event = taskEvent(
    task.task_id,
    "review-updated",
    {
      review_id: review.review_id,
      prior_outcome: existing.outcome,
      outcome: review.outcome,
      subject_snapshot: clone(review.subject_snapshot),
      open_findings: review.findings.filter((finding) =>
        OPEN_FINDING_STATUSES.has(finding.status)
      ).length
    },
    {
      actor_id: review.reviewer.subject_id,
      base_revision: task.revision - 1,
      next_revision: task.revision
    }
  );
  appendEvent(projectRoot, event);
  return { task, review, event_ref: event.event_id };
}

function validateUsageRecord(input) {
  assertObject(input, "Resource usage record");
  if (input.schema_version !== 1) {
    throw new Error("Resource usage schema_version must be 1");
  }
  assertId(input.usage_id, "Resource usage usage_id");
  assertId(input.task_id, "Resource usage task_id");
  if (
    !Number.isInteger(input.task_revision) ||
    input.task_revision < 1 ||
    !validDateTime(input.recorded_at)
  ) {
    throw new Error("Resource usage Task revision or recorded_at is invalid");
  }
  assertObject(input.resource_usage, "Resource usage measurement");
  const usage = input.resource_usage;
  if (
    !["exact", "unavailable"].includes(usage.measurement) ||
    !nonEmptyString(usage.source)
  ) {
    throw new Error("Resource usage measurement or source is invalid");
  }
  const tokenFields = [
    "input_tokens",
    "output_tokens",
    "tool_result_tokens",
    "total_tokens"
  ];
  if (usage.measurement === "exact") {
    if (
      tokenFields.some(
        (field) => !Number.isInteger(usage[field]) || usage[field] < 0
      ) ||
      usage.total_tokens !==
        usage.input_tokens + usage.output_tokens + usage.tool_result_tokens
    ) {
      throw new Error(
        "Exact resource usage requires non-negative token counts whose components equal total_tokens"
      );
    }
  } else if (tokenFields.some((field) => usage[field] != null)) {
    throw new Error(
      "Unavailable resource usage must not include estimated token counts"
    );
  }
  if (
    input.goal != null &&
    (input.goal.authorization !== "explicit-user" ||
      !Number.isInteger(input.goal.token_budget) ||
      input.goal.token_budget < 1 ||
      (input.goal.goal_id != null && !nonEmptyString(input.goal.goal_id)))
  ) {
    throw new Error("Resource usage Goal metadata is invalid");
  }
  return input;
}

function recordUsage(projectRoot, input) {
  const record = validateUsageRecord(clone(input));
  const task = loadTask(projectRoot, record.task_id);
  if (record.task_revision !== task.revision) {
    throw new Error(
      `Resource usage Task revision ${record.task_revision} does not match stored Task revision ${task.revision}`
    );
  }
  const existing = readEvents(
    projectRoot,
    new Date(0),
    new Date(8640000000000000)
  ).find(
    (event) =>
      event.type === "usage-recorded" &&
      event.data.usage_id === record.usage_id
  );
  if (existing) {
    throw new Error(`Resource usage already exists: ${record.usage_id}`);
  }
  const event = taskEvent(
    task.task_id,
    "usage-recorded",
    {
      usage_id: record.usage_id,
      task_revision: record.task_revision,
      resource_usage: clone(record.resource_usage),
      ...(record.goal ? { goal: clone(record.goal) } : {})
    },
    {
      actor_id: record.actor_id,
      occurred_at: record.recorded_at
    }
  );
  appendEvent(projectRoot, event);
  return {
    usage: record,
    task_revision: task.revision,
    event_ref: event.event_id
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(
      options.command
        ? taskCommandHelp(options.command)
        : taskGlobalHelp()
    );
    return;
  }
  if (!TASK_COMMANDS[options.command]) {
    throw new CliUsageError(
      "unknown-command",
      `Unknown Task command: ${options.command}`,
      "Run `node scripts/task.mjs --help` to list available commands."
    );
  }
  if (options.example) {
    const examplePath = TASK_COMMANDS[options.command].example;
    if (!examplePath) {
      throw new CliUsageError(
        "example-unavailable",
        `Command ${options.command} does not have a standalone input example.`,
        `Run \`node scripts/task.mjs ${options.command} --help\` for its options and related schema.`
      );
    }
    output(readJson(path.join(DEFAULT_ROOT, examplePath)), options.compact);
    return;
  }
  validateTaskOptions(options);
  const projectRoot = path.resolve(options.project);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new CliUsageError(
      "project-unavailable",
      `Project is not an available directory: ${options.project}`,
      "Pass an existing project root with --project <dir>."
    );
  }
  let result;
  if (options.command === "validate") {
    const input = readInput(options.input, options.command);
    result = taskReadiness({
      ...clone(input),
      status: input.status ?? "ready"
    });
  } else if (options.command === "create") {
    result = createTask(projectRoot, readInput(options.input, options.command));
  } else if (options.command === "show") {
    result = loadTask(projectRoot, options.id);
  } else if (options.command === "list") {
    result = listTasks(projectRoot)
      .filter((task) => !options.status || task.status === options.status)
      .filter((task) =>
        taskInScope(
          task,
          options.subject ? "person" : "team",
          options.subject,
          options.team
        )
      )
      .map((task) => ({
        task_id: task.task_id,
        revision: task.revision,
        status: task.status,
        objective: task.work.objective,
        updated_at: task.updated_at ?? null
      }));
  } else if (options.command === "update") {
    result = updateTask(projectRoot, readInput(options.input, options.command));
  } else if (options.command === "apply-patch") {
    result = applyAdapterPatch(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "transition") {
    result = transitionTask(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "track-git") {
    result = configureGitTracking(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "git-scan") {
    const task = loadTask(projectRoot, options.id);
    result = scanGit(projectRoot, task);
  } else if (options.command === "sync-git") {
    result = syncGit(projectRoot, options.id, options.expectedRevision);
  } else if (options.command === "record-review") {
    result = recordReview(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "update-review") {
    result = updateReview(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "record-usage") {
    result = recordUsage(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "assess") {
    const task = loadTask(projectRoot, options.id);
    const assessment = completionAssessment(
      task,
      listReviews(projectRoot, task.task_id)
    );
    if (options.write) {
      if (options.expectedRevision !== task.revision) {
        throw new Error(
          `Task revision mismatch: expected ${options.expectedRevision}, stored ${task.revision}`
        );
      }
      const baseRevision = task.revision;
      task.completion_assessment = assessment;
      task.revision += 1;
      task.updated_at = now();
      saveTask(projectRoot, task);
      const event = taskEvent(
        task.task_id,
        "completion-assessed",
        {
          status: assessment.status
        },
        {
          base_revision: baseRevision,
          next_revision: task.revision
        }
      );
      appendEvent(projectRoot, event);
      result = { assessment, task_revision: task.revision, event_ref: event.event_id };
    } else {
      result = assessment;
    }
  } else if (options.command === "report") {
    if (!["daily", "weekly"].includes(options.period)) {
      throw new CliUsageError(
        "invalid-option-value",
        "Report requires --period daily|weekly.",
        "Choose the reporting window and rerun the command."
      );
    }
    if (!["person", "team"].includes(options.scope)) {
      throw new CliUsageError(
        "invalid-option-value",
        "Report requires --scope person|team.",
        "Use person for one subject or team for a team-wide report."
      );
    }
    if (options.scope === "person" && !options.subject) {
      throw new CliUsageError(
        "missing-option",
        "A person report requires --subject <id>.",
        "Identify the person whose Task evidence should be included."
      );
    }
    result = buildReport(projectRoot, options);
    if (options.write) {
      const directory = path.join(
        ensureLayout(projectRoot).reports,
        options.period
      );
      fs.mkdirSync(directory, { recursive: true });
      const scopeId = options.subject ?? options.team ?? "team";
      const name = `${result.window.from.slice(0, 10)}-${scopeId}.json`;
      const locator = path
        .relative(projectRoot, path.join(directory, name))
        .split(path.sep)
        .join("/");
      writeJsonAtomic(path.join(directory, name), result);
      result = { report: result, locator };
    }
  } else if (options.command === "capability") {
    result = buildCapabilityReport(projectRoot, options);
  } else if (options.command === "feedback") {
    result = createFeedback(
      projectRoot,
      readInput(options.input, options.command)
    );
  } else if (options.command === "feedback-list") {
    result = listFeedback(projectRoot);
  } else {
    throw new Error(`unknown task command: ${options.command}`);
  }
  output(result, options.compact);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const command = process.argv[2]?.startsWith("-")
      ? null
      : process.argv[2] === "help"
        ? process.argv[3] ?? null
        : process.argv[2] ?? null;
    process.stderr.write(
      `${JSON.stringify(structuredCliError(error, command), null, 2)}\n`
    );
    process.exitCode = 1;
  });
}
