#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { Command } from "commander";

import { buildSkill } from "./build.mjs";
import {
  applyLegacyCleanup,
  previewLegacyCleanup
} from "./lib/legacy-cleanup.mjs";
import {
  applyStandardsInitialization,
  planStandardsInitialization
} from "./lib/standards.mjs";
import { readHostCapabilities, writeHostCapabilities } from "./lib/host-capabilities.mjs";

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
    .option("--artifact <dir>", "explicit prebuilt Skill artifact")
    .option("--cache-root <dir>", "ZipZap user-cache root")
    .option("--host-multi-agent <mode>", "Host capability: full, disabled, unavailable, or unknown")
    .option("--host-version <version>", "Host version recorded with capability detection")
    .option("--project <dir>", "project to inspect for standards initialization")
    .option(
      "--standards <mode>",
      "standards mode: auto, skip, configure, reorganize, or rebuild",
      "auto"
    )
    .option(
      "--standards-confirm <fingerprint>",
      "apply the selected standards preview with its exact fingerprint"
    )
    .option(
      "--legacy-confirm <fingerprint>",
      "delete obsolete project .zipzap state with its exact fingerprint"
    )
    .parse(process.argv);
  const options = program.opts();
  const hostModes = new Set(["full", "disabled", "unavailable", "unknown"]);
  if (options.hostMultiAgent && !hostModes.has(options.hostMultiAgent)) {
    throw new Error(`unsupported Host multi-Agent mode: ${options.hostMultiAgent}`);
  }
  const buildResult = options.artifact
    ? {
        artifact_root: path.resolve(options.artifact),
        bundled: true,
        runtime_package_install_required: false
      }
    : options.skipBuild
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
  const capabilityCacheRoot = options.cacheRoot ? path.resolve(options.cacheRoot) : null;
  const hostCapabilities = options.hostMultiAgent
    ? writeHostCapabilities(options.hostMultiAgent, {
        cacheRoot: capabilityCacheRoot,
        hostVersion: options.hostVersion ?? null
      })
    : readHostCapabilities(capabilityCacheRoot);
  let projectMigration = null;
  if (options.project) {
    const projectRoot = path.resolve(options.project);
    const allowedModes = new Set([
      "auto",
      "skip",
      "configure",
      "reorganize",
      "rebuild"
    ]);
    if (!allowedModes.has(options.standards)) {
      throw new Error(`unsupported standards mode: ${options.standards}`);
    }
    const legacyPreview = previewLegacyCleanup(projectRoot);
    const legacy = options.legacyConfirm
      ? applyLegacyCleanup({
          project: { locator: projectRoot },
          confirmation: {
            preview_fingerprint: options.legacyConfirm
          }
        })
      : legacyPreview;
    let standards = { skipped: true, reason: "standards mode is skip" };
    if (options.standards !== "skip") {
      const initialization = {
        schema_version: 1,
        action: options.standardsConfirm ? "apply" : "preview",
        strategy: options.standards === "auto" ? "configure" : options.standards,
        project: { locator: projectRoot }
      };
      const planned = planStandardsInitialization(initialization);
      standards = options.standardsConfirm
        ? applyStandardsInitialization({
            ...initialization,
            confirmation: {
              preview_fingerprint: options.standardsConfirm
            }
          })
        : planned.preview;
    }
    projectMigration = {
      project: projectRoot,
      legacy,
      standards
    };
  }
  process.stdout.write(
    `${JSON.stringify({
      schema_version: 1,
      installed_from: artifactRoot,
      installed_to: target,
      backup: backupCreated ? backup : null,
      runtime_package_install_required: false,
      host_capabilities: hostCapabilities,
      project_migration: projectMigration
    }, null, 2)}\n`
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error.message}\n`);
  process.exitCode = 1;
});
