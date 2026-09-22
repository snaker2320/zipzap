import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { buildSkill } from "../scripts/build.mjs";

test("dist Skill is self-contained and has one workflow CLI", async (context) => {
  const built = await buildSkill();
  const artifact = built.artifact_root;
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-optional-skill-"));
  context.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const installed = path.join(sandbox, "installed-skill");
  fs.cpSync(artifact, installed, { recursive: true });
  assert.equal(fs.existsSync(path.join(artifact, "node_modules")), false);
  assert.deepEqual(fs.readdirSync(path.join(artifact, "scripts")), ["zipzap.mjs"]);
  const skillInstructions = fs.readFileSync(path.join(artifact, "SKILL.md"), "utf8");
  assert.match(skillInstructions, /`scripts\/zipzap\.mjs`, relative to this `SKILL\.md`/);
  assert.match(skillInstructions, /do not require project `AGENTS\.md`/);
  const validation = JSON.parse(
    execFileSync(process.execPath, [path.join(artifact, "scripts", "zipzap.mjs"), "validate", "--compact"], { encoding: "utf8" })
  );
  assert.equal(validation.valid, true);
  const decisions = JSON.parse(
    execFileSync(
      process.execPath,
      [path.join(artifact, "scripts", "zipzap.mjs"), "decision-pages", "--input", path.resolve("examples", "zipzap", "decision-pages.yml"), "--compact"],
      { encoding: "utf8" }
    )
  );
  assert.equal(decisions.tool, "request_user_input_async");
  assert.equal(decisions.presentation, "native-form");
  assert.equal(decisions.must_pause, true);
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
  assert.equal(loop.gate.completion_allowed, false);
  assert.equal(loop.execution.owner.agent_id, "agent-owner");
  assert.deepEqual(loop.execution.required_checks, []);
  assert.equal(loop.progress.status, "running");

  const project = path.join(sandbox, "project");
  fs.mkdirSync(path.join(project, "handbook"), { recursive: true });
  const projectFiles = {
    "AGENTS.md": "Read handbook/api.md before API changes. Verify using node verify.mjs.\n",
    "handbook/api.md": "# API rules\nMust preserve the project entry and verification command.\n",
    "verify.mjs": "import assert from 'node:assert/strict'; import fs from 'node:fs'; assert.ok(fs.readFileSync('AGENTS.md', 'utf8').includes('handbook/api.md')); assert.ok(fs.existsSync('handbook/api.md'));\n"
  };
  for (const [locator, content] of Object.entries(projectFiles)) fs.writeFileSync(path.join(project, locator), content);
  const verifyProject = () => execFileSync(process.execPath, ["verify.mjs"], { cwd: project });
  verifyProject();
  const request = path.join(sandbox, "request.json");
  fs.writeFileSync(request, JSON.stringify({ schema_version: 1, project: { locator: project, standards: ["handbook"] }, context: { action: "implement" } }));
  const routed = JSON.parse(execFileSync(process.execPath, [path.join(installed, "scripts/zipzap.mjs"), "standards", "--input", request, "--action", "route", "--compact"], { cwd: project, encoding: "utf8" }));
  assert.deepEqual(routed.selected.map((item) => item.locator), ["handbook/api.md"]);
  assert.equal("workflow_complete" in routed, false);
  verifyProject();
  fs.rmSync(installed, { recursive: true });
  verifyProject();
  for (const [locator, content] of Object.entries(projectFiles)) assert.equal(fs.readFileSync(path.join(project, locator), "utf8"), content);
  assert.deepEqual(fs.readdirSync(project).sort(), ["AGENTS.md", "handbook", "verify.mjs"]);
});
