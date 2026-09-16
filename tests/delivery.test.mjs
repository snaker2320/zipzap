import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readData } from "../scripts/lib/data-files.mjs";
import { validateSchemaFile } from "../scripts/lib/schema-registry.mjs";
import {
  assessDelivery,
  planDelivery
} from "../scripts/lib/delivery.mjs";
import { consolidateIssues } from "../scripts/lib/workflow.mjs";

const catalog = readData(path.resolve("config/delivery.yml"));
const artifactSha = `sha256:${"b".repeat(64)}`;

function project(context, metadata = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-delivery-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "package.json"), `${JSON.stringify(metadata, null, 2)}\n`);
  return root;
}

function developmentInput(root) {
  return {
    schema_version: 1,
    project: { locator: root },
    environment: { kind: "development", target: "local", shared: false },
    commands: {
      "build.execute": { command: "npm run build", source: "package.json" },
      "build.verify-artifact": { command: "npm run verify:artifact", source: "package.json" },
      "deploy.apply": { command: "npm run start", source: "package.json" },
      "deploy.probe": { command: "npm run health", source: "package.json" }
    }
  };
}

function passedEvidence(input) {
  return Object.fromEntries(
    Object.entries(input.commands).map(([slot, command]) => [
      slot,
      {
        status: "passed",
        command: command.command,
        evidence_ref: `host:${slot}`,
        artifact_sha256: artifactSha,
        ...(slot.startsWith("deploy.") ? { target: input.environment.target } : {})
      }
    ])
  );
}

test("delivery discovery guides but does not authorize project commands", (context) => {
  const root = project(context, {
    scripts: {
      build: "node build.mjs",
      start: "node server.mjs",
      health: "node health.mjs"
    }
  });
  const result = planDelivery({
    schema_version: 1,
    project: { locator: root },
    environment: { kind: "development", target: "local" }
  }, catalog);
  assert.equal(result.allowed, false);
  assert.deepEqual(
    result.candidates.map((item) => item.slot),
    ["build.execute", "deploy.apply", "deploy.probe"]
  );
  assert.ok(result.candidates.every((item) => item.requires_confirmation));
  assert.ok(result.missing_required.includes("build.verify-artifact"));
});

test("delivery contract rejects production targets", () => {
  const result = validateSchemaFile(path.resolve("."), "schemas/delivery-input.schema.yml", {
    schema_version: 1,
    project: { locator: "." },
    environment: { kind: "production", target: "prod" }
  });
  assert.equal(result.valid, false);
});

test("development delivery plan accepts an explicit minimum mapping", (context) => {
  const input = developmentInput(project(context));
  const result = planDelivery(input, catalog);
  assert.equal(result.status, "ready");
  assert.equal(result.allowed, true);
  assert.deepEqual(result.missing_required, []);
  assert.ok(result.missing_recommended.includes("deploy.rollback"));
  assert.equal(
    validateSchemaFile(path.resolve("."), "schemas/delivery-output.schema.yml", result).valid,
    true
  );
});

test("delivery assessment requires bound readiness evidence", (context) => {
  const input = developmentInput(project(context));
  const evidence = passedEvidence(input);
  evidence["deploy.probe"] = {
    ...evidence["deploy.probe"],
    status: "failed"
  };
  const result = assessDelivery({
    ...input,
    artifact: {
      locator: "dist/app.tar.gz",
      commit_sha: "a".repeat(40),
      sha256: artifactSha
    },
    evidence
  }, catalog);
  assert.equal(result.status, "blocked");
  assert.ok(result.issues.some((item) => item.fingerprint === "delivery:deploy.probe:evidence-failed"));
  assert.equal(result.issues.find((item) => item.fingerprint === "delivery:deploy.probe:evidence-failed").return_to, "deploy");
  assert.ok(result.next_actions.some((item) => item.includes("readiness")));
});

