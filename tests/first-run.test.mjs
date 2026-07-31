import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  loadCatalogs,
  runFirstRun
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-first-run-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "docs"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "docs", "development.md"),
    "# Development\n"
  );
  return {
    id: "example",
    locator: root
  };
}

function submit(started, answers) {
  return runFirstRun(
    {
      schema_version: 1,
      operation: "submit",
      state: started.state,
      expected_revision: started.state.revision,
      answers
    },
    catalogs
  );
}

function confirm(preview) {
  return runFirstRun(
    {
      schema_version: 1,
      operation: "confirm",
      state: preview.state,
      expected_revision: preview.state.revision
    },
    catalogs
  );
}

test("guides discovery and visible preferences before one project write", (context) => {
  const projectInput = project(context);
  const manifestPath = path.join(
    projectInput.locator,
    ".zipzap",
    "project.json"
  );
  const started = runFirstRun(
    {
      schema_version: 1,
      operation: "start",
      presentation: "form",
      project: projectInput
    },
    catalogs
  );

  assert.equal(started.status, "decision-required");
  assert.equal(started.write_performed, false);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.deepEqual(
    started.form.fields
      .filter((field) => field.group === "core")
      .map((field) => field.id),
    ["scope", "response-detail", "humor", "preferred-preset"]
  );
  assert.equal(started.discovery.sources.length, 1);

  const preview = submit(started, {
    scope: "project",
    response_detail: "detailed",
    humor: "playful",
    preferred_preset: "copilot",
    team_tone: "lively",
    signatures: "visible"
  });
  assert.equal(preview.status, "preview-ready");
  assert.equal(preview.write_performed, false);
  assert.equal(fs.existsSync(manifestPath), false);
  assert.equal(
    preview.preview.preferences.configuration.personalization.humor,
    "playful"
  );
  assert.equal(preview.preview.project_storage.manifest, ".zipzap/project.json");

  const completed = confirm(preview);
  assert.equal(completed.status, "completed");
  assert.equal(completed.write_performed, true);
  assert.equal(completed.post_check.preferences_visible_before_write, true);
  assert.equal(completed.post_check.single_manifest_write, true);
  const stored = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(stored.revision, 1);
  assert.equal(stored.sources.length, 1);
  assert.equal(stored.collaboration.preferred_preset, "copilot");
  assert.equal(stored.collaboration.personalization.humor, "playful");

  const repeated = runFirstRun(
    {
      schema_version: 1,
      operation: "start",
      project: projectInput
    },
    catalogs
  );
  assert.equal(repeated.status, "blocked");
  assert.match(repeated.required_actions.join(" "), /onboard/);
});

test("requires a refreshed preview when sources change before confirmation", (context) => {
  const projectInput = project(context);
  const started = runFirstRun(
    {
      schema_version: 1,
      operation: "start",
      project: projectInput
    },
    catalogs
  );
  const preview = submit(started, {
    scope: "project",
    response_detail: "balanced",
    humor: "light",
    preferred_preset: "auto",
    team_tone: "balanced",
    signatures: "hidden"
  });
  fs.writeFileSync(
    path.join(projectInput.locator, "docs", "testing.md"),
    "# Testing\n"
  );

  const refreshed = confirm(preview);
  assert.equal(refreshed.status, "preview-ready");
  assert.equal(refreshed.write_performed, false);
  assert.equal(refreshed.discovery.sources.length, 2);
  assert.match(refreshed.warnings[0], /changed/);

  const completed = confirm(refreshed);
  assert.equal(completed.status, "completed");
  assert.equal(completed.initialization.sources.length, 2);
});

test("exposes First Run through CLI help, example, and schemas", () => {
  const help = execFileSync(
    "node",
    ["scripts/zipzap.mjs", "first-run", "--help"],
    { encoding: "utf8" }
  );
  assert.match(help, /schemas\/first-run-input\.schema\.json/);
  const example = JSON.parse(
    execFileSync(
      "node",
      ["scripts/zipzap.mjs", "first-run", "--example", "--compact"],
      { encoding: "utf8" }
    )
  );
  assert.equal(example.operation, "start");
  assert.equal(catalogs.schemas.firstRunInput.title, "ZipZap First Run Input");
  assert.equal(
    catalogs.schemas.firstRunOutput.title,
    "ZipZap First Run Output"
  );
  assert.equal(
    catalogs.onboarding.policies.core_preferences_visible_before_confirm,
    true
  );
  assert.equal(
    catalogs.onboarding.policies.embedded_first_run_single_write,
    true
  );
});

test("completes First Run through the serialized CLI contract", (context) => {
  const projectInput = project(context);
  const run = (input) =>
    JSON.parse(
      execFileSync(
        "node",
        ["scripts/zipzap.mjs", "first-run", "--compact"],
        {
          encoding: "utf8",
          input: JSON.stringify(input)
        }
      )
    );
  const started = run({
    schema_version: 1,
    operation: "start",
    presentation: "form",
    project: projectInput
  });
  const preview = run({
    schema_version: 1,
    operation: "submit",
    state: started.state,
    expected_revision: started.state.revision,
    answers: {
      scope: "project",
      response_detail: "concise",
      humor: "off",
      preferred_preset: "solo"
    }
  });
  const completed = run({
    schema_version: 1,
    operation: "confirm",
    state: preview.state,
    expected_revision: preview.state.revision
  });

  assert.equal(completed.status, "completed");
  assert.equal(completed.configuration.personalization.humor, "off");
  assert.equal(completed.configuration.preferred_preset, "solo");
});
