import assert from "node:assert/strict";
import test from "node:test";

import {
  adaptTask,
  invokeL5,
  loadCatalogs,
  prepareTaskAssessment
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();
const allSignals = Object.keys(catalogs.riskTaxonomy.signals);

function assessment({ present = [], unknown = [] } = {}) {
  return {
    schema_version: 1,
    taxonomy_version: 1,
    evaluated_signals: [...allSignals],
    present_signals: present.map((id) => ({
      id,
      evidence_refs: ["request.objective"],
      confidence: "high"
    })),
    unknown_signals: unknown.map((id) => ({
      id,
      question: `Clarify whether ${id} applies.`,
      required_authority: "project-owner",
      evidence_refs: []
    }))
  };
}

function task(overrides = {}) {
  return {
    schema_version: 1,
    task_id: "task-1",
    revision: 1,
    status: "ready",
    work: {
      intent: "Deliver a bounded change.",
      objective: "Implement the requested behavior.",
      scope: ["component-a"],
      requested_action: "modify",
      work_type: "development",
      affected_components: ["component-a"],
      constraints: [],
      acceptance_criteria: ["Tests pass."]
    },
    evidence: [
      {
        id: "project-rule",
        kind: "project-rule",
        locator: "docs/rules.md",
        statement: "Changes must be tested.",
        authority: "project"
      }
    ],
    ...overrides
  };
}

function adapterInput(taskValue, assessmentValue, overrides = {}) {
  return {
    schema_version: 1,
    action: "execute",
    task: taskValue,
    assessment: assessmentValue,
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 5
    },
    project_sources: [],
    state: {
      current_role: "developer",
      current_stage: "produce"
    },
    ...overrides
  };
}

function invokeEnvelope(taskValue, assessmentValue) {
  const assessmentInput = prepareTaskAssessment(taskValue, catalogs);
  return {
    schema_version: 1,
    request: assessmentInput.invocation,
    context: {
      risk_normalization: {
        schema_version: 1,
        work_id: taskValue.task_id,
        work_type: taskValue.work.work_type,
        affected_components: taskValue.work.affected_components,
        assessment_input: assessmentInput,
        assessment: assessmentValue,
        host: {
          concurrency_limit: 2,
          distinct_context_limit: 5
        },
        project_sources: [],
        state: {
          current_role: "developer",
          current_stage: "produce"
        }
      }
    }
  };
}

test("unified L5 invoke returns a ready execution view", () => {
  const taskValue = task();
  const response = invokeL5(
    invokeEnvelope(taskValue, assessment()),
    catalogs
  );
  assert.equal(response.ok, true);
  assert.equal(response.operation, "execute");
  assert.equal(response.status, "ready");
  assert.equal(response.execution.participant.profile, "owl");
  assert.equal(response.assurance.mode, "self");
  assert.deepEqual(response.continuation, {
    work_id: "task-1"
  });
});

test("unified L5 invoke returns risk decisions without entering L4", () => {
  const response = invokeL5(
    invokeEnvelope(
      task(),
      assessment({
        unknown: ["security-critical"]
      })
    ),
    catalogs
  );
  assert.equal(response.ok, true);
  assert.equal(response.status, "decision-required");
  assert.equal(response.execution, undefined);
  assert.equal(
    response.decisions_required[0].code,
    "risk-signal-unresolved"
  );
});

test("unified L5 invoke returns structured errors for mismatched input", () => {
  const envelope = invokeEnvelope(task(), assessment());
  envelope.request = JSON.parse(JSON.stringify(envelope.request));
  envelope.request.request.objective = "A different objective.";
  const response = invokeL5(envelope, catalogs);
  assert.equal(response.ok, false);
  assert.equal(response.error.code, "invalid-invocation");
  assert.match(response.error.message, /must match the assessed/);
});

test("unified L5 invoke supports initialize and inspect adapters", () => {
  const initialization = invokeL5(
    {
      schema_version: 1,
      request: {
        schema_version: 1,
        operation: "initialize",
        project: {
          locator: "."
        },
        initialization: {
          action: "discover",
          persistence: "session"
        }
      },
      context: {
        workflow_status: "completed",
        initialization: {
          action: "discover",
          persistence: "session",
          write_performed: false,
          sources: [],
          coverage: [],
          changes: [],
          unresolved: []
        }
      }
    },
    catalogs
  );
  assert.equal(initialization.status, "completed");
  assert.equal(initialization.initialization.write_performed, false);

  const inspection = invokeL5(
    {
      schema_version: 1,
      request: {
        schema_version: 1,
        operation: "inspect",
        inspection: {
          target: "catalog"
        }
      },
      context: {
        workflow_status: "completed",
        inspection_result: {
          target: "catalog",
          detail: "summary",
          data: {
            roles: 4
          }
        }
      }
    },
    catalogs
  );
  assert.equal(inspection.status, "completed");
  assert.deepEqual(inspection.inspection_result.data, {
    roles: 4
  });
});

