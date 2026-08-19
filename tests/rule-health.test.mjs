import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyRuleHealthDisposition,
  diagnoseRuleHealth,
  listIgnoredRuleFindings
} from "../scripts/lib/rule-health.mjs";
import { loadCatalogs } from "../scripts/zipzap.mjs";

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-rule-health-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function source(overrides = {}) {
  return {
    id: "development-standard",
    locator: "docs/standards/development.md",
    kind: "standard",
    format: "markdown",
    loading: "on-demand",
    topics: ["coding"],
    selectors: {
      roles: ["developer"]
    },
    version: "sha256:registered",
    ...overrides
  };
}

function manifest(sources, overrides = {}) {
  return {
    schema_version: 1,
    project_id: "example",
    sources,
    ...overrides
  };
}

function diagnose(projectRoot, projectManifest, overrides = {}) {
  return diagnoseRuleHealth({
    schema_version: 1,
    operation: "diagnose",
    depth: "quick",
    project: { locator: projectRoot },
    manifest: projectManifest,
    ...overrides
  });
}

test("reports deterministic source availability, duplication, and metadata smells", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "docs", "standards"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "standards", "development.md"),
    "# Development\n"
  );
  const projectManifest = manifest([
    source(),
    source({
      id: "duplicate-development-standard",
      topics: ["testing"]
    }),
    source({
      id: "missing-security-standard",
      locator: "docs/standards/security.md",
      topics: ["security"]
    })
  ]);

  const result = diagnose(root, projectManifest);
  const categories = result.findings.map((finding) => finding.category);

  assert.equal(result.status, "completed");
  assert.equal(result.depth, "quick");
  assert.equal(categories.includes("duplicate-locator"), true);
  assert.equal(categories.includes("unavailable-source"), true);
  assert.equal(categories.includes("missing-source-metadata"), true);
  assert.equal(categories.includes("source-version-mismatch"), true);
  assert.equal(result.semantic_review_request, null);
});

test("reports invalid selectors, missing topic coverage, and route mismatch", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "docs", "misc"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "misc", "close-position.md"),
    "# Close position\n"
  );
  const projectManifest = manifest(
    [
      source({
        id: "business-close-position",
        locator: "docs/misc/close-position.md",
        topics: ["domain-and-business"],
        document_kind: "business-capability",
        selectors: { roles: ["invented-role"] },
        version: null,
        owner: "product"
      })
    ],
    {
      document_routing: {
        strategy: "preserve-existing",
        on_ambiguity: "decision-required",
        on_mismatch: "approval-required",
        routes: [
          {
            id: "business-capability",
            document_kinds: ["business-capability"],
            target: "docs/business",
            priority: 100
          }
        ]
      }
    }
  );

  const result = diagnose(root, projectManifest, {
    selector_catalog: { roles: ["product", "developer", "tester", "reviewer"] },
    required_topics: ["domain-and-business", "security"]
  });
  const categories = result.findings.map((finding) => finding.category);

  assert.equal(categories.includes("invalid-selector"), true);
  assert.equal(categories.includes("missing-topic-coverage"), true);
  assert.equal(categories.includes("document-route-mismatch"), true);
});

test("produces the same fingerprint for unchanged evidence", (context) => {
  const root = project(context);
  const projectManifest = manifest([
    source({ locator: "docs/missing.md", version: "sha256:v1" })
  ]);

  const first = diagnose(root, projectManifest);
  const second = diagnose(root, structuredClone(projectManifest));

  assert.deepEqual(
    first.findings.map((finding) => finding.fingerprint),
    second.findings.map((finding) => finding.fingerprint)
  );
});

test("silences an ignored finding until its source version changes", (context) => {
  const root = project(context);
  const projectManifest = manifest([
    source({ locator: "docs/missing.md", version: "sha256:v1" })
  ]);
  const first = diagnose(root, projectManifest);
  const finding = first.findings.find(
    (item) => item.category === "unavailable-source"
  );

  const ignored = applyRuleHealthDisposition({
    schema_version: 1,
    operation: "ignore",
    project: { locator: root },
    finding,
    actor: "user",
    reason: "Accepted project exception."
  });
  assert.equal(ignored.status, "ignored");
  assert.equal(fs.existsSync(ignored.locator), true);

  const unchanged = diagnose(root, projectManifest);
  assert.equal(
    unchanged.findings.some((item) => item.fingerprint === finding.fingerprint),
    false
  );
  assert.equal(unchanged.ignored_count >= 1, true);

  const changedManifest = structuredClone(projectManifest);
  changedManifest.sources[0].version = "sha256:v2";
  const changed = diagnose(root, changedManifest);
  const changedFinding = changed.findings.find(
    (item) => item.category === "unavailable-source"
  );
  assert.notEqual(changedFinding.fingerprint, finding.fingerprint);
});

test("includes ignored findings on request and restores the exact record", (context) => {
  const root = project(context);
  const projectManifest = manifest([
    source({ locator: "docs/missing.md", version: "sha256:v1" })
  ]);
  const finding = diagnose(root, projectManifest).findings.find(
    (item) => item.category === "unavailable-source"
  );
  applyRuleHealthDisposition({
    schema_version: 1,
    operation: "ignore",
    project: { locator: root },
    finding,
    actor: "user"
  });

  const visible = diagnose(root, projectManifest, { include_ignored: true });
  assert.equal(
    visible.findings.find((item) => item.fingerprint === finding.fingerprint)
      .disposition,
    "ignored"
  );
  assert.equal(listIgnoredRuleFindings({ project: { locator: root } }).length, 1);

  const restored = applyRuleHealthDisposition({
    schema_version: 1,
    operation: "restore",
    project: { locator: root },
    fingerprint: finding.fingerprint,
    actor: "user"
  });
  assert.equal(restored.status, "restored");
  assert.equal(listIgnoredRuleFindings({ project: { locator: root } }).length, 0);
  assert.equal(
    diagnose(root, projectManifest).findings.some(
      (item) => item.fingerprint === finding.fingerprint
    ),
    true
  );
});

test("exposes explicit rule health diagnosis through CLI and schemas", (context) => {
  const root = project(context);
  const help = execFileSync(
    process.execPath,
    ["scripts/zipzap.mjs", "rule-health", "--help"],
    { encoding: "utf8" }
  );
  assert.match(help, /schemas\/rule-health-input\.schema\.json/);

  const example = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/zipzap.mjs", "rule-health", "--example", "--compact"],
      { encoding: "utf8" }
    )
  );
  example.project.locator = root;
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/zipzap.mjs", "rule-health", "--compact"],
      { encoding: "utf8", input: JSON.stringify(example) }
    )
  );
  assert.equal(output.status, "completed");
  assert.equal(output.depth, "quick");

  const catalogs = loadCatalogs();
  assert.equal(catalogs.schemas.ruleHealthInput.title, "ZipZap Rule Health Input");
  assert.equal(catalogs.schemas.ruleHealthOutput.title, "ZipZap Rule Health Output");
  assert.equal(catalogs.schemas.ruleHealthIgnore.title, "ZipZap Rule Health Ignore");
});
