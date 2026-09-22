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
  assert.match(bootstrap, /without any Skill/);
  assert.match(bootstrap, /ZipZap is optional assistance/);
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

test("default configuration preserves existing conventions and generates a usable project entry", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-reorganize-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "conventions"));
  fs.writeFileSync(path.join(root, "conventions", "api.md"), "# API coding rules\n");
  const input = {
    schema_version: 1,
    action: "preview",
    strategy: "configure",
    project: { locator: root }
  };
  const { preview } = planStandardsInitialization(input);
  assert.equal(preview.strategy, "keep");
  assert.ok(preview.operations.every((item) => !["move", "mkdir", "replace-tree"].includes(item.action)));
  applyStandardsInitialization({ ...input, action: "apply", confirmation: { preview_fingerprint: preview.preview_fingerprint } });
  assert.equal(fs.readFileSync(path.join(root, "conventions/api.md"), "utf8"), "# API coding rules\n");
  assert.equal(fs.existsSync(path.join(root, "standards")), false);
  const entry = fs.readFileSync(path.join(root, "AGENTS.md"), "utf8");
  assert.ok(entry.includes("`conventions`"));
  const result = routeStandards({ project: { locator: root }, context: { action: "implement" } });
  assert.deepEqual(result.selected.map((item) => item.locator), ["conventions/api.md"]);
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

function projectFixture(context, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-independent-project-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [locator, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, locator)), { recursive: true });
    fs.writeFileSync(path.join(root, locator), content);
  }
  return root;
}

test("custom project rules need no categories or ZipZap frontmatter and remain unchanged", (context) => {
  const content = "---\ntitle: Rules\nauthor: Project team\n---\n# API rules\n\nChanges must preserve existing clients.\n";
  const root = projectFixture(context, {
    "handbook/api.md": content,
    "standards/other-layout/unused.md": "# Other rules\n",
    "AGENTS.md": "Read [API rules](handbook/api.md) before API edits.\n"
  });
  const project = { locator: root, standards: ["handbook"] };
  const result = routeStandards({ project, context: { action: "implement" } });
  assert.deepEqual(result.selected.map((item) => item.locator), ["handbook/api.md"]);
  assert.equal(result.index.persisted, false);
  assert.equal(result.selected[0].category, "project");
  assert.ok(result.diagnostics.some((item) => item.code === "unscoped-standard"));
  const { preview } = planStandardsInitialization({ project });
  assert.equal(preview.strategy, "keep");
  assert.ok(preview.operations.every((item) => item.action === "keep"));
  applyStandardsInitialization({ project, confirmation: { preview_fingerprint: preview.preview_fingerprint } });
  assert.equal(fs.readFileSync(path.join(root, "handbook/api.md"), "utf8"), content);
  assert.equal(discoverStandards(root).files[0].locator, "standards/other-layout/unused.md");
});

test("explicit file sources deduplicate overlaps and keep scoped matching", (context) => {
  const root = projectFixture(context, {
    "rules/api.md": "---\napplies_to:\n  paths: [src/api/**]\n---\n# API\n\nMust preserve contracts.\n",
    "rules/ui.md": "---\napplies_to:\n  paths: [src/ui/**]\n---\n# UI\n\nMust preserve accessibility.\n"
  });
  const result = routeStandards({ project: { locator: root, standards: ["rules", "rules/api.md"] }, context: { paths: ["src/api/order.mjs"] } });
  assert.deepEqual(result.selected.map((item) => item.locator), ["rules/api.md"]);
  assert.equal(result.diagnostics.some((item) => item.code === "duplicate-standard-id"), false);
});

test("reference assistance follows one hop without promoting documents to rules", (context) => {
  const root = projectFixture(context, {
    "conventions/api.md": "# API rules\n\nMust read [contract](../docs/contract.md#api) and `docs/notes.md`.\n\n```md\n[example](../docs/not-real.md)\n```\n",
    "AGENTS.md": "See [overview](docs/overview.md) and [remote](https://example.test/rules.md).\n",
    "docs/index.md": "[Decision][decision]\n\n[decision]: decisions/accepted.md\n",
    "docs/contract.md": "# Contract\n[Further](deep.md)\n",
    "docs/deep.md": "# Not traversed\n",
    "docs/notes.md": "# Notes\n",
    "docs/overview.md": "# Overview\n",
    "docs/decisions/accepted.md": "# Decision\n"
  });
  const result = routeStandards({ project: { locator: root }, context: { action: "design" } });
  assert.deepEqual(result.selected.map((item) => item.locator), ["conventions/api.md"]);
  const refs = result.related_documents;
  assert.ok(refs.some((item) => item.locator === "docs/contract.md" && item.referenced_by[0].locator === "conventions/api.md"));
  assert.ok(refs.some((item) => item.locator === "docs/decisions/accepted.md"));
  assert.ok(refs.some((item) => item.locator === "docs/notes.md"));
  assert.equal(refs.some((item) => item.locator === "docs/deep.md"), false);
  assert.ok(refs.every((item) => item.kind === "reference" && item.authority === "unclassified"));
  assert.equal(result.diagnostics.some((item) => item.code === "missing-document-reference"), false);
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
});