test("task preparation retains evidence locators and team preference", () => {
  const taskValue = task({
    collaboration: {
      team_preference: "copilot",
      persistence: "persistent"
    }
  });
  const prepared = prepareTaskAssessment(taskValue, catalogs);
  assert.equal(prepared.invocation.collaboration.team_preset, "copilot");
  assert.equal(prepared.invocation.collaboration.persistence, "persistent");
  assert.equal(prepared.evidence[0].locator, "docs/rules.md");
});

test("task adapter writes Trio only as a derived snapshot", () => {
  const result = adaptTask(
    adapterInput(
      task(),
      assessment({
        present: ["external-user-impact"]
      })
    ),
    catalogs
  );
  assert.equal(result.response.status, "ready");
  assert.equal(result.task_patch.status, "in-progress");
  assert.equal(result.task_patch.runtime_snapshot.derived, true);
  assert.equal(result.task_patch.runtime_snapshot.effective_team, "trio");
  assert.equal(
    result.task_patch.runtime_snapshot.task_revision,
    result.task_patch.base_revision
  );
  assert.equal(result.task_patch.governance_snapshot.derived, true);
  assert.equal(result.task_patch.next_revision, 2);
});

test("task adapter blocks an insufficient preference without rewriting it", () => {
  const taskValue = task({
    collaboration: {
      team_preference: "solo"
    }
  });
  const result = adaptTask(
    adapterInput(
      taskValue,
      assessment({
        present: ["external-user-impact"]
      })
    ),
    catalogs
  );
  assert.equal(result.response.status, "decision-required");
  assert.equal(result.task_patch.status, "blocked");
  assert.equal(result.task_patch.runtime_snapshot, null);
  assert.equal(taskValue.collaboration.team_preference, "solo");
});

test("task adapter resumes from durable state and increments revisions", () => {
  const taskValue = task({
    revision: 3,
    status: "in-progress",
    continuation: {
      work_id: "task-1",
      resume_from: "tasks/task-1",
      kernel_revisions: {
        preset_resolution: 1,
        binding: 1,
        projection: 1
      }
    },
    runtime_snapshot: {
      derived: true,
      effective_team: "solo",
      assurance_mode: "self",
      taxonomy_version: 1,
      runtime_policy_version: 1,
      task_revision: 2,
      binding_revision: 1
    }
  });
  const result = adaptTask(
    adapterInput(taskValue, assessment(), {
      action: "resume"
    }),
    catalogs
  );
  assert.equal(result.action, "resume");
  assert.equal(result.response.operation, "resume");
  assert.equal(result.task_patch.base_revision, 3);
  assert.equal(result.task_patch.next_revision, 4);
  assert.equal(result.task_patch.invalidates_previous_runtime, true);
  assert.equal(
    result.task_patch.continuation.resume_from,
    "tasks/task-1"
  );
});

test("task adapter never executes completed tasks", () => {
  assert.throws(
    () =>
      adaptTask(
        adapterInput(
          task({
            status: "completed"
          }),
          assessment()
        ),
        catalogs
      ),
    /cannot execute completed task/
  );
});

test("registers the unified L5 and Task Adapter schemas", () => {
  assert.equal(
    catalogs.schemas.l5AdapterInput.title,
    "ZipZap L5 Adapter Invocation"
  );
  assert.equal(catalogs.schemas.task.title, "ZipZap Task Contract");
  assert.equal(
    catalogs.schemas.taskAdapterOutput.title,
    "ZipZap Task Adapter Output"
  );
  assert.equal(catalogs.schemas.taskEvent.title, "ZipZap Task Event");
  assert.equal(catalogs.schemas.reviewResult.title, "ZipZap Review Result");
  assert.equal(catalogs.schemas.taskReport.title, "ZipZap Task Report");
  assert.equal(
    catalogs.schemas.capabilityReport.title,
    "ZipZap AI Collaboration Capability Report"
  );
});
