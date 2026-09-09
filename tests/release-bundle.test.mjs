import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import { writeReleaseAssets } from "../scripts/release-bundle.mjs";

function digest(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

test("release archive is deterministic and contains no Task CLI", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-release-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const skill = path.join(root, "skill");
  fs.mkdirSync(path.join(skill, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(skill, "SKILL.md"), "---\nname: zipzap\n---\n");
  fs.writeFileSync(path.join(skill, "scripts", "zipzap.mjs"), "#!/usr/bin/env node\n");
  const manifest = { schema_version: 1, skill: { name: "zipzap", version: "0.2.0-beta.1", channel: "beta" }, files: [] };
  const first = writeReleaseAssets({ skillRoot: skill, releaseRoot: path.join(root, "a"), manifest });
  const second = writeReleaseAssets({ skillRoot: skill, releaseRoot: path.join(root, "b"), manifest });
  assert.equal(digest(fs.readFileSync(first.assets[0])), digest(fs.readFileSync(second.assets[0])));
  const entries = execFileSync("tar", ["-tzf", first.assets[0]], { encoding: "utf8" });
  assert.match(entries, /zipzap\/scripts\/zipzap\.mjs/);
  assert.doesNotMatch(entries, /task\.mjs/);
});
