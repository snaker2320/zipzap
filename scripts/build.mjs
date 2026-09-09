#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { build } from "esbuild";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DIST_ROOT = path.join(ROOT_DIR, "dist", "skill");
const STATIC_ROOTS = [
  "SKILL.md",
  "agents",
  "config",
  "schemas",
  "references",
  "examples"
];

function copyStaticRoots() {
  for (const relativePath of STATIC_ROOTS) {
    fs.cpSync(
      path.join(ROOT_DIR, relativePath),
      path.join(DIST_ROOT, relativePath),
      { recursive: true }
    );
  }
}

export async function buildSkill() {
  fs.rmSync(DIST_ROOT, { recursive: true, force: true });
  fs.mkdirSync(path.join(DIST_ROOT, "scripts"), { recursive: true });
  copyStaticRoots();
  await build({
    entryPoints: {
      zipzap: path.join(ROOT_DIR, "scripts", "zipzap.mjs")
    },
    outdir: path.join(DIST_ROOT, "scripts"),
    outExtension: { ".js": ".mjs" },
    entryNames: "[name]",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node20",
    banner: {
      js: "import { createRequire as __zipzapCreateRequire } from 'node:module'; const require = __zipzapCreateRequire(import.meta.url);"
    },
    legalComments: "none",
    sourcemap: false,
    logLevel: "silent"
  });
  for (const name of ["zipzap.mjs"]) {
    fs.chmodSync(path.join(DIST_ROOT, "scripts", name), 0o755);
  }
  return {
    schema_version: 1,
    source_root: ROOT_DIR,
    artifact_root: DIST_ROOT,
    entrypoints: ["scripts/zipzap.mjs"],
    bundled: true,
    runtime_package_install_required: false
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  buildSkill()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    })
    .catch((error) => {
      process.stderr.write(`${error.stack ?? error.message}\n`);
      process.exitCode = 1;
    });
}
