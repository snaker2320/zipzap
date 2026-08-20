import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

import {
  advanceOnboarding,
  loadCatalogs
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-onboarding-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return {
    id: "example",
    locator: root
  };
}

function submitForm(started, projectInput, answers) {
  return advanceOnboarding(
    {
      schema_version: 1,
      operation: "submit",
      project: projectInput,
      state: started.state,
      expected_revision: started.state.revision,
      answers
    },
    catalogs
  );
}

function confirm(preview, projectInput) {
  return advanceOnboarding(
    {
      schema_version: 1,
      operation: "confirm",
      project: projectInput,
      state: preview.state,
      expected_revision: preview.state.revision
    },
    catalogs
  );
}

test("exposes one page-ready form without requiring Plan mode", () => {
  const started = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      presentation: "form"
    },
    catalogs
  );

  assert.equal(started.status, "decision-required");
  assert.equal(started.form.fields.length, 6);
  assert.equal(started.question, undefined);
  assert.equal(started.decision_bundles.length, 1);
  assert.equal(started.decision_bundles[0].submit_mode, "atomic");
  assert.equal(started.decision_bundles[0].questions.length, 6);
  assert.equal(started.decision_interaction.must_pause, true);
  assert.equal(started.decision_interaction.presentation, "native-form");
  assert.deepEqual(started.decision_interaction.visible_question_ids, [
    "scope",
    "response-detail",
    "humor",
    "preferred-preset",
    "team-tone",
    "signatures"
  ]);
  assert.equal(catalogs.onboarding.policies.plan_mode_is_optional, true);
  assert.deepEqual(
    started.form.fields
      .filter((field) => field.group === "core")
      .map((field) => field.id),
    ["scope", "response-detail", "humor", "preferred-preset"]
  );
});

test("exposes onboarding through the zero-dependency CLI", () => {
  const result = JSON.parse(
    execFileSync("node", ["scripts/zipzap.mjs", "onboard", "--compact"], {
      encoding: "utf8",
      input: JSON.stringify({
        schema_version: 1,
        operation: "start",
        presentation: "form",
        scope: "user"
      })
    })
  );
  assert.equal(result.status, "decision-required");
  assert.equal(result.storage.target, "host-user-state");
  assert.equal(result.form.fields[0].kind, "single-select");
});

test("previews and confirms project preferences with revisions", (context) => {
  const projectInput = project(context);
  const started = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      presentation: "form",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  const preview = submitForm(started, projectInput, {
    response_detail: "detailed",
    humor: "playful",
    preferred_preset: "copilot",
    team_tone: "lively",
    signatures: "visible"
  });

  assert.equal(preview.status, "preview-ready");
  assert.equal(
    preview.decision_bundles[0].questions[0].kind,
    "confirm"
  );
  assert.equal(preview.write_performed, false);
  assert.equal(preview.preview.configuration.preferred_preset, "copilot");
  assert.equal(
    preview.preview.configuration.personalization.response_detail,
    "detailed"
  );
  assert.equal(
    fs.existsSync(path.join(projectInput.locator, ".zipzap", "project.json")),
    false
  );

  const completed = confirm(preview, projectInput);
  assert.equal(completed.status, "completed");
  assert.equal(completed.write_performed, true);
  assert.equal(completed.configuration_revision, 1);

  const manifestPath = path.join(
    projectInput.locator,
    ".zipzap",
    "project.json"
  );
  const stored = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(stored.revision, 1);
  assert.equal(stored.collaboration.preferred_preset, "copilot");
  assert.equal(stored.collaboration.personalization.humor, "playful");

  const reopened = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      presentation: "form",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  assert.equal(reopened.state.base_configuration_revision, 1);
  assert.equal(reopened.state.configuration.preferred_preset, "copilot");

  const changed = submitForm(reopened, projectInput, {
    humor: "off"
  });
  const updated = confirm(changed, projectInput);
  assert.equal(updated.configuration_revision, 2);
  const storedAgain = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  assert.equal(storedAgain.collaboration.personalization.humor, "off");
  assert.equal(storedAgain.collaboration.personalization.response_detail, "detailed");
});

