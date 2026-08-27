import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";
import test from "node:test";

import { validateSchemaFile } from "../scripts/lib/schema-registry.mjs";

const root = path.resolve(".");
const taskScript = path.join(root, "scripts", "task.mjs");

function run(args, options = {}) {
  return execFileSync(process.execPath, [taskScript, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options
  });
}

function minimalTask(taskId) {
  return {
    task_id: taskId,
    work: {
      objective: "Expose live Task state.",
      scope: ["Task progress stream"],
      acceptance_criteria: [
        {
          id: "stream-visible",
          statement: "State changes are emitted as JSON Lines."
        }
      ]
    }
  };
}

test("watch emits schema-valid initial and terminal progress events", async (context) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-watch-"));
  context.after(() => fs.rmSync(project, { recursive: true, force: true }));
  run(["create", "--project", project, "--compact"], {
    input: JSON.stringify(minimalTask("watch-task"))
  });

  const child = spawn(
    process.execPath,
    [
      taskScript,
      "watch",
      "--project",
      project,
      "--id",
      "watch-task",
      "--interval-ms",
      "100",
      "--heartbeat-ms",
      "0"
    ],
    { cwd: root, encoding: "utf8" }
  );
  const events = [];
  let buffer = "";
  let transitioned = false;
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) events.push(JSON.parse(line));
      if (!transitioned && events.length === 1) {
        transitioned = true;
        run(["transition", "--project", project, "--compact"], {
          input: JSON.stringify({
            task_id: "watch-task",
            expected_revision: 1,
            status: "cancelled",
            actor_id: "test"
          })
        });
      }
      newline = buffer.indexOf("\n");
    }
  });

  const exitCode = await Promise.race([
    new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    }),
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("watch did not terminate")), 5000)
    )
  ]);
  assert.equal(exitCode, 0);
  assert.equal(events.length, 2);
  assert.equal(events[0].change, "initial");
  assert.equal(events[0].status, "ready");
  assert.equal(events[1].change, "terminal");
  assert.equal(events[1].status, "cancelled");
  assert.equal(events[1].revision, 2);
  for (const event of events) {
    assert.equal(
      validateSchemaFile(root, "schemas/task-progress.schema.json", event).valid,
      true
    );
  }
});
