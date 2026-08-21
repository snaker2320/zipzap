import assert from "node:assert/strict";
import crypto from "node:crypto";
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
    schema_version: 2,
    project_id: "example",
    sources,
    capabilities: [],
    ...overrides
  };
}

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function capabilityProfile(overrides = {}) {
  return {
    schema_version: 1,
    id: "java-development",
    revision: 1,
    status: "active",
    facts: [],
    selectors: {},
    source_refs: [],
    module_ids: [],
    context_budget: { max_facts: 4, max_source_refs: 4 },
    profile_digest: `sha256:${"a".repeat(64)}`,
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

function materializeSources(root, count) {
  fs.mkdirSync(path.join(root, "docs", "standards"), { recursive: true });
  return Array.from({ length: count }, (_, index) => {
    const locator = `docs/standards/source-${index}.md`;
    fs.writeFileSync(path.join(root, locator), `# Source ${index}\n`);
    return source({
      id: `source-${index}`,
      locator,
      owner: "engineering",
      authority: "engineering",
      version: null,
      priority: count - index
    });
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
  assert.match(help, /quick.*standard.*deep/is);
  assert.match(help, /diagnosis is read-only/i);
  assert.match(help, /ignore.*restore.*write/is);

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
  assert.equal(
    catalogs.schemas.ruleHealthInput.properties.semantic_budget.properties
      .max_source_files.maximum,
    100
  );
  assert.equal(
    catalogs.schemas.ruleHealthInput.properties.semantic_assessment.properties
      .findings.type,
    "array"
  );
});

test("bounds standard semantic candidates and discloses omitted sources", (context) => {
  const root = project(context);
  const projectManifest = manifest(materializeSources(root, 10));

  const result = diagnose(root, projectManifest, { depth: "standard" });

  assert.equal(result.depth, "standard");
  assert.equal(result.semantic_review_request.budget.max_source_files, 8);
  assert.equal(result.semantic_review_request.selected_sources.length, 8);
  assert.equal(result.semantic_review_request.omitted_sources, 2);
  assert.equal(result.semantic_review_request.claim_limit, "advisory");
});

test("requires and enforces an explicit deep semantic source budget", (context) => {
  const root = project(context);
  const projectManifest = manifest(materializeSources(root, 12));

  assert.throws(
    () => diagnose(root, projectManifest, { depth: "deep" }),
    /deep.*max_source_files/i
  );
  const result = diagnose(root, projectManifest, {
    depth: "deep",
    semantic_budget: { max_source_files: 10 }
  });
  assert.equal(result.semantic_review_request.selected_sources.length, 10);
  assert.equal(result.semantic_review_request.omitted_sources, 2);
});

test("validates and merges evidence-backed semantic assessment findings", (context) => {
  const root = project(context);
  const sources = materializeSources(root, 2);
  const projectManifest = manifest(sources);
  const semanticFinding = {
    category: "semantic-duplicate",
    severity: "medium",
    confidence: "high",
    source_refs: [
      { source_id: "source-0", heading: "Rules" },
      { source_id: "source-1", heading: "Rules" }
    ],
    evidence: [
      { id: "duplicate-rule", source_id: "source-0", heading: "Rules" }
    ],
    impact: "The same rule may diverge across documents.",
    recommendation: "Keep one authoritative rule and replace the other with a reference."
  };

  const result = diagnose(root, projectManifest, {
    depth: "standard",
    semantic_assessment: { findings: [semanticFinding] }
  });
  const merged = result.findings.find(
    (finding) => finding.category === "semantic-duplicate"
  );
  assert.match(merged.fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(merged.source_refs.length, 2);

  const invalid = structuredClone(semanticFinding);
  invalid.source_refs[1].source_id = "unknown-source";
  assert.throws(
    () =>
      diagnose(root, projectManifest, {
        depth: "standard",
        semantic_assessment: { findings: [invalid] }
      }),
    /unknown-source/
  );
});

test("reports stale and overbroad capability profiles only on explicit diagnosis", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  const content = "java.version=21\n";
  fs.writeFileSync(path.join(root, "config", "java.properties"), content);
  const projectManifest = manifest(
    [
      source({
        id: "java-configuration",
        locator: "config/java.properties",
        version: sha256(content),
        owner: "engineering",
        authority: "build-configuration"
      })
    ],
    {
      capabilities: [
        {
          id: "java-development",
          locator: ".zipzap/capabilities/java-development.json",
          enabled: true
        }
      ]
    }
  );
  const result = diagnose(root, projectManifest, {
    capability_profiles: [
      capabilityProfile({
        facts: [
          {
            key: "java-version",
            value: "17",
            source_id: "java-configuration",
            evidence: "config/java.properties:java.version",
            source_digest: `sha256:${"0".repeat(64)}`
          }
        ]
      })
    ]
  });
  const categories = result.findings.map((item) => item.category);

  assert.equal(categories.includes("stale-capability-fact"), true);
  assert.equal(categories.includes("overbroad-capability-selector"), true);
});

test("reports missing capability modules and exceeded profile budgets", (context) => {
  const root = project(context);
  const result = diagnose(root, manifest([]), {
    capability_profiles: [
      capabilityProfile({
        facts: [
          {
            key: "build-tool",
            value: "maven",
            source_id: "missing-source",
            evidence: "pom.xml:project",
            source_digest: `sha256:${"1".repeat(64)}`
          }
        ],
        module_ids: ["capability:missing-module"],
        context_budget: { max_facts: 0, max_source_refs: 0 }
      })
    ],
    known_module_ids: ["role:developer"]
  });
  const categories = result.findings.map((item) => item.category);

  assert.equal(categories.includes("missing-capability-source"), true);
  assert.equal(categories.includes("missing-capability-module"), true);
  assert.equal(categories.includes("capability-context-budget-exceeded"), true);
});
