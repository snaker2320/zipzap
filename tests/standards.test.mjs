import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyStandardsInitialization,
  planStandardsInitialization,
  routeStandards
} from "../scripts/lib/standards.mjs";

test("initialization previews and confirms only relevant standards assets", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-standards-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  fs.writeFileSync(path.join(root, "Dockerfile"), "FROM scratch\n");
  fs.mkdirSync(path.join(root, ".git"));
  const input = {
    schema_version: 1,
    action: "preview",
    strategy: "configure",
    project: { locator: root },
    cache_root: path.join(root, ".cache")
  };
  const { preview } = planStandardsInitialization(input);
  assert.equal(preview.requires_confirmation, true);
  assert.ok(preview.operations.some((item) => item.target === "standards/engineering/node.md"));
  assert.ok(preview.operations.some((item) => item.target === "standards/engineering/build.md"));
  assert.ok(preview.operations.some((item) => item.target === "standards/delivery/deployment.md"));
  assert.ok(!preview.operations.some((item) => item.target === "standards/engineering/java.md"));
  assert.throws(() => applyStandardsInitialization({ ...input, action: "apply" }), /preview_fingerprint/);
  const applied = applyStandardsInitialization({
    ...input,
    action: "apply",
    confirmation: { preview_fingerprint: preview.preview_fingerprint }
  });
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(root, "standards", "engineering", "node.md")), true);
  assert.equal(fs.existsSync(path.join(root, "standards", "engineering", "build.md")), true);
  assert.equal(fs.existsSync(path.join(root, "standards", "delivery", "deployment.md")), true);
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
});

test("routing loads matching standards as whole files", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-route-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "standards", "engineering"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "standards", "engineering", "api.md"),
    "---\npriority: 10\napplies_to:\n  paths: [src/api/**]\n  actions: [implement]\n---\n# API\n"
  );
  const result = routeStandards({
    project: { locator: root },
    context: { action: "implement", risk: "medium", paths: ["src/api/order.mjs"] }
  });
  assert.equal(result.loading, "whole-file");
  assert.deepEqual(result.selected.map((item) => item.locator), ["standards/engineering/api.md"]);
});

test("default configuration reorganizes legacy conventions", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-reorganize-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "conventions"));
  fs.writeFileSync(path.join(root, "conventions", "api.md"), "# API coding rules\n");
  const { preview } = planStandardsInitialization({
    schema_version: 1,
    action: "preview",
    strategy: "configure",
    project: { locator: root }
  });
  assert.equal(preview.strategy, "reorganize");
  assert.ok(preview.operations.some((item) => item.action === "move"));
});

test("full rebuild backs up and replaces the existing standards tree", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-rebuild-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "standards", "foundation"), { recursive: true });
  fs.writeFileSync(path.join(root, "standards", "foundation", "old.md"), "old\n");
  fs.writeFileSync(path.join(root, "package.json"), "{}\n");
  const input = {
    schema_version: 1,
    action: "preview",
    strategy: "rebuild",
    project: { locator: root },
    cache_root: path.join(root, ".cache")
  };
  const { preview } = planStandardsInitialization(input);
  assert.ok(preview.operations.some((item) => item.action === "replace-tree"));
  const applied = applyStandardsInitialization({
    ...input,
    action: "apply",
    confirmation: { preview_fingerprint: preview.preview_fingerprint }
  });
  assert.equal(fs.existsSync(path.join(root, "standards", "foundation", "old.md")), false);
  assert.equal(fs.existsSync(path.join(root, "standards", "foundation", "project.md")), true);
  assert.ok(applied.backup_root);
});
