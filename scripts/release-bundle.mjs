#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import zlib from "node:zlib";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DIST_ROOT = path.join(ROOT_DIR, "dist");
const SKILL_ROOT = path.join(DIST_ROOT, "skill");
const RELEASE_ROOT = path.join(DIST_ROOT, "release");
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const GATE_EVIDENCE = {
  "catalog-valid": "command:npm run validate",
  "tests-pass": "command:npm test",
  "schema-valid": "command:npm run validate",
  "skill-valid": "command:npm run test:dist",
  "conformance-pass": "command:npm test",
  "diff-check": "release-manifest:first-build-equals-second-build"
};

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function run(command, args, options = {}) {
  const capture = options.capture === true;
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT_DIR,
    encoding: "utf8",
    input: options.input,
    stdio: capture ? ["pipe", "pipe", "inherit"] : "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited with ${result.status}`);
  }
  return capture ? result.stdout.trim() : "";
}

function npmCommand() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function gitOutput(args, rootDir = ROOT_DIR) {
  return run("git", args, { capture: true, cwd: rootDir });
}

function assertCleanGit(rootDir = ROOT_DIR) {
  const status = gitOutput(["status", "--porcelain", "--untracked-files=all"], rootDir);
  if (status) {
    throw new Error(
      "release:bundle requires a clean Git worktree; commit or remove every source change first"
    );
  }
  return gitOutput(["rev-parse", "HEAD"], rootDir);
}

function releaseSource() {
  const sourceCommit = assertCleanGit();
  const packageMetadata = JSON.parse(
    fs.readFileSync(path.join(ROOT_DIR, "package.json"), "utf8")
  );
  if (packageMetadata.private !== true) {
    throw new Error("package.json must remain private to forbid npm publication");
  }
  if (!SEMVER_PATTERN.test(packageMetadata.version ?? "")) {
    throw new Error("package.json must declare a semantic release version");
  }
  const tag = `v${packageMetadata.version}`;
  let tagCommit;
  try {
    tagCommit = gitOutput(["rev-list", "-n", "1", tag]);
  } catch {
    throw new Error(`release tag ${tag} does not exist`);
  }
  if (tagCommit !== sourceCommit) {
    throw new Error(`release tag ${tag} does not point to current HEAD ${sourceCommit}`);
  }
  return {
    sourceCommit,
    tag,
    version: packageMetadata.version
  };
}

function writeString(buffer, offset, length, value) {
  const encoded = Buffer.from(value, "utf8");
  if (encoded.length > length) {
    throw new Error(`tar field is too long: ${value}`);
  }
  encoded.copy(buffer, offset);
}

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, "0");
  if (encoded.length > length - 1) {
    throw new Error(`tar numeric field is too large: ${value}`);
  }
  writeString(buffer, offset, length, `${encoded}\0`);
}

function splitTarPath(entryPath) {
  const encoded = Buffer.byteLength(entryPath);
  if (encoded <= 100) return { name: entryPath, prefix: "" };
  for (let index = entryPath.lastIndexOf("/"); index > 0; index = entryPath.lastIndexOf("/", index - 1)) {
    const prefix = entryPath.slice(0, index);
    const name = entryPath.slice(index + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(name) <= 100) {
      return { name, prefix };
    }
  }
  throw new Error(`tar path is too long: ${entryPath}`);
}

