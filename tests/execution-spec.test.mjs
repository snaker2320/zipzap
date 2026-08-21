import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { capabilityProfileDigest } from "../scripts/lib/capability-profiles.mjs";
import { buildExecutionSpec } from "../scripts/lib/execution-spec.mjs";
import {
  evaluateKernel,
  hydrateProjectCapabilities,
  invokeL5,
  loadCatalogs
} from "../scripts/zipzap.mjs";

const MAVEN_DIGEST = `sha256:${"a".repeat(64)}`;

function javaProfile() {
  const profile = {
    schema_version: 1,
    id: "java-development",
    revision: 1,
    status: "active",
    facts: [
      {
        key: "java-version",
        value: "17",
        source_id: "maven-project",
        evidence: "pom.xml:properties/maven.compiler.release",
        source_digest: MAVEN_DIGEST
      }
    ],
    selectors: {
      roles: ["developer", "tester", "reviewer"],
      actions: ["implement", "verify", "review"],
      components: ["backend"],
      file_patterns: ["**/*.java", "pom.xml"]
    },
    source_refs: [
      { source_id: "backend-standard", section: "Java development" }
    ],
    module_ids: [],
    context_budget: { max_facts: 4, max_source_refs: 3 }
  };
  profile.profile_digest = capabilityProfileDigest(profile);
  return profile;
}

function sources() {
  return [
    {
      id: "maven-project",
      locator: "pom.xml",
      version: MAVEN_DIGEST,
      topics: ["coding", "testing"]
    },
    {
      id: "backend-standard",
      locator: "docs/standards/backend.md",
      version: `sha256:${"b".repeat(64)}`,
      topics: ["coding"]
    }
  ];
}

test("builds a minimal Java execution spec from project evidence", () => {
  const spec = buildExecutionSpec({
    work: {
      objective: "change quote service",
      action: "implement",
      files: ["src/main/java/Quote.java"],
      components: ["backend"]
    },
    participant: { role: "developer", stage: "produce" },
    profiles: [javaProfile()],
    sources: sources(),
    governance: {
      risk_flags: [],
      required_gates: [],
      required_evidence: ["tests"]
    },
    revisions: { binding: 1, projection: 1 }
  });

  assert.deepEqual(spec.capability_profile_ids, ["java-development"]);
  assert.deepEqual(spec.facts, [
    {
      key: "java-version",
      value: "17",
      source_id: "maven-project",
      evidence: "pom.xml:properties/maven.compiler.release",
      source_digest: MAVEN_DIGEST
    }
  ]);
  assert.deepEqual(
    spec.source_refs.map((item) => item.source_id),
    ["backend-standard", "maven-project"]
  );
});

test("does not load Java context for product framing", () => {
  const spec = buildExecutionSpec({
    work: {
      objective: "frame quote behavior",
      action: "define",
      files: ["docs/business/quote.md"],
      components: []
    },
    participant: { role: "product", stage: "frame" },
    profiles: [javaProfile()],
    sources: sources(),
    governance: {
      risk_flags: [],
      required_gates: [],
      required_evidence: []
    }
  });

  assert.deepEqual(spec.capability_profile_ids, []);
  assert.deepEqual(spec.facts, []);
  assert.deepEqual(spec.source_refs, []);
});

test("blocks a selected profile whose required source is missing", () => {
  const spec = buildExecutionSpec({
    work: {
      objective: "change quote service",
      action: "implement",
      files: ["src/Quote.java"],
      components: ["backend"]
    },
    participant: { role: "developer", stage: "produce" },
    profiles: [javaProfile()],
    sources: sources().filter((source) => source.id !== "backend-standard"),
    governance: { risk_flags: [], required_gates: [], required_evidence: [] }
  });

  assert.deepEqual(spec.unresolved, [
    "java-development requires missing source backend-standard"
  ]);
});

test("projects selected capability facts into the accountable action", () => {
  const result = evaluateKernel(
    {
      schema_version: 2,
      work: {
        id: "java-work",
        objective: "change quote service",
        requested_action: "implement",
        scope: [],
        affected_components: ["backend"],
        affected_files: ["src/main/java/Quote.java"]
      },
      governance: {
        risk_flags: [],
        required_gates: [],
        required_evidence: ["tests"],
        project_sources: sources(),
        capability_profiles: [javaProfile()],
        capability_assessments: {
          "java-development": { status: "current", changes: [] }
        }
      },
      host: {
        concurrency_limit: 2,
        distinct_context_limit: 5,
        multi_agent_authorization: "granted"
      },
      state: { current_role: "developer", current_stage: "produce" }
    },
    loadCatalogs()
  );

  assert.equal(result.status, "ready");
  assert.deepEqual(
    result.next_action.instructions.capability_profiles.map((item) => item.id),
    ["java-development"]
  );
  assert.equal(
    result.next_action.instructions.capability_facts[0].key,
    "java-version"
  );
  assert.deepEqual(
    result.next_action.source_locators.map((item) => item.id).sort(),
    ["backend-standard", "maven-project"]
  );
});

