import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

test("installer exposes standards choice as preview before project writes", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-installer-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const project = path.join(root, "project");
  const target = path.join(root, "installed", "zipzap");
  const artifact = path.join(root, "artifact");
  fs.mkdirSync(path.join(artifact, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(artifact, "SKILL.md"), "---\nname: zipzap\n---\n");
  fs.writeFileSync(path.join(artifact, "scripts", "zipzap.mjs"), "#!/usr/bin/env node\n");
  fs.mkdirSync(path.join(project, ".zipzap", "tasks"), { recursive: true });
  fs.writeFileSync(path.join(project, ".zipzap", "tasks", "old.json"), "{}\n");
  fs.writeFileSync(path.join(project, "package.json"), "{}\n");
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      [
        "scripts/install-local.mjs",
        "--artifact",
        artifact,
        "--target",
        target,
        "--project",
        project,
        "--standards",
        "auto"
      ],
      { cwd: path.resolve("."), encoding: "utf8" }
    )
  );
  assert.equal(output.project_migration.legacy.file_count, 1);
  assert.equal(output.project_migration.standards.strategy, "configure");
  assert.equal(output.project_migration.standards.requires_confirmation, true);
  assert.equal(fs.existsSync(path.join(project, "standards")), false);
  assert.equal(fs.existsSync(path.join(target, "scripts", "zipzap.mjs")), true);
});

test("installer records Host multi-Agent capability once in the user cache", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-capability-installer-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const target = path.join(root, "installed", "zipzap");
  const artifact = path.join(root, "artifact");
  const cacheRoot = path.join(root, "cache");
  fs.mkdirSync(path.join(artifact, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(artifact, "SKILL.md"), "---\nname: zipzap\n---\n");
  fs.writeFileSync(path.join(artifact, "scripts", "zipzap.mjs"), "#!/usr/bin/env node\n");

  const output = JSON.parse(execFileSync(process.execPath, [
    "scripts/install-local.mjs",
    "--artifact", artifact,
    "--target", target,
    "--cache-root", cacheRoot,
    "--host-multi-agent", "full",
    "--host-version", "test-host"
  ], { cwd: path.resolve("."), encoding: "utf8" }));

  const locator = path.join(cacheRoot, "host-capabilities.json");
  assert.equal(output.host_capabilities.locator, locator);
  assert.equal(output.host_capabilities.profile.host_version, "test-host");
  assert.deepEqual(output.host_capabilities.profile.multi_agent, {
    available: true,
    default_allowed: true,
    stable_identity: true,
    handoff_acknowledgement: true
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(locator, "utf8")), output.host_capabilities.profile);

  const preserved = JSON.parse(execFileSync(process.execPath, [
    "scripts/install-local.mjs",
    "--artifact", artifact,
    "--target", path.join(root, "installed-again", "zipzap"),
    "--cache-root", cacheRoot
  ], { cwd: path.resolve("."), encoding: "utf8" }));
  assert.deepEqual(preserved.host_capabilities.profile, output.host_capabilities.profile);
});
