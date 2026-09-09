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
    verification: [{ command: "npm test", status: "passed" }]
  });
  fs.writeFileSync(path.join(root, "message.txt"), prepared.commit_message);
  git(root, "commit", "--amend", "-qF", "message.txt");
  fs.unlinkSync(path.join(root, "message.txt"));
  const inspected = inspectGitHandoff({ project: { locator: root } });
  assert.equal(inspected.commits.length, 2);
  assert.deepEqual(inspected.files.map((item) => item.path).sort(), ["one.txt", "two.txt"]);
  assert.equal(inspected.verification[0].status, "passed");
});
