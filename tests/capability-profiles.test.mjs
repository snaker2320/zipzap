import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessCapabilityProfile,
  capabilityProfileDigest,
  loadCapabilityProfiles,
  matchCapabilityProfiles,
  validateCapabilityProfile
} from "../scripts/lib/capability-profiles.mjs";
import { loadCatalogs } from "../scripts/zipzap.mjs";

const MAVEN_DIGEST = `sha256:${"a".repeat(64)}`;
const RULE_DIGEST = `sha256:${"b".repeat(64)}`;

function javaProfile(overrides = {}) {
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
      stages: ["produce", "verify", "review"],
      actions: ["implement", "verify", "review"],
      components: ["backend"],
      file_patterns: ["**/*.java", "pom.xml"]
    },
    source_refs: [
      { source_id: "backend-standard", section: "Java development" }
    ],
    module_ids: [],
    context_budget: { max_facts: 8, max_source_refs: 4 },
    ...overrides
  };
  profile.profile_digest = capabilityProfileDigest(profile);
  return profile;
}

test("accepts a bounded provenanced project capability", () => {
  const profile = validateCapabilityProfile(javaProfile());

  assert.equal(profile.id, "java-development");
  assert.equal(profile.facts[0].value, "17");
});

test("rejects copied prose and non-scalar facts", () => {
  const copied = javaProfile({ instructions: "Always use Java 17" });
  copied.profile_digest = capabilityProfileDigest(copied);
  assert.throws(
    () => validateCapabilityProfile(copied),
    /unknown capability profile field: instructions/i
  );

  const nonScalar = javaProfile();
  nonScalar.facts[0].value = { version: "17" };
  nonScalar.profile_digest = capabilityProfileDigest(nonScalar);
  assert.throws(
    () => validateCapabilityProfile(nonScalar),
    /fact value must be a JSON scalar/i
  );
});

test("loads only enabled profiles contained by the project root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-capability-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".zipzap/capabilities"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".zipzap/capabilities/java-development.json"),
    `${JSON.stringify(javaProfile(), null, 2)}\n`
  );

  const loaded = loadCapabilityProfiles(root, [
    {
      id: "java-development",
      locator: ".zipzap/capabilities/java-development.json",
      enabled: true
    },
    {
      id: "unused",
      locator: ".zipzap/capabilities/unused.json",
      enabled: false
    }
  ]);
  assert.deepEqual(loaded.map((profile) => profile.id), ["java-development"]);

  assert.throws(
    () =>
      loadCapabilityProfiles(root, [
        { id: "java-development", locator: "../java.json", enabled: true }
      ]),
    /escapes project root/i
  );
});

test("matches selectors and permits an explicit enabled capability", () => {
  const profile = javaProfile();
  const selected = matchCapabilityProfiles([profile], {
    explicit: [],
    role: "developer",
    stage: "produce",
    action: "implement",
    components: ["backend"],
    files: ["src/main/java/App.java"]
  });
  assert.deepEqual(selected.selected.map((item) => item.id), [
    "java-development"
  ]);

  const unrelated = matchCapabilityProfiles([profile], {
    explicit: [],
    role: "product",
    stage: "frame",
    action: "define",
    components: [],
    files: ["docs/business/quote.md"]
  });
  assert.deepEqual(unrelated.selected, []);
  assert.equal(unrelated.rejected[0].reason, "selector-mismatch");

  const explicit = matchCapabilityProfiles([profile], {
    explicit: ["java-development"],
    role: "product",
    stage: "frame",
    action: "define",
    components: [],
    files: []
  });
  assert.deepEqual(explicit.selected.map((item) => item.id), [
    "java-development"
  ]);
});

test("assesses source fingerprints without changing the profile", () => {
  const profile = javaProfile();
  const before = structuredClone(profile);
  const current = assessCapabilityProfile(profile, "/project", {
    "maven-project": { id: "maven-project", version: MAVEN_DIGEST },
    "backend-standard": { id: "backend-standard", version: RULE_DIGEST }
  });
  assert.equal(current.status, "current");

  const stale = assessCapabilityProfile(profile, "/project", {
    "maven-project": {
      id: "maven-project",
      version: `sha256:${"c".repeat(64)}`
    },
    "backend-standard": { id: "backend-standard", version: RULE_DIGEST }
  });
  assert.equal(stale.status, "stale");
  assert.deepEqual(stale.changes.map((change) => change.source_id), [
    "maven-project"
  ]);
  assert.deepEqual(profile, before);
});

test("registers the capability profile schema in the catalog", () => {
  assert.equal(
    loadCatalogs().schemas.capabilityProfile.title,
    "ZipZap Project Capability Profile"
  );
});
