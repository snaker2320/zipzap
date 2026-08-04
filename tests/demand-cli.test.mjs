import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const demandScript = path.resolve("scripts/demand.mjs");
const taskScript = path.resolve("scripts/task.mjs");

function run(command, args, cwd, input = null) {
  const result = spawnSync(
    process.execPath,
    [demandScript, command, "--project", cwd, ...args],
    {
      cwd,
      encoding: "utf8",
      input: input == null ? undefined : JSON.stringify(input)
    }
  );
  assert.equal(
    result.status,
    0,
    `demand command failed: ${result.stderr || result.stdout}`
  );
  return JSON.parse(result.stdout);
}

function runFailure(command, args, cwd, input = null) {
  const result = spawnSync(
    process.execPath,
    [demandScript, command, "--project", cwd, ...args],
    {
      cwd,
      encoding: "utf8",
      input: input == null ? undefined : JSON.stringify(input)
    }
  );
  assert.notEqual(result.status, 0);
  return JSON.parse(result.stderr);
}

function runTaskCommand(command, args, cwd, input = null) {
  const result = spawnSync(
    process.execPath,
    [taskScript, command, "--project", cwd, ...args],
    {
      cwd,
      encoding: "utf8",
      input: input == null ? undefined : JSON.stringify(input)
    }
  );
  assert.equal(
    result.status,
    0,
    `task command failed: ${result.stderr || result.stdout}`
  );
  return JSON.parse(result.stdout);
}

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-demand-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function demand() {
  return {
    schema_version: 1,
    demand_id: "cache-debt",
    revision: 1,
    type: "technical-debt",
    status: "captured",
    summary: "Replace fragile cache invalidation.",
    expected_outcome: "Focused cache tests become deterministic.",
    priority: "medium",
    owner_id: "developer-1",
    timing: {
      target_start: "2030-01-06T00:00:00.000Z",
      target_finish: "2030-01-10T00:00:00.000Z",
      deadline: "2030-01-15T00:00:00.000Z"
    },
    source_refs: [
      {
        id: "architecture-note",
        kind: "decision",
        locator: "docs/cache.md#invalidation"
      }
    ],
    notes: []
  };
}

function task() {
  return {
    schema_version: 1,
    task_id: "cache-debt-task",
    revision: 1,
    status: "ready",
    origin: { kind: "demand", ref: "cache-debt" },
    work: {
      kind: "technical-debt-remediation",
      objective: "Replace fragile cache invalidation.",
      scope: ["src/cache"],
      exclusions: [],
      requested_action: "modify",
      affected_components: ["src/cache"],
      constraints: [],
      acceptance_criteria: [
        {
          id: "cache-tests",
          statement: "Cache tests are deterministic.",
          verification: "Run focused cache tests.",
          required_evidence: ["Passing test output"]
        }
      ]
    },
    planning: {
      priority: "low",
      estimate: {
        min: 2,
        likely: 4,
        max: 8,
        unit: "hours",
        confidence: "medium"
      }
    },
    accountability: { role: "developer" },
    dependencies: [],
    blockers: [],
    source_refs: [],
    readiness_policy: { mode: "standard" },
    participants: [],
    evidence: []
  };
}

function directTask(id = "capture-task") {
  const candidate = task();
  candidate.task_id = id;
  candidate.origin = { kind: "direct" };
  candidate.planning.target_finish = "2030-01-10T00:00:00.000Z";
  return candidate;
}

function suggestion(overrides = {}) {
  return {
    suggestion_id: "cache-race",
    type: "technical-debt",
    summary: "Cache invalidation can race with concurrent writes.",
    expected_outcome: "Concurrent cache writes remain deterministic.",
    severity: "high",
    current_work_impact: "unrelated",
    evidence: [
      {
        id: "cache-code",
        kind: "implementation",
        locator: "src/cache/store.js#invalidate",
        statement: "Invalidation and replacement are not serialized."
      }
    ],
    ...overrides
  };
}

function startCapture(root, suggestionInput, presentation = "form") {
  return run("capture", [], root, {
    schema_version: 1,
    operation: "start",
    locale: "zh-CN",
    presentation,
    suggestion: suggestionInput
  });
}

test("Demand Standard captures and triages lightweight candidate work", (context) => {
  const root = project(context);
  const validation = run("validate", [], root, demand());
  assert.equal(validation.valid, true);

  const created = run("create", [], root, demand());
  assert.equal(created.demand.status, "captured");
  assert.equal(created.locator, ".zipzap/demands/cache-debt.json");

  const updated = run("update", [], root, {
    schema_version: 1,
    demand_id: "cache-debt",
    expected_revision: 1,
    patch: { status: "triaged", priority: "high" }
  });
  assert.equal(updated.demand.revision, 2);
  assert.equal(updated.demand.status, "triaged");
  assert.equal(updated.demand.priority, "high");

  const planned = run("update", [], root, {
    schema_version: 1,
    demand_id: "cache-debt",
    expected_revision: 2,
    patch: { status: "planned" }
  });
  assert.equal(planned.demand.revision, 3);
  assert.equal(planned.demand.status, "planned");

  const listed = run("list", ["--status", "planned"], root);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].type, "technical-debt");

  const conflict = runFailure("update", [], root, {
    schema_version: 1,
    demand_id: "cache-debt",
    expected_revision: 2,
    patch: { priority: "low" }
  });
  assert.match(conflict.error.message, /revision mismatch/);
});