function tarHeader(entry) {
  const header = Buffer.alloc(512);
  const fields = splitTarPath(entry.path);
  writeString(header, 0, 100, fields.name);
  writeOctal(header, 100, 8, entry.mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, entry.content?.length ?? 0);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  writeString(header, 156, 1, entry.type === "directory" ? "5" : "0");
  writeString(header, 257, 6, "ustar\0");
  writeString(header, 263, 2, "00");
  writeString(header, 265, 32, "root");
  writeString(header, 297, 32, "root");
  writeString(header, 345, 155, fields.prefix);
  const checksum = [...header].reduce((sum, value) => sum + value, 0);
  writeString(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
  return header;
}

function collectTarEntries(skillRoot) {
  const entries = [
    { path: "zipzap/", type: "directory", mode: 0o755, content: null }
  ];
  function visit(directory, relativeDirectory = "") {
    for (const item of fs.readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const absolutePath = path.join(directory, item.name);
      const relativePath = path.posix.join(relativeDirectory, item.name);
      const archivePath = `zipzap/${relativePath}`;
      if (item.isSymbolicLink()) {
        throw new Error(`release Skill must not contain symbolic links: ${relativePath}`);
      }
      if (item.isDirectory()) {
        entries.push({
          path: `${archivePath}/`,
          type: "directory",
          mode: 0o755,
          content: null
        });
        visit(absolutePath, relativePath);
      } else if (item.isFile()) {
        const stat = fs.statSync(absolutePath);
        entries.push({
          path: archivePath,
          type: "file",
          mode: stat.mode & 0o111 ? 0o755 : 0o644,
          content: fs.readFileSync(absolutePath)
        });
      } else {
        throw new Error(`unsupported release Skill entry: ${relativePath}`);
      }
    }
  }
  visit(skillRoot);
  return entries;
}

export function createSkillArchive(skillRoot, archivePath) {
  for (const required of [
    "SKILL.md",
    "scripts/zipzap.mjs",
    "scripts/task.mjs"
  ]) {
    if (!fs.existsSync(path.join(skillRoot, required))) {
      throw new Error(`release Skill is missing ${required}`);
    }
  }
  if (fs.existsSync(path.join(skillRoot, "node_modules"))) {
    throw new Error("release Skill must not contain node_modules");
  }
  const blocks = [];
  for (const entry of collectTarEntries(skillRoot)) {
    blocks.push(tarHeader(entry));
    if (entry.content) {
      blocks.push(entry.content);
      const padding = (512 - (entry.content.length % 512)) % 512;
      if (padding) blocks.push(Buffer.alloc(padding));
    }
  }
  blocks.push(Buffer.alloc(1024));
  const compressed = zlib.gzipSync(Buffer.concat(blocks), {
    level: 9,
    mtime: 0
  });
  fs.writeFileSync(archivePath, compressed);
  return {
    path: archivePath,
    size: compressed.length,
    sha256: sha256(compressed)
  };
}

export function writeReleaseAssets({
  skillRoot,
  releaseRoot,
  manifest
}) {
  const version = manifest?.skill?.version;
  if (manifest?.skill?.name !== "zipzap" || !SEMVER_PATTERN.test(version ?? "")) {
    throw new Error("release manifest must identify a semantic ZipZap version");
  }
  const releaseDirectory = path.join(releaseRoot, version);
  fs.rmSync(releaseDirectory, { recursive: true, force: true });
  fs.mkdirSync(releaseDirectory, { recursive: true });

  const manifestPath = path.join(releaseDirectory, "release-manifest.json");
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(manifestPath, manifestBytes);

  const archiveName = `zipzap-${version}.skill.tar.gz`;
  const archive = createSkillArchive(
    skillRoot,
    path.join(releaseDirectory, archiveName)
  );
  const checksums = [
    `${archive.sha256}  ${archiveName}`,
    `${sha256(manifestBytes)}  release-manifest.json`
  ].join("\n");
  const checksumsPath = path.join(releaseDirectory, "SHA256SUMS");
  fs.writeFileSync(checksumsPath, `${checksums}\n`);

  return {
    version,
    release_directory: releaseDirectory,
    assets: [archive.path, manifestPath, checksumsPath]
  };
}

function builtReleasePlan() {
  const output = run(
    process.execPath,
    [path.join(SKILL_ROOT, "scripts", "zipzap.mjs"), "release-plan", "--compact"],
    { capture: true }
  );
  const result = JSON.parse(output);
  if (!result.allowed || !result.release_manifest) {
    throw new Error("built Skill did not produce an allowed release manifest");
  }
  return result.release_manifest;
}

function publishAssessment(manifest) {
  const evidence = manifest.release_requirements.map((gate) => {
    const evidenceRef = GATE_EVIDENCE[gate];
    if (!evidenceRef) throw new Error(`release gate has no evidence route: ${gate}`);
    return { gate, status: "passed", evidence_ref: evidenceRef };
  });
  const request = {
    schema_version: 1,
    operation: "publish",
    release_manifest: manifest,
    evidence
  };
  const output = run(
    process.execPath,
    [path.join(SKILL_ROOT, "scripts", "zipzap.mjs"), "lifecycle", "--compact"],
    { capture: true, input: `${JSON.stringify(request)}\n` }
  );
  const result = JSON.parse(output);
  if (!result.allowed) {
    throw new Error(`L7 publish assessment is blocked: ${JSON.stringify(result.required_actions)}`);
  }
  return result;
}

export function buildReleaseBundle() {
  const source = releaseSource();
  const npm = npmCommand();
  run(npm, ["test"]);
  run(npm, ["run", "validate"]);
  run(npm, ["run", "build"]);
  run(npm, ["run", "test:dist"]);
  const firstManifest = builtReleasePlan();
  run(npm, ["run", "build"]);
  const secondManifest = builtReleasePlan();
  if (JSON.stringify(firstManifest) !== JSON.stringify(secondManifest)) {
    throw new Error("release manifest changed across identical consecutive builds");
  }

  if (source.version !== secondManifest.skill.version) {
    throw new Error(
      `package version ${source.version} does not match Skill version ${secondManifest.skill.version}`
    );
  }
  const lifecycle = publishAssessment(secondManifest);
  const release = writeReleaseAssets({
    skillRoot: SKILL_ROOT,
    releaseRoot: RELEASE_ROOT,
    manifest: secondManifest
  });
  return {
    schema_version: 1,
    status: "ready",
    publication_performed: false,
    source_commit: source.sourceCommit,
    tag: source.tag,
    prerelease: release.version.includes("-"),
    release_directory: path.relative(ROOT_DIR, release.release_directory),
    assets: release.assets.map((asset) => path.relative(ROOT_DIR, asset)),
    lifecycle_checks: lifecycle.checks
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  try {
    process.stdout.write(`${JSON.stringify(buildReleaseBundle(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exitCode = 1;
  }
}