test("hydrates a stale profile ephemerally without writing project state", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cap-work-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".zipzap/capabilities"), { recursive: true });
  fs.writeFileSync(path.join(root, "pom.xml"), "original\n");
  const storedProfile = javaProfile();
  storedProfile.facts[0].source_digest = MAVEN_DIGEST;
  storedProfile.profile_digest = capabilityProfileDigest(storedProfile);
  fs.writeFileSync(
    path.join(root, ".zipzap/capabilities/java-development.json"),
    `${JSON.stringify(storedProfile, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, ".zipzap/project.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        project_id: "example",
        revision: 1,
        sources: [
          {
            id: "maven-project",
            locator: "pom.xml",
            topics: ["coding"],
            version: MAVEN_DIGEST
          },
          {
            id: "backend-standard",
            locator: "pom.xml",
            topics: ["coding"],
            version: MAVEN_DIGEST
          }
        ],
        capabilities: [
          {
            id: "java-development",
            locator: ".zipzap/capabilities/java-development.json",
            enabled: true
          }
        ]
      },
      null,
      2
    )}\n`
  );
  const before = fs.readFileSync(
    path.join(root, ".zipzap/capabilities/java-development.json"),
    "utf8"
  );
  fs.writeFileSync(path.join(root, "pom.xml"), "changed\n");

  const hydrated = hydrateProjectCapabilities(root);

  assert.equal(
    hydrated.assessments["java-development"].status,
    "stale"
  );
  assert.deepEqual(hydrated.overlays["java-development"].facts, []);
  assert.equal(
    fs.readFileSync(
      path.join(root, ".zipzap/capabilities/java-development.json"),
      "utf8"
    ),
    before
  );
});

test("L5 Work hydrates project capabilities instead of trusting caller context", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cap-l5-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".zipzap/capabilities"), { recursive: true });
  const content = "project-java-17\n";
  const currentDigest = `sha256:${crypto
    .createHash("sha256")
    .update(content)
    .digest("hex")}`;
  fs.writeFileSync(path.join(root, "pom.xml"), content);
  const projectProfile = javaProfile();
  projectProfile.facts[0].source_digest = currentDigest;
  projectProfile.profile_digest = capabilityProfileDigest(projectProfile);
  fs.writeFileSync(
    path.join(root, ".zipzap/capabilities/java-development.json"),
    `${JSON.stringify(projectProfile, null, 2)}\n`
  );
  fs.writeFileSync(
    path.join(root, ".zipzap/project.json"),
    `${JSON.stringify(
      {
        schema_version: 2,
        project_id: "example",
        revision: 1,
        sources: [
          {
            id: "maven-project",
            locator: "pom.xml",
            topics: ["coding", "testing"],
            version: currentDigest
          },
          {
            id: "backend-standard",
            locator: "pom.xml",
            topics: ["coding"],
            version: currentDigest
          }
        ],
        capabilities: [
          {
            id: "java-development",
            locator: ".zipzap/capabilities/java-development.json",
            enabled: true
          }
        ]
      },
      null,
      2
    )}\n`
  );
  const request = {
    schema_version: 2,
    operation: "execute",
    request_id: "java-l5",
    project: { id: "example", locator: root },
    request: {
      objective: "change quote service",
      requested_action: "implement",
      affected_files: ["src/main/java/Quote.java"]
    }
  };
  const riskIds = Object.keys(loadCatalogs().riskTaxonomy.signals);
  const response = invokeL5({
    schema_version: 2,
    request,
    context: {
      risk_normalization: {
        schema_version: 1,
        work_id: "java-l5",
        affected_components: ["backend"],
        assessment_input: {
          schema_version: 1,
          taxonomy_version: 1,
          invocation: request,
          evidence: []
        },
        assessment: {
          schema_version: 1,
          taxonomy_version: 1,
          evaluated_signals: riskIds,
          present_signals: [],
          unknown_signals: []
        },
        host: {
          concurrency_limit: 2,
          distinct_context_limit: 5,
          multi_agent_authorization: "granted"
        },
        project_sources: []
      }
    }
  });

  assert.equal(response.ok, true, response.error?.message);
  assert.equal(response.status, "ready");
  assert.deepEqual(
    response.execution.instructions.capability_profiles.map((item) => item.id),
    ["java-development"]
  );
  assert.deepEqual(
    response.execution.source_locators.map((item) => item.id).sort(),
    ["backend-standard", "maven-project"]
  );
  assert.equal(response.rule_health, undefined);
  assert.equal(fs.existsSync(path.join(root, ".zipzap/rule-health")), false);
});
