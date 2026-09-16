import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { inspectGitHandoff, prepareGitHandoff } from "../scripts/lib/git-handoff.mjs";

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

test("handoff preparation rejects an empty commit range", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-handoff-empty-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "zipzap@example.test");
  git(root, "config", "user.name", "ZipZap Test");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  assert.throws(() => prepareGitHandoff({
    project: { locator: root },
    base,
    status: "complete",
    summary: "empty range"
  }), /Git Handoff range contains no commits/);
});

test("final structured commit describes the full multi-commit handoff range", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-handoff-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "zipzap@example.test");
  git(root, "config", "user.name", "ZipZap Test");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "one.txt"), "one\n");
  git(root, "add", "one.txt");
  git(root, "commit", "-qm", "feat: one");
  fs.writeFileSync(path.join(root, "two.txt"), "two\n");
  git(root, "add", "two.txt");
  git(root, "commit", "-qm", "feat: two");
  const prepared = prepareGitHandoff({
    project: { locator: root },
    base,
    status: "complete",
    summary: "Two coherent commits",
    verification: [{ command: "npm test", status: "passed" }],
    issues: [{ severity: "low", title: "Legacy issue" }]
  });
  fs.writeFileSync(path.join(root, "message.txt"), prepared.commit_message);
  git(root, "commit", "--amend", "-qF", "message.txt");
  fs.unlinkSync(path.join(root, "message.txt"));
  const inspected = inspectGitHandoff({ project: { locator: root } });
  assert.equal(inspected.commits.length, 2);
  assert.deepEqual(inspected.files.map((item) => item.path).sort(), ["one.txt", "two.txt"]);
  assert.equal(inspected.verification[0].status, "passed");
  assert.deepEqual(inspected.issues, [{ severity: "low", title: "Legacy issue" }]);
});

test("structured issue trailers preserve feedback identity and closure state", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-handoff-issue-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "zipzap@example.test");
  git(root, "config", "user.name", "ZipZap Test");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "fix.txt"), "fix\n");
  git(root, "add", "fix.txt");
  git(root, "commit", "-qm", "fix: probe");
  const issue = {
    severity: "medium",
    title: "Deployment probe failed",
    fingerprint: "delivery:deploy.probe:evidence-failed",
    checkpoint: "checkpoint-a",
    status: "closed",
    return_to: "deploy",
    verification_ref: "host:probe-rerun"
  };
  const prepared = prepareGitHandoff({
    project: { locator: root },
    base,
    status: "complete",
    summary: "Probe fixed and reverified",
    issues: [issue]
  });
  assert.match(
    prepared.commit_message,
    /ZipZap-Issue: 2 \| medium \| closed \| deploy \| delivery:deploy\.probe:evidence-failed \| host:probe-rerun \| Deployment probe failed/
  );
  fs.writeFileSync(path.join(root, "message.txt"), prepared.commit_message);
  git(root, "commit", "--amend", "-qF", "message.txt");
  fs.unlinkSync(path.join(root, "message.txt"));
  const inspected = inspectGitHandoff({ project: { locator: root } });
  assert.deepEqual(inspected.issues, [{ ...issue, checkpoint: inspected.head }]);
});

test("legacy structured issue trailers remain readable and map old stages", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-handoff-legacy-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  git(root, "init", "-q");
  git(root, "config", "user.email", "zipzap@example.test");
  git(root, "config", "user.name", "ZipZap Test");
  fs.writeFileSync(path.join(root, "base.txt"), "base\n");
  git(root, "add", "base.txt");
  git(root, "commit", "-qm", "base");
  const base = git(root, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(root, "change.txt"), "change\n");
  git(root, "add", "change.txt");
  const message = [
    "legacy handoff",
    "",
    "ZipZap-Handoff: 1",
    `ZipZap-Base: ${base}`,
    "ZipZap-Status: partial",
    "ZipZap-Summary: legacy issue",
    "ZipZap-Issue: 1 | medium | open | build | legacy-build | - | Build failed"
  ].join("\n");
  fs.writeFileSync(path.join(root, "message.txt"), `${message}\n`);
  git(root, "commit", "-qF", "message.txt");
  fs.unlinkSync(path.join(root, "message.txt"));
  const inspected = inspectGitHandoff({ project: { locator: root } });
  assert.equal(inspected.issues[0].return_to, "implement");
});