test("promotion creates a Ready Task with bidirectional Demand trace", (context) => {
  const root = project(context);
  const input = demand();
  input.status = "planned";
  run("create", [], root, input);

  const promoted = run("promote", [], root, {
    schema_version: 1,
    demand_id: "cache-debt",
    expected_revision: 1,
    task: task()
  });
  assert.equal(promoted.demand.status, "promoted");
  assert.equal(promoted.demand.promotion.task_id, "cache-debt-task");
  assert.equal(promoted.task.status, "ready");
  assert.deepEqual(promoted.task.origin, {
    kind: "demand",
    ref: "cache-debt",
    locator: ".zipzap/demands/cache-debt.json"
  });
  assert.equal(promoted.task.planning.priority, "medium");
  assert.equal(promoted.task.planning.target_finish, "2030-01-10T00:00:00.000Z");
  assert.equal(promoted.task.accountability.subject_id, "developer-1");
  assert.equal(promoted.task.source_refs[0].id, "origin-demand");
  assert.equal(
    fs.existsSync(path.join(root, ".zipzap/tasks/cache-debt-task.json")),
    true
  );
});

test("phase plans derive target-slip and hard-deadline warnings", (context) => {
  const root = project(context);
  const input = demand();
  input.status = "planned";
  run("create", [], root, input);
  run("promote", [], root, {
    schema_version: 1,
    demand_id: "cache-debt",
    expected_revision: 1,
    task: task()
  });
  run("plan-create", [], root, {
    schema_version: 1,
    plan_id: "january-phase",
    revision: 1,
    status: "active",
    title: "January reliability",
    window: {
      start: "2030-01-01T00:00:00.000Z",
      end: "2030-01-31T23:59:59.000Z"
    },
    items: [
      {
        kind: "demand",
        ref: "cache-debt",
        committed: true,
        target_finish: "2030-01-10T00:00:00.000Z"
      }
    ]
  });

  const targetSlip = run(
    "plan-assess",
    ["--id", "january-phase", "--as-of", "2030-01-11T00:00:00.000Z"],
    root
  );
  assert.equal(targetSlip.status, "at-risk");
  assert.deepEqual(targetSlip.items[0].reasons, [
    "promoted-from:cache-debt",
    "target-finish-passed"
  ]);

  const overdue = run(
    "plan-assess",
    ["--id", "january-phase", "--as-of", "2030-01-16T00:00:00.000Z"],
    root
  );
  assert.equal(overdue.status, "overdue");
  assert.equal(overdue.summary.overdue, 1);
  assert.match(overdue.next_actions[0], /deadline-passed/);
});

test("capture start returns a prefilled form without writing project state", (context) => {
  const root = project(context);
  const started = startCapture(root, suggestion());

  assert.equal(started.status, "decision-required");
  assert.equal(started.write_performed, false);
  assert.equal(started.preview.prompt_timing, "immediate");
  assert.equal(started.preview.recommended_action, "create-demand");
  assert.equal(started.form.id, "capture-suggestion");
  assert.equal(
    started.form.fields.find((field) => field.id === "priority").default,
    "high"
  );
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
});

test("capture start falls back to one stepwise action question", (context) => {
  const root = project(context);
  const started = startCapture(root, suggestion({ severity: "medium" }), "stepwise");

  assert.equal(started.status, "decision-required");
  assert.equal(started.preview.prompt_timing, "stage-end");
  assert.equal(started.form, undefined);
  assert.equal(started.question.id, "capture-action");
  assert.equal(started.question.options.length, 3);
});

test("confirmed capture creates a Demand and updates an active phase plan", (context) => {
  const root = project(context);
  run("create", [], root, demand());
  run("plan-create", [], root, {
    schema_version: 1,
    plan_id: "reliability-phase",
    revision: 1,
    status: "active",
    title: "Reliability phase",
    window: {
      start: "2030-01-01T00:00:00.000Z",
      end: "2030-01-31T23:59:59.000Z"
    },
    items: [{ kind: "demand", ref: "cache-debt", committed: false }]
  });
  const started = startCapture(
    root,
    suggestion({ active_plan_id: "reliability-phase" })
  );
  assert.equal(started.state.active_plan_revision, 1);

  const confirmed = run("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: {
      action: "create-demand",
      owner_id: "developer-2",
      timing: { target_finish: "2030-01-20T00:00:00.000Z" },
      add_to_plan: true
    }
  });

  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.write_performed, true);
  assert.equal(confirmed.result.demand_id, "cache-race");
  const captured = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap/demands/cache-race.json"), "utf8")
  );
  assert.equal(captured.type, "technical-debt");
  assert.equal(captured.source_refs[0].locator, "src/cache/store.js#invalidate");
  const plan = run("plan-show", ["--id", "reliability-phase"], root);
  assert.equal(plan.revision, 2);
  assert.equal(plan.items.at(-1).ref, "cache-race");
});

