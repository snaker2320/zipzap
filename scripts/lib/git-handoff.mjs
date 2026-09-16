import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SHA_PATTERN = /^[a-f0-9]{40}$/;
const ISSUE_STATUSES = new Set(["open", "resolved", "closed"]);
const RETURN_TARGETS = new Set(["direct", "plan", "design", "implement", "verify", "deploy", "maintain"]);

function git(projectRoot, args, options = {}) {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: options.buffer ? null : "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    const message = error.stderr?.toString().trim() || error.message;
    throw new Error(`git ${args.join(" ")} failed: ${message}`);
  }
}

function resolveCommit(projectRoot, revision) {
  const sha = git(projectRoot, ["rev-parse", "--verify", `${revision}^{commit}`]).trim();
  if (!SHA_PATTERN.test(sha)) throw new Error(`invalid Git commit: ${revision}`);
  return sha;
}

function assertAncestor(projectRoot, base, head) {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", base, head], {
    cwd: projectRoot,
    stdio: "ignore"
  });
  if (result.status !== 0) throw new Error(`handoff base is not an ancestor of head: ${base}..${head}`);
}

function trailers(message) {
  const result = new Map();
  for (const line of message.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9-]+):\s*(.+)$/);
    if (!match || !match[1].startsWith("ZipZap-")) continue;
    if (!result.has(match[1])) result.set(match[1], []);
    result.get(match[1]).push(match[2].trim());
  }
  return result;
}

function one(metadata, key, required = true) {
  const values = metadata.get(key) ?? [];
  if (required && values.length !== 1) throw new Error(`handoff requires exactly one ${key} trailer`);
  if (values.length > 1) throw new Error(`handoff allows only one ${key} trailer`);
  return values[0] ?? null;
}

function changedFiles(projectRoot, base, head) {
  const values = git(projectRoot, ["diff", "--name-status", "-z", base, head], { buffer: true })
    .toString("utf8")
    .split("\0")
    .filter(Boolean);
  const files = [];
  for (let index = 0; index < values.length;) {
    const status = values[index++];
    if (status.startsWith("R") || status.startsWith("C")) {
      files.push({ status, from: values[index++], path: values[index++] });
    } else {
      files.push({ status, path: values[index++] });
    }
  }
  return files;
}

function commits(projectRoot, base, head) {
  const shas = git(projectRoot, ["rev-list", "--reverse", `${base}..${head}`]).trim().split("\n").filter(Boolean);
  return shas.map((sha) => ({
    sha,
    subject: git(projectRoot, ["show", "-s", "--format=%s", sha]).trim()
  }));
}

function parseVerification(value) {
  const split = value.lastIndexOf(" => ");
  if (split < 1) throw new Error(`invalid ZipZap-Verify trailer: ${value}`);
  const status = value.slice(split + 4);
  if (!["passed", "failed", "not-run"].includes(status)) {
    throw new Error(`invalid verification status: ${status}`);
  }
  return { command: value.slice(0, split), status };
}

function parseIssue(value, checkpoint = null) {
  const fields = value.split(/\s+\|\s+/);
  if (fields[0] === "1") {
    if (fields.length < 7) throw new Error(`invalid structured ZipZap-Issue trailer: ${value}`);
    const [, severity, status, legacyStage, fingerprint, verification, ...titleParts] = fields;
    const legacyTargets = { build: "implement", test: "verify" };
    const returnTo = legacyTargets[legacyStage] ?? legacyStage;
    const title = titleParts.join(" | ");
    if (
      !["low", "medium", "high"].includes(severity) ||
      !ISSUE_STATUSES.has(status) ||
      !RETURN_TARGETS.has(returnTo) ||
      !fingerprint ||
      fingerprint === "-" ||
      !title
    ) {
      throw new Error(`invalid structured ZipZap-Issue trailer: ${value}`);
    }
    const verificationRef = verification === "-" ? null : verification;
    if (status === "closed" && !verificationRef) {
      throw new Error(`closed ZipZap-Issue requires verification_ref: ${fingerprint}`);
    }
    return {
      severity,
      title,
      fingerprint,
      ...(checkpoint ? { checkpoint } : {}),
      status,
      return_to: returnTo,
      ...(verificationRef ? { verification_ref: verificationRef } : {})
    };
  }
  if (fields[0] === "2") {
    if (fields.length < 7) throw new Error(`invalid structured ZipZap-Issue trailer: ${value}`);
    const [version, severity, status, returnTo, fingerprint, verification, ...titleParts] = fields;
    const title = titleParts.join(" | ");
    if (
      version !== "2" ||
      !["low", "medium", "high"].includes(severity) ||
      !ISSUE_STATUSES.has(status) ||
      !RETURN_TARGETS.has(returnTo) ||
      !fingerprint ||
      fingerprint === "-" ||
      !title
    ) {
      throw new Error(`invalid structured ZipZap-Issue trailer: ${value}`);
    }
    const verificationRef = verification === "-" ? null : verification;
    if (status === "closed" && !verificationRef) {
      throw new Error(`closed ZipZap-Issue requires verification_ref: ${fingerprint}`);
    }
    return {
      severity,
      title,
      fingerprint,
      ...(checkpoint ? { checkpoint } : {}),
      status,
      return_to: returnTo,
      ...(verificationRef ? { verification_ref: verificationRef } : {})
    };
  }
  const match = value.match(/^(low|medium|high)\s+\|\s+(.+)$/);
  if (!match) throw new Error(`invalid ZipZap-Issue trailer: ${value}`);
  return { severity: match[1], title: match[2] };
}

