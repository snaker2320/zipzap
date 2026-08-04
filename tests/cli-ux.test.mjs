import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const zipzapScript = path.join(root, "scripts", "zipzap.mjs");
const taskScript = path.join(root, "scripts", "task.mjs");
const demandScript = path.join(root, "scripts", "demand.mjs");

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

test("Demand CLI exposes lightweight capture and phase-plan help", () => {
  const global = run(demandScript, ["--help"]);
  assert.equal(global.status, 0);
  assert.match(global.stdout, /lightweight Demand and phase-plan CLI/);
  assert.match(global.stdout, /promote\s+Promote a triaged or planned Demand/);

  const command = run(demandScript, ["create", "--help"]);
  assert.equal(command.status, 0);
  assert.match(command.stdout, /schemas\/demand\.schema\.json/);
  assert.match(command.stdout, /create --example/);

  const capture = run(demandScript, ["capture", "--help"]);
  assert.equal(capture.status, 0);
  assert.match(capture.stdout, /schemas\/capture-suggestion-input\.schema\.json/);
  assert.match(capture.stdout, /capture --example/);
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

  const receiptExample = run(
    zipzapScript,
    ["receipt", "--example", "--compact"]
  );
  assert.equal(receiptExample.status, 0);
  const receipt = run(
    zipzapScript,
    ["receipt", "--compact"],
    receiptExample.stdout
  );
  assert.equal(receipt.status, 0, receipt.stderr);
  assert.equal(JSON.parse(receipt.stdout).template_id, "compact-primary");

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

  const demandExample = run(
    demandScript,
    ["create", "--example", "--compact"]
  );
  assert.equal(demandExample.status, 0);
  const demandInput = JSON.parse(demandExample.stdout);
  assert.equal(demandInput.type, "technical-debt");
  const demandProject = fs.mkdtempSync(
    path.join(os.tmpdir(), "zipzap-demand-example-")
  );
  context.after(() =>
    fs.rmSync(demandProject, { recursive: true, force: true })
  );
  const demandCreated = run(
    demandScript,
    ["create", "--project", demandProject, "--compact"],
    JSON.stringify(demandInput)
  );
  assert.equal(demandCreated.status, 0, demandCreated.stderr);
  assert.equal(
    JSON.parse(demandCreated.stdout).demand.demand_id,
    "example-demand"
  );

  const captureExample = run(
    demandScript,
    ["capture", "--example", "--compact"]
  );
  assert.equal(captureExample.status, 0);
  const captureInput = JSON.parse(captureExample.stdout);
  assert.equal(captureInput.operation, "start");
  const captureStarted = run(
    demandScript,
    ["capture", "--project", demandProject, "--compact"],
    JSON.stringify(captureInput)
  );
  assert.equal(captureStarted.status, 0, captureStarted.stderr);
  assert.equal(JSON.parse(captureStarted.stdout).status, "decision-required");
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

  const missingPlanId = errorOutput(run(demandScript, ["plan-assess"]));
  assert.equal(missingPlanId.error.code, "missing-option");
  assert.equal(
    missingPlanId.error.help,
    "node scripts/demand.mjs plan-assess --help"
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
