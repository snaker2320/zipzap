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
});
