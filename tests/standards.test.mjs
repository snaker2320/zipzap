import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyStandardsInitialization,
  discoverStandards,
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
  const bootstrap = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.match(bootstrap, /Use the installed ZipZap Skill/);
  assert.match(bootstrap, /affected domains, artifacts, changed paths, and risk/);
  assert.doesNotMatch(bootstrap, /scripts\/zipzap\.mjs|\.agents\/skills\/zipzap/);
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
  assert.deepEqual(result.selected[0].matched_by, [
    { dimension: "actions", values: ["implement"] },
    { dimension: "paths", values: ["src/api/**"] }
  ]);
  assert.deepEqual(result.index, {
    mode: "derived",
    source: "standards/",
    persisted: false
  });
});

test("routing combines domain and artifact selectors without persisting an index", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-context-route-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "standards", "engineering"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "standards", "engineering", "archive.md"),
    "---\nid: domain:customer-archive\napplies_to:\n  domains: [customer-archive]\n  artifacts: [backend-api, frontend-ui]\n---\n# Customer archive\n\nChanges must preserve the physical attachment boundary.\n"
  );
  fs.writeFileSync(
    path.join(root, "standards", "engineering", "funding.md"),
    "---\napplies_to:\n  domains: [funding]\n---\n# Funding\n\nChanges must preserve ledger invariants.\n"
  );

  const result = routeStandards({
    project: { locator: root },
    context: {
      action: "implement",
      domains: ["customer-archive"],
      artifacts: ["backend-api"]
    }
  });

  assert.deepEqual(result.selected.map((item) => item.locator), ["standards/engineering/archive.md"]);
  assert.deepEqual(result.selected[0].matched_by, [
    { dimension: "domains", values: ["customer-archive"] },
    { dimension: "artifacts", values: ["backend-api"] }
  ]);
  assert.equal(result.index.persisted, false);
  assert.equal(result.diagnostics.some((item) => item.code === "unmatched-domains"), false);
});

test("unscoped standards remain compatible and produce read-only diagnostics", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-unscoped-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "standards", "quality"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "standards", "quality", "legacy.md"),
    "# Legacy quality standard\n\nAlways record focused verification evidence.\n"
  );

  const result = routeStandards({
    project: { locator: root },
    context: { action: "implement", domains: ["customer-archive"] }
  });

  assert.deepEqual(result.selected.map((item) => item.locator), ["standards/quality/legacy.md"]);
  assert.deepEqual(result.selected[0].matched_by, [
    { dimension: "default", values: ["unscoped"] }
  ]);
  assert.ok(result.diagnostics.some((item) => item.code === "unscoped-standard"));
  assert.ok(result.diagnostics.some((item) => item.code === "unmatched-domains"));
});

test("routing diagnoses missing context without rejecting backward-compatible input", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-empty-context-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "standards", "foundation"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "standards", "foundation", "project.md"),
    "# Project standard\n\nAlways load this project foundation before acting.\n"
  );

  const result = routeStandards({
    project: { locator: root },
    context: {}
  });

  assert.deepEqual(result.selected.map((item) => item.locator), [
    "standards/foundation/project.md"
  ]);
  assert.ok(result.diagnostics.some(
    (item) => item.code === "insufficient-routing-context"
  ));
});

test("discovery diagnoses missing and example-heavy standards without editing them", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-diagnose-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const missing = discoverStandards(root);
  assert.equal(missing.configured, false);
  assert.deepEqual(missing.diagnostics.map((item) => item.code), ["missing-standards"]);

  fs.mkdirSync(path.join(root, "standards", "engineering"), { recursive: true });
  const locator = path.join(root, "standards", "engineering", "examples.md");
  const content = "# API examples\n\n## Example one\n\n```text\nGET /one\n```\n\n## Example two\n\n```text\nGET /two\n```\n\nFor example, call either endpoint.\n";
  fs.writeFileSync(locator, content);
  const discovered = discoverStandards(root);

  assert.ok(discovered.diagnostics.some((item) => item.code === "example-heavy-standard"));
  assert.ok(discovered.diagnostics.some((item) => item.code === "unscoped-standard"));
  assert.equal(fs.readFileSync(locator, "utf8"), content);
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
