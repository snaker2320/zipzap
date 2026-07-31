import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  assessHost,
  assessLifecycle,
  buildReleaseManifest,
  loadCatalogs
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function compatibleHost() {
  return assessHost(
    {
      schema_version: 1,
      host_id: "lifecycle-host",
      surface: "test",
      capabilities: ["json-read"],
      limits: {
        concurrency_limit: 1,
        distinct_context_limit: 5
      },
      runtimes: [],
      tools: [],
      interfaces: {
        l5: [1],
        kernel: [1]
      }
    },
    "execute",
    null,
    catalogs
  );
}

test("builds a deterministic zero-dependency release manifest", () => {
  const first = buildReleaseManifest(catalogs);
  const second = buildReleaseManifest(catalogs);
  assert.deepEqual(first, second);
  assert.deepEqual(first.runtime_dependencies, []);
  assert.equal(first.skill.version, "0.1.1-beta.1");
  assert.equal(first.skill.channel, "beta");
  assert.equal(
    first.files.some((file) => file.path === "SKILL.md"),
    true
  );
  assert.equal(
    first.files.some((file) => file.path === "agents/openai.yaml"),
    true
  );
  assert.equal(
    first.files.some((file) => file.path === "scripts/task.mjs"),
    true
  );
  assert.equal(
    first.files.some((file) => file.path === "config/onboarding.json"),
    true
  );
  assert.equal(
    first.files.some((file) => file.path === "examples/zipzap/invoke.json"),
    true
  );
  assert.equal(
    first.files.some((file) => file.path === "examples/task/create.json"),
    true
  );
  assert.equal(
    first.files.some(
      (file) => file.path === "schemas/onboarding-output.schema.json"
    ),
    true
  );
  assert.equal(
    first.files.some(
      (file) =>
        file.path === "README.md" || file.path.startsWith("tests/")
    ),
    false
  );
  assert.deepEqual(
    first.files.map((file) => file.path),
    first.files.map((file) => file.path).sort()
  );
});

test("verifies a release manifest against current package bytes", () => {
  const result = assessLifecycle(
    {
      schema_version: 1,
      operation: "verify-release",
      release_manifest: buildReleaseManifest(catalogs)
    },
    catalogs
  );
  assert.equal(result.status, "ready");
  assert.equal(result.allowed, true);
  assert.deepEqual(result.required_actions, []);
});

test("blocks a release manifest with a changed hash", () => {
  const manifest = clone(buildReleaseManifest(catalogs));
  manifest.files[0].sha256 = "0".repeat(64);
  const result = assessLifecycle(
    {
      schema_version: 1,
      operation: "verify-release",
      release_manifest: manifest
    },
    catalogs
  );
  assert.equal(result.status, "blocked");
  assert.equal(result.allowed, false);
  assert.equal(
    result.checks.find((check) => check.id === "package-inventory").passed,
    false
  );
});

test("rejects a release channel that disagrees with the semantic version", () => {
  const manifest = clone(buildReleaseManifest(catalogs));
  manifest.skill.channel = "development";
  assert.throws(
    () =>
      assessLifecycle(
        {
          schema_version: 1,
          operation: "verify-release",
          release_manifest: manifest
        },
        catalogs
      ),
    /channel development does not match version 0\.1\.1-beta\.1/
  );
});

test("upgrades both beta archive and misreported internal versions", () => {
  const host = compatibleHost();
  for (const installedVersion of ["0.1.0-beta.1", "0.1.0"]) {
    const result = assessLifecycle(
      {
        schema_version: 1,
        operation: "upgrade",
        installed_version: installedVersion,
        target_version: "0.1.1-beta.1",
        host_conformance: host
      },
      catalogs
    );
    assert.equal(result.allowed, true, installedVersion);
    assert.deepEqual(result.migration_plan, []);
  }
});

test("allows installation without initializing project state", () => {
  const result = assessLifecycle(
    {
      schema_version: 1,
      operation: "install",
      target_version: catalogs.lifecycle.skill.current_version,
      host_conformance: compatibleHost()
    },
    catalogs
  );
  assert.equal(result.allowed, true);
  assert.equal(result.release_manifest, null);
  assert.equal(
    catalogs.lifecycle.policies.installation_does_not_initialize_project,
    true
  );
});

test("requires every release gate before publication", () => {
  const manifest = buildReleaseManifest(catalogs);
  const blocked = assessLifecycle(
    {
      schema_version: 1,
      operation: "publish",
      release_manifest: manifest,
      evidence: []
    },
    catalogs
  );
  assert.equal(blocked.allowed, false);

  const ready = assessLifecycle(
    {
      schema_version: 1,
      operation: "publish",
      release_manifest: manifest,
      evidence: catalogs.lifecycle.release_gates.map((gate) => ({
        gate,
        status: "passed",
        evidence_ref: `test:${gate}`
      }))
    },
    catalogs
  );
  assert.equal(ready.allowed, true);
});

test("blocks same-version upgrade and unknown rollback target", () => {
  const host = compatibleHost();
  const current = catalogs.lifecycle.skill.current_version;
  const upgrade = assessLifecycle(
    {
      schema_version: 1,
      operation: "upgrade",
      installed_version: current,
      target_version: current,
      host_conformance: host
    },
    catalogs
  );
  assert.equal(upgrade.allowed, false);
  assert.equal(
    upgrade.checks.find((check) => check.id === "version-direction").passed,
    false
  );

  const rollback = assessLifecycle(
    {
      schema_version: 1,
      operation: "rollback",
      installed_version: current,
      target_version: "0.0.0",
      host_conformance: host,
      backup_available: true,
      project_state_preserved: true
    },
    catalogs
  );
  assert.equal(rollback.allowed, false);
  assert.equal(
    rollback.checks.find((check) => check.id === "rollback-target-known").passed,
    false
  );
});

test("registers the L7 lifecycle schemas and policies", () => {
  assert.equal(
    catalogs.schemas.releaseManifest.title,
    "ZipZap L7 Release Manifest"
  );
  assert.equal(
    catalogs.schemas.lifecycleInput.title,
    "ZipZap L7 Lifecycle Request"
  );
  assert.equal(
    catalogs.schemas.lifecycleOutput.title,
    "ZipZap L7 Lifecycle Result"
  );
  assert.equal(
    Object.values(catalogs.lifecycle.policies).every(Boolean),
    true
  );
});

test("exposes safe release-plan and install-check entry points", () => {
  const releasePlan = JSON.parse(
    execFileSync("node", ["scripts/zipzap.mjs", "release-plan"], {
      encoding: "utf8"
    })
  );
  assert.equal(releasePlan.operation, "build-release");
  assert.equal(releasePlan.allowed, true);
  assert.equal(releasePlan.release_manifest.runtime_dependencies.length, 0);

  const installCheck = JSON.parse(
    execFileSync(
      "node",
      ["scripts/zipzap.mjs", "install-check"],
      {
        encoding: "utf8",
        input: JSON.stringify(compatibleHost())
      }
    )
  );
  assert.equal(installCheck.operation, "install");
  assert.equal(installCheck.allowed, true);
});