test("dismissed capture writes no project state", (context) => {
  const root = project(context);
  const started = startCapture(root, suggestion());
  const confirmed = run("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: { action: "dismiss" }
  });

  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.write_performed, false);
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
});

test("confirmed capture attaches an open Finding and evidence to the current Task", (context) => {
  const root = project(context);
  runTaskCommand("create", [], root, directTask("current-task"));
  const started = startCapture(
    root,
    suggestion({
      current_work_impact: "blocking",
      current_task_id: "current-task"
    })
  );
  assert.equal(started.state.current_task_revision, 1);
  assert.equal(started.preview.recommended_action, "attach-current-task");

  const confirmed = run("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: { action: "attach-current-task" }
  });
  assert.equal(confirmed.result.task_revision, 2);

  const updated = runTaskCommand("show", ["--id", "current-task"], root);
  assert.equal(updated.revision, 2);
  assert.equal(updated.findings[0].id, "cache-race");
  assert.equal(updated.findings[0].severity, "high");
  assert.equal(updated.findings[0].priority, "p1");
  assert.equal(updated.findings[0].blocking, true);
  assert.equal(updated.evidence[0].id, "capture-cache-code");
});

test("capture confirmation rejects a current Task changed after preview", (context) => {
  const root = project(context);
  runTaskCommand("create", [], root, directTask("current-task"));
  const started = startCapture(
    root,
    suggestion({
      current_work_impact: "related",
      current_task_id: "current-task"
    })
  );
  const current = runTaskCommand("show", ["--id", "current-task"], root);
  current.work.constraints.push("Preserve cache compatibility.");
  runTaskCommand("update", [], root, {
    expected_revision: 1,
    task: current
  });

  const conflict = runFailure("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: { action: "attach-current-task" }
  });
  assert.match(conflict.error.message, /revision mismatch/);
  const unchanged = runTaskCommand("show", ["--id", "current-task"], root);
  assert.equal(unchanged.revision, 2);
  assert.equal(unchanged.findings, undefined);
});

test("create-task capture blocks without a complete Task candidate", (context) => {
  const root = project(context);
  const started = startCapture(root, suggestion());
  const confirmed = run("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: { action: "create-task" }
  });

  assert.equal(confirmed.status, "blocked");
  assert.equal(confirmed.write_performed, false);
  assert.match(confirmed.required_actions[0], /Task Standard v1/);
});

test("create-task capture accepts a complete Task Standard candidate", (context) => {
  const root = project(context);
  const candidate = directTask("captured-task");
  const started = startCapture(
    root,
    suggestion({ task_candidate: candidate })
  );
  const confirmed = run("capture", [], root, {
    schema_version: 1,
    operation: "confirm",
    state: started.state,
    expected_revision: 1,
    decision: { action: "create-task" }
  });

  assert.equal(confirmed.status, "completed");
  assert.equal(confirmed.result.task_id, "captured-task");
  const created = runTaskCommand("show", ["--id", "captured-task"], root);
  assert.equal(created.status, "ready");
  assert.equal(created.source_refs[0].id, "capture-cache-code");
  assert.equal(created.source_refs[0].statement, suggestion().evidence[0].statement);
});

test("phase plans expose missing references instead of silently dropping them", (context) => {
  const root = project(context);
  const created = run("plan-create", [], root, {
    schema_version: 1,
    plan_id: "broken-phase",
    revision: 1,
    status: "draft",
    title: "Broken references",
    window: {
      start: "2030-01-01T00:00:00.000Z",
      end: "2030-01-31T00:00:00.000Z"
    },
    items: [{ kind: "demand", ref: "missing-demand" }]
  });
  const updated = run("plan-update", [], root, {
    schema_version: 1,
    expected_revision: 1,
    plan: {
      ...created.plan,
      status: "active",
      title: "Broken references remain visible"
    }
  });
  assert.equal(updated.plan.revision, 2);
  assert.equal(updated.plan.status, "active");
  const assessed = run(
    "plan-assess",
    ["--id", "broken-phase", "--as-of", "2030-01-02T00:00:00.000Z"],
    root
  );
  assert.equal(assessed.status, "invalid");
  assert.deepEqual(assessed.items[0].reasons, ["referenced-record-missing"]);
});