test("delivery assessment passes only when command artifact and target bindings match", (context) => {
  const input = developmentInput(project(context));
  const result = assessDelivery({
    ...input,
    artifact: {
      locator: "dist/app.tar.gz",
      commit_sha: "a".repeat(40),
      sha256: artifactSha
    },
    evidence: Object.fromEntries(
      Object.entries(passedEvidence(input)).filter(([slot]) => slot !== "deploy.rollback")
    )
  }, catalog);
  assert.equal(result.status, "passed");
  assert.equal(result.allowed, true);
  assert.deepEqual(result.issues, []);
});

test("shared test deployment requires rollback mapping and authorization", (context) => {
  const root = project(context);
  const input = {
    schema_version: 1,
    project: { locator: root },
    environment: { kind: "test", target: "shared-test", shared: true },
    commands: {
      "build.execute": { command: "make build" },
      "build.verify-artifact": { command: "make verify-artifact" },
      "deploy.precheck": { command: "make predeploy" },
      "deploy.apply": { command: "make deploy" },
      "deploy.probe": { command: "make probe" },
      "deploy.smoke": { command: "make smoke" },
      "deploy.rollback": { command: "make rollback", destructive: true }
    }
  };
  const blocked = assessDelivery({
    ...input,
    artifact: {
      locator: "dist/app.tar.gz",
      commit_sha: "a".repeat(40),
      sha256: artifactSha
    },
    evidence: Object.fromEntries(
      Object.entries(passedEvidence(input)).filter(([slot]) => slot !== "deploy.rollback")
    )
  }, catalog);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.checks.find((item) => item.id === "authorization").passed, false);
  const passed = assessDelivery({
    ...input,
    artifact: {
      locator: "dist/app.tar.gz",
      commit_sha: "a".repeat(40),
      sha256: artifactSha
    },
    evidence: Object.fromEntries(
      Object.entries(passedEvidence(input)).filter(([slot]) => slot !== "deploy.rollback")
    ),
    authorization: { status: "passed", evidence_ref: "user-approved-shared-test" }
  }, catalog);
  assert.equal(passed.allowed, true);
  assert.equal(passed.checks.some((item) => item.id === "evidence:deploy.rollback"), false);
});

test("an available destructive rollback does not require authorization unless executed", (context) => {
  const input = developmentInput(project(context));
  input.commands["deploy.rollback"] = {
    command: "npm run stop",
    destructive: true
  };
  const evidence = passedEvidence(input);
  evidence["deploy.rollback"].status = "not-run";
  const result = assessDelivery({
    ...input,
    artifact: {
      locator: "dist/app.tar.gz",
      commit_sha: "a".repeat(40),
      sha256: artifactSha
    },
    evidence
  }, catalog);
  assert.equal(result.allowed, true);
  assert.equal(result.checks.some((item) => item.id === "authorization"), false);
});

test("repeated delivery failures can feed a bounded standards proposal", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "standards", "delivery"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "standards", "delivery", "deployment.md"),
    "# Deployment\n"
  );
  const input = developmentInput(root);
  const failing = passedEvidence(input);
  failing["deploy.probe"] = {
    ...failing["deploy.probe"],
    status: "failed"
  };
  const artifact = {
    locator: "dist/app.tar.gz",
    commit_sha: "a".repeat(40),
    sha256: artifactSha
  };
  const first = assessDelivery({ ...input, artifact, evidence: failing, checkpoint: "checkpoint-a" }, catalog);
  const second = assessDelivery({ ...input, artifact, evidence: failing, checkpoint: "checkpoint-b" }, catalog);
  const fingerprint = "delivery:deploy.probe:evidence-failed";
  const result = consolidateIssues({
    schema_version: 2,
    issues: [
      first.issues.find((item) => item.fingerprint === fingerprint),
      second.issues.find((item) => item.fingerprint === fingerprint)
    ]
  });
  assert.equal(result.proposals[0].target, "standards/delivery/deployment.md");
  assert.equal(result.proposals[0].action, "merge");
  assert.equal(result.proposals[0].auto_apply, false);
});
