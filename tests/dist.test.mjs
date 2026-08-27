import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { buildSkill } from "../scripts/build.mjs";

const root = path.resolve(".");

function execute(script, args, options = {}) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: "utf8",
    ...options
  });
}

test("dist/skill is self-contained and preserves both installed CLIs", async (context) => {
  const built = await buildSkill();
  const artifact = built.artifact_root;
  assert.equal(fs.existsSync(path.join(artifact, "node_modules")), false);
  assert.equal(fs.existsSync(path.join(artifact, "scripts", "lib")), false);
  assert.deepEqual(
    fs.readdirSync(path.join(artifact, "scripts")).sort(),
    ["task.mjs", "zipzap.mjs"]
  );

  const validation = JSON.parse(
    execute(path.join(artifact, "scripts", "zipzap.mjs"), [
      "validate",
      "--compact"
    ])
  );
  assert.equal(validation.valid, true);

  const description = JSON.parse(
    execute(path.join(artifact, "scripts", "zipzap.mjs"), [
      "describe",
      "invoke",
      "--operation",
      "execute",
      "--compact"
    ])
  );
  assert.equal(description.command, "invoke");
  assert.equal(description.input_contract.schema, "schemas/l5-adapter-input.schema.json");

  const installParent = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-install-"));
  context.after(() => fs.rmSync(installParent, { recursive: true, force: true }));
  const target = path.join(installParent, "zipzap");
  const installed = JSON.parse(
    execute(path.join(root, "scripts", "install-local.mjs"), [
      "--skip-build",
      "--target",
      target
    ])
  );
  assert.equal(installed.installed_from, artifact);
  assert.equal(fs.existsSync(path.join(target, "scripts", "zipzap.mjs")), true);
  assert.equal(fs.existsSync(path.join(target, "node_modules")), false);
  assert.match(
    execute(path.join(target, "scripts", "task.mjs"), ["--help"]),
    /Task CLI/
  );
});
