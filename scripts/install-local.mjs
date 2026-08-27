#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { buildSkill } from "./build.mjs";

function safeTarget(target) {
  const resolved = path.resolve(target);
  const root = path.parse(resolved).root;
  if (resolved === root || resolved === os.homedir()) {
    throw new Error(`refusing unsafe installation target: ${resolved}`);
  }
  return resolved;
}

async function main() {
  const codexRoot = process.env.CODEX_HOME
    ? path.resolve(process.env.CODEX_HOME)
    : path.join(os.homedir(), ".codex");
  const program = new Command()
    .name("npm run install:local --")
    .description("Build and install only the dist/skill artifact.")
    .option("--target <dir>", "installation directory", path.join(codexRoot, "skills", "zipzap"))
    .option("--skip-build", "reuse the existing dist/skill artifact")
    .parse(process.argv);
  const options = program.opts();
  const buildResult = options.skipBuild
    ? {
        artifact_root: path.resolve("dist/skill"),
        bundled: true,
        runtime_package_install_required: false
      }
    : await buildSkill();
  const artifactRoot = path.resolve(buildResult.artifact_root);
  if (!fs.existsSync(path.join(artifactRoot, "SKILL.md"))) {
    throw new Error(`built Skill artifact is unavailable: ${artifactRoot}`);
  }

  const target = safeTarget(options.target);
  const parent = path.dirname(target);
  const staging = path.join(parent, `.${path.basename(target)}.staging-${process.pid}`);
  const backup = path.join(
    parent,
    `${path.basename(target)}.backup-${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}`
  );
  fs.mkdirSync(parent, { recursive: true });
  fs.rmSync(staging, { recursive: true, force: true });
  fs.cpSync(artifactRoot, staging, { recursive: true });
  let backupCreated = false;
  try {
    if (fs.existsSync(target)) {
      fs.renameSync(target, backup);
      backupCreated = true;
    }
    fs.renameSync(staging, target);
  } catch (error) {
    if (!fs.existsSync(target) && backupCreated) fs.renameSync(backup, target);
    throw error;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
  process.stdout.write(
    `${JSON.stringify({
      schema_version: 1,
      installed_from: artifactRoot,
      installed_to: target,
      backup: backupCreated ? backup : null,
      runtime_package_install_required: false
    }, null, 2)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
