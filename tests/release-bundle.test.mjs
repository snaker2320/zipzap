import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { writeReleaseAssets } from "../scripts/release-bundle.mjs";

const repositoryRoot = path.resolve(".");

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function fixtureSkill(root) {
  const skillRoot = path.join(root, "skill");
  fs.mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  fs.mkdirSync(path.join(skillRoot, "references"), { recursive: true });
  fs.writeFileSync(path.join(skillRoot, "SKILL.md"), "---\nname: zipzap\n---\n");
  fs.writeFileSync(path.join(skillRoot, "scripts", "zipzap.mjs"), "#!/usr/bin/env node\n");
  fs.writeFileSync(path.join(skillRoot, "scripts", "task.mjs"), "#!/usr/bin/env node\n");
  fs.writeFileSync(path.join(skillRoot, "references", "usage.md"), "Use ZipZap.\n");
  fs.chmodSync(path.join(skillRoot, "scripts", "zipzap.mjs"), 0o755);
  fs.chmodSync(path.join(skillRoot, "scripts", "task.mjs"), 0o755);
  return skillRoot;
}

test("creates deterministic GitHub Release assets from one Skill directory", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-release-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skillRoot = fixtureSkill(root);
  const manifest = {
    schema_version: 1,
    skill: { name: "zipzap", version: "0.1.1-beta.6", channel: "beta" },
    files: []
  };
  const first = writeReleaseAssets({
    skillRoot,
    releaseRoot: path.join(root, "release-a"),
    manifest
  });
  const second = writeReleaseAssets({
    skillRoot,
    releaseRoot: path.join(root, "release-b"),
    manifest
  });
  const firstArchive = fs.readFileSync(first.assets[0]);
  const secondArchive = fs.readFileSync(second.assets[0]);
  assert.equal(digest(firstArchive), digest(secondArchive));

  const entries = execFileSync("tar", ["-tzf", first.assets[0]], {
    encoding: "utf8"
  }).trim().split("\n");
  assert.deepEqual(entries, [
    "zipzap/",
    "zipzap/references/",
    "zipzap/references/usage.md",
    "zipzap/scripts/",
    "zipzap/scripts/task.mjs",
    "zipzap/scripts/zipzap.mjs",
    "zipzap/SKILL.md"
  ]);

  const checksums = fs.readFileSync(first.assets[2], "utf8").trim().split("\n");
  assert.equal(checksums.length, 2);
  assert.match(checksums[0], /^[a-f0-9]{64}  zipzap-0\.1\.1-beta\.6\.skill\.tar\.gz$/);
  assert.match(checksums[1], /^[a-f0-9]{64}  release-manifest\.json$/);
  assert.equal(JSON.parse(fs.readFileSync(first.assets[1], "utf8")).skill.version, "0.1.1-beta.6");
});

test("keeps npm private and routes publication through release:bundle", () => {
  const packageMetadata = JSON.parse(
    fs.readFileSync(path.join(repositoryRoot, "package.json"), "utf8")
  );
  assert.equal(packageMetadata.private, true);
  assert.equal(
    packageMetadata.scripts["release:bundle"],
    "node scripts/release-bundle.mjs"
  );
  assert.equal(packageMetadata.scripts.prepack, undefined);
  assert.equal(packageMetadata.publishConfig, undefined);
  assert.match(
    fs.readFileSync(path.join(repositoryRoot, ".gitignore"), "utf8"),
    /^dist\/$/m
  );
});
