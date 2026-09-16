import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { buildSkill } from "../scripts/build.mjs";

test("dist Skill is self-contained and has one workflow CLI", async () => {
  const built = await buildSkill();
  const artifact = built.artifact_root;
  assert.equal(fs.existsSync(path.join(artifact, "node_modules")), false);
  assert.deepEqual(fs.readdirSync(path.join(artifact, "scripts")), ["zipzap.mjs"]);
  const validation = JSON.parse(
    execFileSync(process.execPath, [path.join(artifact, "scripts", "zipzap.mjs"), "validate", "--compact"], { encoding: "utf8" })
  );
  assert.equal(validation.valid, true);
  assert.equal(fs.existsSync(path.join(artifact, "config", "workflow.yml")), true);
  assert.equal(fs.existsSync(path.join(artifact, "config", "delivery.yml")), true);
  assert.equal(fs.existsSync(path.join(artifact, "config", "teams.yml")), false);
  const plan = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(artifact, "scripts", "zipzap.mjs"), "delivery", "--action", "plan", "--input", path.resolve("examples", "zipzap", "delivery.yml"), "--compact"],
      { encoding: "utf8" }
    )
  );
  assert.equal(plan.allowed, true);
  const loop = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(artifact, "scripts", "zipzap.mjs"), "loop", "--input", path.resolve("examples", "zipzap", "loop.yml"), "--compact"],
      { encoding: "utf8" }
    )
  );
  assert.equal(loop.gate.execution_allowed, true);
  assert.equal(loop.gate.completion_allowed, true);
  assert.deepEqual(loop.agents.activate_or_reuse, [{ role: "tester", reuse_key: "example-work:tester" }]);
});
