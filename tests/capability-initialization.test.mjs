import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { capabilityProfileDigest } from "../scripts/lib/capability-profiles.mjs";
import {
  initializeProject,
  loadCatalogs,
  validateProjectManifest
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function profile(sourceDigest) {
  const value = {
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
        source_digest: sourceDigest
      }
    ],
    selectors: {
      roles: ["developer", "tester", "reviewer"],
      actions: ["implement", "verify", "review"],
      components: ["backend"],
      file_patterns: ["**/*.java", "pom.xml"]
    },
    source_refs: [{ source_id: "maven-project" }],
    module_ids: [],
    context_budget: { max_facts: 4, max_source_refs: 2 }
  };
  value.profile_digest = capabilityProfileDigest(value);
  return value;
}

function request(projectRoot, capabilityProfile) {
  return {
    schema_version: 2,
    operation: "initialize",
    project: { id: "example", locator: projectRoot },
    initialization: {
      action: "configure",
      persistence: "project",
      enabled_roles: ["developer", "tester", "reviewer"],
      sources: [
        {
          id: "maven-project",
          locator: "pom.xml",
          kind: "reference",
          format: "text",
          loading: "on-demand",
          topics: ["coding", "testing"]
        }
      ],
      capability_profiles: [capabilityProfile]
    }
  };
}

test("rejects Manifest v1 with a migration-required error", () => {
  assert.throws(
    () =>
      validateProjectManifest({
        schema_version: 1,
        project_id: "legacy",
        sources: []
      }),
    /migration-required/i
  );
});

test("previews then atomically registers confirmed capability profiles", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cap-init-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pom = "<project><properties><maven.compiler.release>17</maven.compiler.release></properties></project>\n";
  fs.writeFileSync(path.join(root, "pom.xml"), pom);
  const configure = request(root, profile(sha256(pom)));

  const preview = initializeProject(configure, catalogs);
  assert.equal(preview.status, "decision-required");
  assert.equal(preview.initialization.write_performed, false);
  assert.match(
    preview.initialization.preview_fingerprint,
    /^sha256:[a-f0-9]{64}$/
  );
  assert.deepEqual(
    preview.initialization.capability_profiles.map((item) => item.id),
    ["java-development"]
  );
  assert.equal(fs.existsSync(path.join(root, ".zipzap/project.json")), false);

  const completed = initializeProject(
    {
      ...configure,
      initialization: {
        ...configure.initialization,
        confirmation: {
          approved: true,
          preview_fingerprint: preview.initialization.preview_fingerprint
        }
      }
    },
    catalogs
  );
  assert.equal(completed.status, "completed");
  assert.equal(completed.initialization.write_performed, true);

  const storedManifest = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap/project.json"), "utf8")
  );
  assert.equal(storedManifest.schema_version, 2);
  assert.deepEqual(storedManifest.capabilities, [
    {
      id: "java-development",
      locator: ".zipzap/capabilities/java-development.json",
      enabled: true
    }
  ]);
  const storedProfile = JSON.parse(
    fs.readFileSync(
      path.join(root, ".zipzap/capabilities/java-development.json"),
      "utf8"
    )
  );
  assert.equal(storedProfile.profile_digest, profile(sha256(pom)).profile_digest);
  assert.match(
    fs.readFileSync(path.join(root, ".zipzap/.gitignore"), "utf8"),
    /\/cache\//
  );
});

test("rejects a stale capability confirmation without writing", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cap-stale-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const pom = "<project />\n";
  fs.writeFileSync(path.join(root, "pom.xml"), pom);
  const configure = request(root, profile(sha256(pom)));

  const result = initializeProject(
    {
      ...configure,
      initialization: {
        ...configure.initialization,
        confirmation: {
          approved: true,
          preview_fingerprint: `sha256:${"0".repeat(64)}`
        }
      }
    },
    catalogs
  );

  assert.equal(result.status, "decision-required");
  assert.match(result.initialization.unresolved.join(" "), /preview changed/i);
  assert.equal(fs.existsSync(path.join(root, ".zipzap/project.json")), false);
});

test("profiles declared Maven evidence into an Initialize preview", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-cap-discover-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "pom.xml"),
    "<project><properties><maven.compiler.release>21</maven.compiler.release></properties></project>\n"
  );

  const preview = initializeProject(
    {
      schema_version: 2,
      operation: "initialize",
      project: { id: "example", locator: root },
      initialization: {
        action: "configure",
        persistence: "project",
        sources: [
          {
            id: "maven-project",
            locator: "pom.xml",
            topics: ["coding", "testing"]
          }
        ]
      }
    },
    catalogs
  );

  assert.equal(preview.status, "decision-required");
  assert.deepEqual(
    Object.fromEntries(
      preview.initialization.capability_profiles[0].facts.map((fact) => [
        fact.key,
        fact.value
      ])
    ),
    { "build-tool": "maven", "java-version": "21" }
  );
  assert.equal(fs.existsSync(path.join(root, ".zipzap/project.json")), false);

  const confirmed = initializeProject(
    {
      schema_version: 2,
      operation: "initialize",
      project: { id: "example", locator: root },
      initialization: {
        action: "configure",
        persistence: "project",
        sources: [
          {
            id: "maven-project",
            locator: "pom.xml",
            topics: ["coding", "testing"]
          }
        ],
        confirmation: {
          approved: true,
          preview_fingerprint: preview.initialization.preview_fingerprint
        }
      }
    },
    catalogs
  );
  assert.equal(confirmed.status, "completed");
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(root, ".zipzap/project.json"), "utf8")
    ).capabilities[0].id,
    "java-development"
  );
});