test("supports stepwise conversation over the same contract", (context) => {
  const projectInput = project(context);
  let result = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      presentation: "stepwise",
      project: projectInput
    },
    catalogs
  );
  const answers = {
    scope: "project",
    "response-detail": "balanced",
    humor: "light",
    "preferred-preset": "auto",
    "team-tone": "balanced",
    signatures: "hidden"
  };

  while (result.status === "decision-required") {
    assert.equal(result.decision_bundles[0].submit_mode, "incremental");
    assert.equal(result.decision_bundles[0].questions.length, 1);
    assert.equal(result.decision_interaction.must_pause, true);
    assert.equal(result.decision_interaction.presentation, "stepwise");
    assert.deepEqual(result.decision_interaction.visible_question_ids, [
      result.question.id
    ]);
    result = advanceOnboarding(
      {
        schema_version: 1,
        operation: "answer",
        project: projectInput,
        state: result.state,
        expected_revision: result.state.revision,
        answer: {
          question_id: result.question.id,
          value: answers[result.question.id]
        }
      },
      catalogs
    );
  }

  assert.equal(result.status, "preview-ready");
  assert.equal(result.preview.scope, "project");
  assert.equal(result.preview.configuration.preferred_preset, "auto");
});

test("resets project overrides only after preview and confirmation", (context) => {
  const projectInput = project(context);
  const started = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  confirm(
    submitForm(started, projectInput, {
      preferred_preset: "trio",
      humor: "off"
    }),
    projectInput
  );

  const reset = advanceOnboarding(
    {
      schema_version: 1,
      operation: "reset",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  assert.equal(reset.status, "preview-ready");
  assert.equal(reset.write_performed, false);

  const completed = confirm(reset, projectInput);
  assert.equal(completed.configuration_revision, 2);
  const stored = JSON.parse(
    fs.readFileSync(
      path.join(projectInput.locator, ".zipzap", "project.json"),
      "utf8"
    )
  );
  assert.equal(stored.collaboration, undefined);
});

test("resetting an unconfigured project is a no-op", (context) => {
  const projectInput = project(context);
  const reset = advanceOnboarding(
    {
      schema_version: 1,
      operation: "reset",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  const completed = confirm(reset, projectInput);
  assert.equal(completed.write_performed, false);
  assert.equal(completed.configuration_revision, 0);
  assert.equal(
    fs.existsSync(path.join(projectInput.locator, ".zipzap", "project.json")),
    false
  );
});

test("returns user settings to the host without writing project state", () => {
  const started = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      presentation: "form",
      scope: "user"
    },
    catalogs
  );
  const preview = submitForm(started, null, {
    response_detail: "concise",
    preferred_preset: "auto"
  });
  const completed = confirm(preview, null);

  assert.equal(completed.status, "completed");
  assert.equal(completed.write_performed, false);
  assert.equal(completed.decision_interaction.must_pause, false);
  assert.equal(completed.decision_interaction.presentation, "none");
  assert.deepEqual(completed.storage, {
    scope: "user",
    target: "host-user-state",
    application_required: true
  });
  assert.equal(completed.limitations.length, 1);
});

test("blocks confirmation after a concurrent project change", (context) => {
  const projectInput = project(context);
  const started = advanceOnboarding(
    {
      schema_version: 1,
      operation: "start",
      scope: "project",
      project: projectInput
    },
    catalogs
  );
  const preview = submitForm(started, projectInput, {
    preferred_preset: "solo"
  });
  const manifestPath = path.join(
    projectInput.locator,
    ".zipzap",
    "project.json"
  );
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(
    manifestPath,
    `${JSON.stringify({
      schema_version: 2,
      project_id: "example",
      revision: 1,
      sources: [],
      capabilities: []
    }, null, 2)}\n`
  );

  assert.throws(
    () => confirm(preview, projectInput),
    /project configuration revision mismatch/
  );
});

test("registers onboarding policy and schemas", () => {
  assert.equal(catalogs.onboarding.schema_version, 1);
  assert.equal(
    catalogs.schemas.onboardingInput.title,
    "ZipZap Guided Onboarding Input"
  );
  assert.equal(
    catalogs.schemas.onboardingOutput.title,
    "ZipZap Guided Onboarding Output"
  );
  assert.equal(
    catalogs.schemas.decisionBundle.title,
    "ZipZap Decision Bundle"
  );
});