function formatIssue(issue) {
  const richFields = [
    "fingerprint",
    "status",
    "return_to",
    "verification_ref"
  ];
  const structured = richFields.some((key) => issue[key] !== undefined);
  if (structured) {
    for (const key of ["fingerprint", "status", "return_to"]) {
      if (!issue[key]) throw new Error(`structured ZipZap-Issue requires ${key}`);
    }
    for (const [key, field] of [
      ["fingerprint", issue.fingerprint],
      ["verification_ref", issue.verification_ref]
    ]) {
      if (field?.includes("|")) throw new Error(`ZipZap-Issue ${key} cannot contain |`);
    }
  }
  const value = structured
    ? [
        "2",
        issue.severity,
        issue.status,
        issue.return_to,
        issue.fingerprint,
        issue.verification_ref ?? "-",
        issue.title
      ].join(" | ")
    : `${issue.severity} | ${issue.title}`;
  parseIssue(value);
  return value;
}

export function inspectGitHandoff(input) {
  const projectRoot = path.resolve(input.project?.locator ?? "");
  if (!input.project?.locator || !fs.existsSync(path.join(projectRoot, ".git"))) {
    throw new Error("Git Handoff requires a Git project locator");
  }
  const head = resolveCommit(projectRoot, input.head ?? "HEAD");
  const message = git(projectRoot, ["show", "-s", "--format=%B", head]);
  const metadata = trailers(message);
  if (one(metadata, "ZipZap-Handoff") !== "1") throw new Error("unsupported ZipZap-Handoff version");
  const base = resolveCommit(projectRoot, one(metadata, "ZipZap-Base"));
  assertAncestor(projectRoot, base, head);
  const status = one(metadata, "ZipZap-Status");
  if (!["complete", "partial", "blocked"].includes(status)) throw new Error(`invalid ZipZap-Status: ${status}`);
  const rangeCommits = commits(projectRoot, base, head);
  if (!rangeCommits.length) throw new Error("Git Handoff range contains no commits");
  return {
    schema_version: 1,
    source: "git-checkpoint",
    range: `${base}..${head}`,
    base,
    head,
    handoff_commit: head,
    status,
    summary: one(metadata, "ZipZap-Summary"),
    commits: rangeCommits,
    files: changedFiles(projectRoot, base, head),
    verification: (metadata.get("ZipZap-Verify") ?? []).map(parseVerification),
    issues: (metadata.get("ZipZap-Issue") ?? []).map((value) => parseIssue(value, head)),
    standards: metadata.get("ZipZap-Standard") ?? [],
    receiver_checks: {
      head_available: true,
      base_is_ancestor: true,
      worktree_clean: git(projectRoot, ["status", "--porcelain"]).trim() === ""
    }
  };
}

export function prepareGitHandoff(input) {
  const projectRoot = path.resolve(input.project?.locator ?? "");
  const base = resolveCommit(projectRoot, input.base);
  const head = resolveCommit(projectRoot, input.head ?? "HEAD");
  assertAncestor(projectRoot, base, head);
  const rangeCommits = commits(projectRoot, base, head);
  if (!rangeCommits.length) throw new Error("Git Handoff range contains no commits");
  const status = input.status ?? "partial";
  if (!["complete", "partial", "blocked"].includes(status)) throw new Error(`invalid handoff status: ${status}`);
  const lines = [
    input.subject ?? "chore(handoff): record Git checkpoint",
    "",
    `ZipZap-Handoff: 1`,
    `ZipZap-Base: ${base}`,
    `ZipZap-Status: ${status}`,
    `ZipZap-Summary: ${input.summary}`
  ];
  for (const verification of input.verification ?? []) {
    lines.push(`ZipZap-Verify: ${verification.command} => ${verification.status}`);
  }
  for (const issue of input.issues ?? []) {
    lines.push(`ZipZap-Issue: ${formatIssue(issue)}`);
  }
  for (const standard of input.standards ?? []) lines.push(`ZipZap-Standard: ${standard}`);
  return {
    schema_version: 1,
    source: "git-checkpoint",
    range: `${base}..${head}`,
    base,
    head,
    commits: rangeCommits,
    files: changedFiles(projectRoot, base, head),
    commit_message: `${lines.join("\n")}\n`,
    preprocessing_required: true,
    instruction: "将此结构化信息放入最终有效提交；如之后新增提交，重新生成并 amend 最终提交。"
  };
}
