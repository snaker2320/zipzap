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
  "backlog",
  "ready",
  "in-progress",
  "blocked",
  "review",
  "completed",
  "cancelled"
]);
const OPEN_FINDING_STATUSES = new Set(["open", "deferred"]);
const TRANSITIONS = {
  backlog: new Set(["ready", "cancelled"]),
  ready: new Set(["in-progress", "blocked", "cancelled"]),
  "in-progress": new Set(["blocked", "review", "completed", "cancelled"]),
  blocked: new Set(["ready", "in-progress", "cancelled"]),
  review: new Set(["in-progress", "blocked", "completed"]),
  completed: new Set(["in-progress"]),
  cancelled: new Set(["backlog"])
};
const TASK_COMMANDS = {
  create: {
    summary: "Create a local Task and its first event.",
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
  return `ZipZap local Task CLI

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
    directories.reports
  ]) {
    fs.mkdirSync(directory, { recursive: true });
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
  if (!task.work?.objective || !Array.isArray(task.evidence)) {
    throw new Error("Task requires work.objective and evidence");
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

function appendEvent(projectRoot, event) {
  const directories = ensureLayout(projectRoot);
  const month = event.occurred_at.slice(0, 7);
  fs.appendFileSync(
    path.join(directories.events, `${month}.jsonl`),
    `${JSON.stringify(event)}\n`
  );
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
  const events = [];
  for (const name of fs.readdirSync(directory).filter((item) =>
    item.endsWith(".jsonl")
  )) {
    const lines = fs
      .readFileSync(path.join(directory, name), "utf8")
      .split(/\r?\n/)
      .filter(Boolean);
    for (const line of lines) {
      const event = JSON.parse(line);
      const timestamp = Date.parse(event.occurred_at);
      if (timestamp >= from.getTime() && timestamp <= to.getTime()) {
        events.push(event);
      }
    }
  }
  return events.sort((left, right) =>
    left.occurred_at.localeCompare(right.occurred_at)
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
    (_criterion, index) => `criterion-${index + 1}`
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
  return {
    derived: true,
    task_revision: task.revision,
    status,
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
  const summaries = selected.map((task) =>
    taskSummary(task, listReviews(projectRoot, task.task_id))
  );
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
  const task = validateTask(normalizeParticipantIdentities({
    ...clone(input),
    schema_version: 1,
    revision: input.revision ?? 1,
    status: input.status ?? "backlog",
    evidence: clone(input.evidence ?? []),
    created_at: createdAt,
    updated_at: input.updated_at ?? createdAt
  }));
  const filePath = taskFile(projectRoot, task.task_id);
  if (fs.existsSync(filePath)) {
    throw new Error(`Task already exists: ${task.task_id}`);
  }
  saveTask(projectRoot, task);
  const event = taskEvent(task.task_id, "created", {
    status: task.status,
    objective: task.work.objective
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
  next.schema_version = 1;
  next.revision = current.revision + 1;
  next.created_at = current.created_at;
  next.updated_at = now();
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
  task.revision = patch.next_revision;
  task.status = patch.status;
  task.risk_assessment = clone(patch.risk_assessment);
  task.governance_snapshot = clone(patch.governance_snapshot);
  if (patch.runtime_snapshot == null) delete task.runtime_snapshot;
  else task.runtime_snapshot = clone(patch.runtime_snapshot);
  if (patch.continuation == null) delete task.continuation;
  else task.continuation = clone(patch.continuation);
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
      reason: input.reason ?? null
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
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
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
  if (existing.task_id !== review.task_id) {
    throw new Error("Review update cannot change task_id");
  }
  const task = loadTask(projectRoot, review.task_id);
  if (input.expected_revision !== task.revision) {
    throw new Error(
      `Task revision mismatch: expected ${input.expected_revision}, stored ${task.revision}`
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
  if (options.command === "create") {
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
