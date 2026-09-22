import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const cli = path.resolve("scripts/zipzap.mjs");
test("CLI routes project-owned sources and discovers references from an unrelated cwd", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-standards-cli-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "rules"));
  fs.mkdirSync(path.join(root, "docs"));
  fs.writeFileSync(path.join(root, "rules/api.md"), "# API\nMust follow [contract](../docs/contract.md).\n");
  fs.writeFileSync(path.join(root, "docs/contract.md"), "# Contract\n");
  fs.writeFileSync(path.join(root, "entry.md"), "Read [API](rules/api.md).\n");
  const project = { locator: root, standards: ["rules/api.md"], documents: ["entry.md"] };
  const request = path.join(root, "request.json");
  fs.writeFileSync(request, JSON.stringify({ schema_version: 1, project, context: { action: "review" } }));
  const run = (action) => JSON.parse(execFileSync(process.execPath, [cli, "standards", "--action", action, "--input", request, "--compact"], { cwd: os.tmpdir(), encoding: "utf8" }));
  assert.deepEqual(run("discover").files.map((item) => item.locator), ["rules/api.md"]);
  const routed = run("route");
  assert.deepEqual(routed.selected.map((item) => item.locator), ["rules/api.md"]);
  assert.ok(routed.related_documents.some((item) => item.locator === "docs/contract.md"));
  assert.equal(routed.index.persisted, false);
  assert.equal(fs.existsSync(path.join(root, "standards")), false);
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
  assert.equal("workflow_complete" in routed, false);

  fs.writeFileSync(request, JSON.stringify({ schema_version: 1, action: "preview", project: { locator: root, standards: ["rules"] } }));
  const preview = JSON.parse(execFileSync(process.execPath, [cli, "initialize", "--input", request, "--compact"], { cwd: os.tmpdir(), encoding: "utf8" }));
  assert.equal(preview.strategy, "keep");
  assert.ok(preview.operations.every((item) => item.action !== "move"));
});