test("empty and missing sources expose uncertainty without creating standards", (context) => {
  const root = projectFixture(context, { "AGENTS.md": "Rules are maintained by the project team.\n" });
  const result = routeStandards({ project: { locator: root, standards: ["missing"], documents: ["missing-index.md"] }, context: { action: "implement" } });
  assert.deepEqual(result.selected, []);
  assert.ok(result.diagnostics.some((item) => item.code === "missing-standard-source"));
  assert.ok(result.diagnostics.some((item) => item.code === "missing-document-source"));
  assert.ok(result.fallback.includes("No match does not mean no rules apply"));
  assert.equal(result.coverage, "inspected-sources-and-direct-references-only");
  const { preview } = planStandardsInitialization({ project: { locator: root, standards: ["missing"] } });
  assert.ok(preview.decisions.some((item) => item.id === "missing-standard-source"));
  assert.throws(() => applyStandardsInitialization({ project: { locator: root, standards: ["missing"] }, confirmation: { preview_fingerprint: preview.preview_fingerprint } }), /unresolved/);
  assert.equal(fs.existsSync(path.join(root, "standards")), false);
});

test("invalid metadata retains project rules for direct reading", (context) => {
  const root = projectFixture(context, { "conventions/api.md": "---\napplies_to: [\n---\n# Rules\nMust preserve compatibility.\n" });
  const result = routeStandards({ project: { locator: root }, context: { action: "implement" } });
  assert.equal(result.selected.length, 1);
  assert.ok(result.diagnostics.some((item) => item.code === "invalid-frontmatter"));
});

test("existing bootstrap migration is a digest-bound suggestion and never automatic", (context) => {
  const entry = "# Instructions\n\n- Use the installed ZipZap Skill for standards routing, gates, feedback, and Git Handoff.\n- Read conventions/api.md.\n- Independent review is required before release.\n";
  const root = projectFixture(context, { "AGENTS.md": entry, "conventions/api.md": "# API\nMust preserve compatibility.\n" });
  const project = { locator: root };
  const { preview } = planStandardsInitialization({ project });
  assert.equal(preview.bootstrap_suggestion.automatic_apply, false);
  assert.equal(preview.bootstrap_suggestion.changes.length, 1);
  assert.equal(preview.bootstrap_suggestion.changes[0].line, 3);
  assert.match(preview.bootstrap_suggestion.current_sha256, /^sha256:[a-f0-9]{64}$/);
  applyStandardsInitialization({ project, confirmation: { preview_fingerprint: preview.preview_fingerprint } });
  assert.equal(fs.readFileSync(path.join(root, "AGENTS.md"), "utf8"), entry);
  fs.appendFileSync(path.join(root, "AGENTS.md"), "- New project requirement.\n");
  assert.throws(() => applyStandardsInitialization({ project, confirmation: { preview_fingerprint: preview.preview_fingerprint } }), /current preview_fingerprint/);
});

test("explicit reorganization still requires preview confirmation", (context) => {
  const root = projectFixture(context, { "conventions/api.md": "# API\nMust preserve clients.\n" });
  const input = { project: { locator: root }, strategy: "reorganize" };
  const { preview } = planStandardsInitialization(input);
  assert.equal(preview.strategy, "reorganize");
  assert.ok(preview.operations.some((item) => item.action === "move"));
  assert.throws(() => applyStandardsInitialization(input), /preview_fingerprint/);
  assert.equal(fs.existsSync(path.join(root, "conventions/api.md")), true);
});

test("source and reference discovery cannot follow paths outside the project", (context) => {
  const root = projectFixture(context, { "conventions/api.md": "# API\n[Escape](../../outside.md)\n[Missing](../docs/missing.md)\n" });
  assert.throws(() => discoverStandards(root, { standards: [".."] }), /escapes project root/);
  fs.symlinkSync(os.tmpdir(), path.join(root, "external"));
  assert.throws(() => discoverStandards(root, { standards: ["external"] }), /symlink/);
  const result = routeStandards({ project: { locator: root }, context: { action: "review" } });
  assert.ok(result.diagnostics.some((item) => item.code === "invalid-document-reference"));
  assert.ok(result.diagnostics.some((item) => item.code === "missing-document-reference"));
});
