import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const zipzapScript = path.join(root, "scripts", "zipzap.mjs");
const taskScript = path.join(root, "scripts", "task.mjs");

function run(script, args, input) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    input
  });
}

function errorOutput(result) {
  assert.notEqual(result.status, 0, "command unexpectedly succeeded");
  return JSON.parse(result.stderr);
}

test("ZipZap CLI exposes global and command help without input", () => {
  const global = run(zipzapScript, ["--help"]);
  assert.equal(global.status, 0);
  assert.match(global.stdout, /ZipZap collaboration CLI/);
  assert.match(global.stdout, /invoke\s+Invoke the stable L5/);

  const command = run(zipzapScript, ["invoke", "--help"]);
  assert.equal(command.status, 0);
  assert.match(command.stdout, /schemas\/l5-adapter-input\.schema\.json/);
  assert.match(command.stdout, /invoke --example/);
});

test("Task CLI exposes global and command help without a project", () => {
  const global = run(taskScript, ["--help"]);
  assert.equal(global.status, 0);
  assert.match(global.stdout, /ZipZap project Task CLI/);
  assert.match(global.stdout, /record-review\s+Record Review evidence/);

  const command = run(taskScript, ["create", "--help"]);
  assert.equal(command.status, 0);
  assert.match(command.stdout, /schemas\/task\.schema\.json/);
  assert.match(command.stdout, /create --example/);
});

test("CLI examples are valid JSON and representative inputs execute", (context) => {
  const invokeExample = run(zipzapScript, ["invoke", "--example", "--compact"]);
  assert.equal(invokeExample.status, 0);
  const invocation = JSON.parse(invokeExample.stdout);
  assert.equal(invocation.request.operation, "execute");

  const invoked = run(
    zipzapScript,
    ["invoke", "--compact"],
    JSON.stringify(invocation)
  );
  assert.equal(invoked.status, 0, invoked.stderr);
  const invokedOutput = JSON.parse(invoked.stdout);
  assert.equal(invokedOutput.status, "ready");
  assert.equal(invokedOutput.collaboration_view.selection.effective, "solo");
  assert.match(invokedOutput.execution_stamp, /^solo/);

  const compiled = run(
    zipzapScript,
    ["compile", "--compact"],
    JSON.stringify(invocation)
  );
  assert.equal(compiled.status, 0, compiled.stderr);
  assert.equal(JSON.parse(compiled.stdout).response.status, "ready");

  const completionExample = run(
    zipzapScript,
    ["complete", "--example", "--compact"]
  );
  assert.equal(completionExample.status, 0);
  const completed = run(
    zipzapScript,
    ["complete", "--compact"],
    completionExample.stdout
  );
  assert.equal(completed.status, 0, completed.stderr);
  assert.equal(JSON.parse(completed.stdout).completion_label, "tested");

  const handoffExample = run(
    zipzapScript,
    ["handoff", "--example", "--compact"]
  );
  assert.equal(handoffExample.status, 0);
  const handedOff = run(
    zipzapScript,
    ["handoff", "--compact"],
    handoffExample.stdout
  );
  assert.equal(handedOff.status, 0, handedOff.stderr);
  assert.equal(JSON.parse(handedOff.stdout).persistence, "ephemeral");

  const diagnosticExample = run(
    zipzapScript,
    ["normalize-risk", "--example", "--compact"]
  );
  assert.equal(diagnosticExample.status, 0);
  const diagnosticInput = JSON.parse(diagnosticExample.stdout);
  const diagnostic = run(
    zipzapScript,
    ["normalize-risk", "--compact"],
    JSON.stringify(diagnosticInput)
  );
  assert.equal(diagnostic.status, 0, diagnostic.stderr);
  assert.equal(
    JSON.parse(diagnostic.stdout).derived_governance.execution_profile,
    "design-diagnostic"
  );

  const taskExample = run(taskScript, ["create", "--example", "--compact"]);
  assert.equal(taskExample.status, 0);
  const taskInput = JSON.parse(taskExample.stdout);
  assert.equal(taskInput.task_id, "example-task");

  const project = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cli-example-"));
  context.after(() => fs.rmSync(project, { recursive: true, force: true }));
  const created = run(
    taskScript,
    ["create", "--project", project, "--compact"],
    JSON.stringify(taskInput)
  );
  assert.equal(created.status, 0, created.stderr);
  assert.equal(JSON.parse(created.stdout).task.task_id, "example-task");

  const feedbackExample = run(
    taskScript,
    ["feedback", "--example", "--compact"]
  );
  assert.equal(feedbackExample.status, 0);
  const feedbackInput = JSON.parse(feedbackExample.stdout);
  const captured = run(
    taskScript,
    ["feedback", "--project", project, "--compact"],
    JSON.stringify(feedbackInput)
  );
  assert.equal(captured.status, 0, captured.stderr);
  assert.equal(
    JSON.parse(captured.stdout).feedback.feedback_id,
    "task-flow-too-verbose"
  );
});

test("CLI input failures provide structured corrective guidance", () => {
  const invalidJson = errorOutput(
    run(zipzapScript, ["evaluate"], "{not-json")
  );
  assert.equal(invalidJson.ok, false);
  assert.equal(invalidJson.error.code, "invalid-json");
  assert.match(invalidJson.error.hint, /--example/);
  assert.equal(
    invalidJson.error.help,
    "node scripts/zipzap.mjs evaluate --help"
  );

  const missingTaskId = errorOutput(run(taskScript, ["show"]));
  assert.equal(missingTaskId.error.code, "missing-option");
  assert.match(missingTaskId.error.message, /--id/);
  assert.equal(
    missingTaskId.error.help,
    "node scripts/task.mjs show --help"
  );
});

test("unknown commands and missing option values identify the help path", () => {
  const unknown = errorOutput(run(zipzapScript, ["evalute"]));
  assert.equal(unknown.error.code, "unknown-command");
  assert.equal(unknown.error.help, "node scripts/zipzap.mjs --help");

  const missingValue = errorOutput(run(taskScript, ["show", "--id"]));
  assert.equal(missingValue.error.code, "missing-option-value");
  assert.equal(missingValue.error.help, "node scripts/task.mjs show --help");
});
