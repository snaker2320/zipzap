import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const taskScript = path.resolve("scripts/task.mjs");

function run(command, args, cwd, input = null) {
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

function runFailure(command, args, cwd, input = null) {
  const result = spawnSync(
    process.execPath,
    [taskScript, command, "--project", cwd, ...args],
    {
      cwd,
      encoding: "utf8",
      input: input == null ? undefined : JSON.stringify(input)
    }
  );
  assert.notEqual(result.status, 0, "task command unexpectedly succeeded");
  return result.stderr || result.stdout;
}

function git(cwd, args) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8"
  });
  assert.equal(
    result.status,
    0,
    `git command failed: ${result.stderr || result.stdout}`
  );
  return result.stdout.trim();
}

function createRepository(context) {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-task-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  git(projectRoot, ["init", "-q"]);
  git(projectRoot, ["config", "user.name", "Example Developer"]);
  git(projectRoot, ["config", "user.email", "developer@example.com"]);
  fs.writeFileSync(path.join(projectRoot, "app.js"), "export const value = 1;\n");
  git(projectRoot, ["add", "app.js"]);
  git(projectRoot, ["commit", "-q", "-m", "Initial commit"]);
  return projectRoot;
}

function taskInput() {
  return {
    schema_version: 1,
    task_id: "task-1",
    revision: 1,
    status: "ready",
    origin: {
      kind: "direct"
    },
    work: {
      kind: "requirement-delivery",
      objective: "Implement tracked behavior.",
      scope: ["app.js"],
      exclusions: [],
      requested_action: "modify",
      work_type: "development",
      affected_components: ["app.js"],
      constraints: [],
      acceptance_criteria: [
        {
          id: "tracked-behavior",
          statement: "The tracked behavior is verified.",
          verification: "Run the focused behavior check.",
          required_evidence: ["Passing verification output"]
        }
      ]
    },
    planning: {
      priority: "medium",
      target_finish: "2030-01-01T00:00:00.000Z",
      estimate: {
        min: 1,
        likely: 2,
        max: 4,
        unit: "hours",
        confidence: "medium"
      }
    },
    accountability: {
      role: "developer",
      subject_id: "user-1"
    },
    dependencies: [],
    blockers: [],
    source_refs: [],
    readiness_policy: {
      mode: "standard"
    },
    participants: [
      {
        subject_id: "user-1",
        kind: "human",
        roles: ["developer"],
        git_identities: ["developer@example.com"]
      },
      {
        subject_id: "owl",
        kind: "agent",
        roles: ["developer"],
        agent_profile: "owl"
      }
    ],
    evidence: [
      {
        id: "verification-1",
        kind: "verification",
        locator: "test:behavior",
        statement: "The acceptance check passed.",
        criteria_refs: ["tracked-behavior"],
        status: "pass"
      },
      {
        id: "project-rule",
        kind: "project-rule",
        locator: "docs/standards/development.md",
        statement: "The project development standard was applied."
      }
    ]
  };
}

test("Task Standard v1 validates Ready fields before persistence", (context) => {
  const projectRoot = createRepository(context);
  const incomplete = taskInput();
  delete incomplete.work.affected_components;
  const validation = run("validate", [], projectRoot, incomplete);
  assert.equal(validation.standard_version, 1);
  assert.equal(validation.ready, false);
  assert.equal(validation.status_compatible, false);
  assert.deepEqual(validation.missing, ["work.affected_components"]);

  const failed = JSON.parse(
    runFailure("create", [], projectRoot, incomplete)
  );
  assert.equal(failed.error.code, "task-not-ready");
  assert.deepEqual(
    failed.error.details.missing,
    ["work.affected_components"]
  );
});

test("Task creation defaults to ready and rejects the retired backlog status", (context) => {
  const projectRoot = createRepository(context);
  const defaultReady = taskInput();
  delete defaultReady.status;
  defaultReady.resource_budget = {
    token_budget: 10000,
    goal_authorization: "explicit-user",
    goal_id: "goal-1"
  };
  const created = run("create", [], projectRoot, defaultReady);
  assert.equal(created.task.status, "ready");
  assert.equal(created.task.resource_budget.goal_authorization, "explicit-user");

  const backlog = {
    ...taskInput(),
    task_id: "backlog-task",
    status: "backlog"
  };
  const failed = JSON.parse(
    runFailure("create", [], projectRoot, backlog)
  );
  assert.equal(failed.error.code, "invalid-creation-status");

  const unauthorizedGoal = {
    ...taskInput(),
    task_id: "unauthorized-goal",
    resource_budget: {
      token_budget: 10000,
      goal_authorization: "not-requested",
      goal_id: "goal-2"
    }
  };
  const goalFailure = JSON.parse(
    runFailure("create", [], projectRoot, unauthorizedGoal)
  );
  assert.equal(goalFailure.error.code, "invalid-input");
});

test("Expedite records narrow, authorized, expiring Ready waivers", (context) => {
  const projectRoot = createRepository(context);
  const expedited = taskInput();
  expedited.work.affected_components = [];
  delete expedited.planning.target_finish;
  expedited.readiness_policy = {
    mode: "expedite",
    authority: "project-owner",
    reason: "Restore a time-critical service path.",
    waived_requirements: [
      "work.affected_components",
      "planning.target_finish-or-deadline"
    ],
    expires_at: "2099-01-01T00:00:00.000Z"
  };
  const validation = run("validate", [], projectRoot, expedited);
  assert.equal(validation.ready, true);
  assert.deepEqual(validation.missing, []);
  assert.deepEqual(validation.warnings, [
    "waived:work.affected_components",
    "waived:planning.target_finish-or-deadline"
  ]);
  const created = run("create", [], projectRoot, expedited);
  assert.equal(created.task.readiness_policy.authority, "project-owner");
});

test("A blocked Task requires an explicit open blocker and exit condition", (context) => {
  const projectRoot = createRepository(context);
  const missingBlocker = {
    ...taskInput(),
    status: "blocked"
  };
  const validation = run("validate", [], projectRoot, missingBlocker);
  assert.equal(validation.ready, true);
  assert.equal(validation.status_compatible, false);

  const blocked = {
    ...missingBlocker,
    blockers: [
      {
        id: "owner-decision",
        statement: "The owning team must select the compatibility behavior.",
        status: "open",
        resolution_condition: "The project owner records the selected behavior.",
        owner_role: "project-owner"
      }
    ]
  };
  const created = run("create", [], projectRoot, blocked);
  assert.equal(created.task.status, "blocked");
  assert.equal(created.task.blockers[0].id, "owner-decision");

  const unblocked = run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 1,
    status: "ready",
    resolve_blocker_ids: ["owner-decision"]
  });
  assert.equal(unblocked.task.blockers[0].status, "resolved");

  run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 2,
    status: "in-progress"
  });
  const reblocked = run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 3,
    status: "blocked",
    blocker: {
      id: "runtime-decision",
      statement: "A runtime compatibility choice is required.",
      status: "open",
      resolution_condition: "The compatibility choice is recorded."
    }
  });
  assert.equal(reblocked.task.blockers.at(-1).id, "runtime-decision");
});

test("independent Task CLI stores, tracks, reviews, and reports work", (context) => {
  const projectRoot = createRepository(context);
  const created = run("create", [], projectRoot, taskInput());
  assert.equal(created.task.revision, 1);
  assert.equal(
    "git_identities" in created.task.participants[0],
    false
  );
  assert.match(
    created.task.participants[0].git_identity_hashes[0],
    /^[0-9a-f]{64}$/
  );
  assert.equal(
    fs.existsSync(path.join(projectRoot, ".zipzap", "tasks", "task-1.json")),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        projectRoot,
        ".zipzap",
        "events",
        "task-1",
        `${created.event_ref}.json`
      )
    ),
    true
  );
  assert.equal(
    fs.readdirSync(path.join(projectRoot, ".zipzap", "events")).some(
      (name) => name.endsWith(".jsonl")
    ),
    false
  );

  const started = run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 1,
    status: "in-progress",
    actor_id: "user-1"
  });
  assert.equal(started.task.revision, 2);

  const tracked = run("track-git", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 2,
    tracking: {
      paths: ["app.js"]
    }
  });
  assert.equal(tracked.task.revision, 3);
  assert.match(tracked.task.git_tracking.base_commit, /^[0-9a-f]{40}$/);

  fs.writeFileSync(path.join(projectRoot, "app.js"), "export const value = 2;\n");
  git(projectRoot, ["add", "app.js"]);
  git(projectRoot, [
    "commit",
    "-q",
    "-m",
    "Implement tracked behavior",
    "-m",
    "ZipZap-Task: task-1"
  ]);

  const missingRevision = JSON.parse(
    runFailure("sync-git", ["--id", "task-1"], projectRoot)
  );
  assert.equal(missingRevision.error.code, "missing-option");
  assert.match(missingRevision.error.message, /--expected-revision/);
  const synced = run(
    "sync-git",
    ["--id", "task-1", "--expected-revision", "3"],
    projectRoot
  );
  assert.equal(synced.task.revision, 4);
  assert.equal(synced.snapshot.confirmed_commits.length, 1);
  assert.equal(synced.snapshot.candidate_commits.length, 0);
  assert.equal(synced.snapshot.confirmed_commits[0].subject_id, "user-1");
  assert.equal(synced.snapshot.changed_paths[0], "app.js");

  const review = run("record-review", [], projectRoot, {
    expected_revision: 4,
    review: {
      schema_version: 1,
      review_id: "review-1",
      task_id: "task-1",
      reviewer: {
        subject_id: "reviewer-1",
        independence: "independent"
      },
      subject_snapshot: {
        task_revision: 4,
        git_head: synced.snapshot.repository_head,
        artifact_refs: [
          {
            locator: "app.js",
            version: synced.snapshot.repository_head
          }
        ]
      },
      created_at: new Date().toISOString(),
      outcome: "approved",
      coverage: {
        scope: ["app.js"],
        limitations: []
      },
      findings: [],
      evidence_refs: ["git:HEAD"]
    }
  });
  assert.equal(review.task.revision, 5);

  const assessed = run("assess", ["--id", "task-1"], projectRoot);
  assert.equal(assessed.status, "ready-to-complete");
  assert.equal(
    assessed.completion_label,
    "verified-ready-to-complete"
  );
  assert.equal(assessed.execution_view, null);
  assert.deepEqual(assessed.criteria, {
    verified: 1,
    total: 1
  });

  const transitioned = run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 5,
    status: "completed",
    actor_id: "user-1"
  });
  assert.equal(transitioned.task.status, "completed");
  assert.equal(transitioned.task.revision, 6);

  const usage = run("record-usage", [], projectRoot, {
    schema_version: 1,
    usage_id: "task-1-run",
    task_id: "task-1",
    task_revision: 6,
    recorded_at: new Date().toISOString(),
    actor_id: "owl",
    resource_usage: {
      measurement: "exact",
      source: "host",
      input_tokens: 1200,
      output_tokens: 800,
      tool_result_tokens: 3000,
      total_tokens: 5000
    },
    goal: {
      authorization: "explicit-user",
      token_budget: 10000,
      goal_id: "goal-1"
    }
  });
  assert.equal(usage.task_revision, 6);

  const report = run(
    "report",
    ["--period", "daily", "--scope", "person", "--subject", "user-1"],
    projectRoot
  );
  assert.equal(report.tasks.length, 1);
  assert.equal(report.summary.completed_transitions, 1);
  assert.equal(report.tasks[0].completion, "complete");
  assert.equal(report.resource_usage.measurement, "exact");
  assert.equal(report.resource_usage.total_tokens, 5000);
  assert.equal(report.tasks[0].resource_usage.tool_result_tokens, 3000);

  const capability = run(
    "capability",
    ["--subject", "user-1"],
    projectRoot
  );
  assert.equal(capability.profiles.length, 1);
  assert.equal(capability.profiles[0].sample.tasks, 1);
  assert.equal(
    capability.profiles[0].dimensions["verification-discipline"].assessment,
    "insufficient-evidence"
  );
  assert.equal(
    fs
      .readdirSync(path.join(projectRoot, ".zipzap", "events", "task-1"))
      .filter((name) => name.endsWith(".json")).length,
    7
  );
});

test("reports retain read-only compatibility with legacy monthly JSONL events", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const occurredAt = new Date().toISOString();
  const legacyEvent = {
    schema_version: 1,
    event_id: "legacy-completed-event",
    task_id: "task-1",
    type: "transitioned",
    occurred_at: occurredAt,
    actor_id: "user-1",
    base_revision: 1,
    next_revision: 2,
    data: {
      from: "in-progress",
      to: "completed"
    }
  };
  fs.writeFileSync(
    path.join(
      projectRoot,
      ".zipzap",
      "events",
      `${occurredAt.slice(0, 7)}.jsonl`
    ),
    `${JSON.stringify(legacyEvent)}\n`
  );
  const report = run(
    "report",
    ["--period", "daily", "--scope", "person", "--subject", "user-1"],
    projectRoot
  );
  assert.equal(report.summary.completed_transitions, 1);
});

test("does not invent token counts when host telemetry is unavailable", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  run("record-usage", [], projectRoot, {
    schema_version: 1,
    usage_id: "telemetry-unavailable",
    task_id: "task-1",
    task_revision: 1,
    recorded_at: new Date().toISOString(),
    resource_usage: {
      measurement: "unavailable",
      source: "host"
    }
  });
  const report = run(
    "report",
    ["--period", "daily", "--scope", "person", "--subject", "user-1"],
    projectRoot
  );
  assert.equal(report.resource_usage.measurement, "unavailable");
  assert.equal(report.resource_usage.unavailable_records, 1);
  assert.equal(report.resource_usage.total_tokens, 0);

  const invalid = JSON.parse(
    runFailure("record-usage", [], projectRoot, {
      schema_version: 1,
      usage_id: "fake-estimate",
      task_id: "task-1",
      task_revision: 1,
      recorded_at: new Date().toISOString(),
      resource_usage: {
        measurement: "unavailable",
        source: "estimated",
        total_tokens: 42
      }
    })
  );
  assert.equal(invalid.error.code, "invalid-input");
});

test("reads legacy Review records without snapshots but requires snapshots on update", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const legacyReview = {
    schema_version: 1,
    review_id: "legacy-review",
    task_id: "task-1",
    reviewer: {
      subject_id: "reviewer-1",
      independence: "independent"
    },
    created_at: new Date().toISOString(),
    outcome: "approved",
    coverage: {
      scope: ["app.js"],
      limitations: ["Recorded before Review snapshots were introduced."]
    },
    findings: [],
    evidence_refs: ["git:HEAD"]
  };
  const reviewDirectory = path.join(projectRoot, ".zipzap", "reviews");
  fs.mkdirSync(reviewDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(reviewDirectory, "legacy-review.json"),
    `${JSON.stringify(legacyReview, null, 2)}\n`
  );

  assert.equal(run("assess", ["--id", "task-1"], projectRoot).status, "ready-to-complete");
  const update = JSON.parse(
    runFailure("update-review", [], projectRoot, {
      expected_revision: 1,
      review: legacyReview
    })
  );
  assert.equal(update.error.code, "invalid-input");
  assert.match(update.error.message, /subject_snapshot/);
});

test("captures shareable Feedback with a minimal derived Task snapshot", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const captured = run("feedback", [], projectRoot, {
    schema_version: 1,
    feedback_id: "ready-flow-friction",
    kind: "problem",
    area: "task-management",
    summary: "The Ready flow requested unnecessary detail.",
    observed: "A small fix required a scheduling decision.",
    expected: "Keep small Tasks lightweight.",
    impact: "medium",
    reproduction_steps: ["Validate the Task input."],
    artifact_refs: [
      {
        kind: "command",
        locator: "task:validate"
      }
    ],
    task_id: "task-1",
    reporter: {
      kind: "human",
      subject_id: "user-1"
    }
  });
  assert.equal(
    captured.feedback.zipzap_snapshot.skill_version,
    "0.1.1-beta.3"
  );
  assert.equal(captured.feedback.task_snapshot.task_id, "task-1");
  assert.equal(captured.feedback.task_snapshot.completion, "ready-to-complete");
  assert.equal(
    captured.feedback.artifact_refs.some(
      (reference) =>
        reference.locator === ".zipzap/tasks/task-1.json"
    ),
    true
  );
  assert.equal(
    fs.existsSync(
      path.join(
        projectRoot,
        ".zipzap",
        "feedback",
        "ready-flow-friction.json"
      )
    ),
    true
  );
  const listed = run("feedback-list", [], projectRoot);
  assert.deepEqual(listed.map((feedback) => feedback.feedback_id), [
    "ready-flow-friction"
  ]);
  const duplicate = JSON.parse(
    runFailure("feedback", [], projectRoot, {
      ...captured.feedback
    })
  );
  assert.equal(duplicate.error.code, "conflict");

  const initializationFeedback = run("feedback", [], projectRoot, {
    schema_version: 1,
    feedback_id: "initialization-question",
    kind: "question",
    area: "initialization",
    summary: "The discovered standard needs confirmation.",
    observed: "Two candidate files were returned.",
    impact: "low",
    artifact_refs: []
  });
  assert.equal("task_snapshot" in initializationFeedback.feedback, false);
});

test("Git range activity without a Task trailer remains a candidate", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  run("track-git", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 1,
    tracking: {
      paths: ["app.js"]
    }
  });

  fs.writeFileSync(path.join(projectRoot, "app.js"), "export const value = 3;\n");
  git(projectRoot, ["add", "app.js"]);
  git(projectRoot, ["commit", "-q", "-m", "Unlinked change"]);

  const scanned = run("git-scan", ["--id", "task-1"], projectRoot);
  assert.equal(scanned.confirmed_commits.length, 0);
  assert.equal(scanned.candidate_commits.length, 1);
  assert.equal(scanned.candidate_commits[0].association, "candidate");
});

test("applies an L5 Task Patch with optimistic revision checks", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const applied = run("apply-patch", [], projectRoot, {
    task_id: "task-1",
    task_patch: {
      base_revision: 1,
      next_revision: 2,
      status: "in-progress",
      risk_assessment: {
        schema_version: 1,
        taxonomy_version: 1,
        evaluated_signals: [],
        present_signals: [],
        unknown_signals: []
      },
      governance_snapshot: {
        derived: true,
        taxonomy_version: 1,
        task_revision: 1,
        present_signals: [],
        risk_flags: [],
        required_gates: [],
        required_evidence: [],
        requires_approval: [],
        persistence_required: true
      },
      runtime_snapshot: {
        derived: true,
        effective_team: "solo",
        assurance_mode: "self",
        taxonomy_version: 1,
        runtime_policy_version: 1,
        task_revision: 1,
        binding_revision: 1,
        execution_stamp:
          "solo · Owl / developer.produce · 1 member · self · persistent",
        participants: [
          {
            slot: "primary",
            profile: "owl",
            display_name: "Owl",
            roles: ["product", "developer", "tester", "reviewer"],
            functions: ["coordinator"],
            active: true
          }
        ],
        active_perspective: {
          slot: "primary",
          profile: "owl",
          display_name: "Owl",
          role: "developer",
          stage: "produce"
        }
      },
      continuation: null,
      invalidates_previous_runtime: false
    }
  });
  assert.equal(applied.task.revision, 2);
  assert.equal(applied.task.governance_snapshot.derived, true);
  const assessed = run("assess", ["--id", "task-1"], projectRoot);
  assert.equal(assessed.execution_view.effective_team, "solo");
  assert.equal(assessed.execution_view.participants[0].display_name, "Owl");
  assert.match(assessed.execution_view.stamp, /^solo/);
});

test("a blocked L5 patch materializes its decision as a Task blocker", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const applied = run("apply-patch", [], projectRoot, {
    task_id: "task-1",
    response: {
      decisions_required: [
        {
          code: "risk-signal-unresolved",
          message: "Confirm whether regulated data is affected.",
          required_authority: "project-owner"
        }
      ]
    },
    task_patch: {
      base_revision: 1,
      next_revision: 2,
      status: "blocked",
      risk_assessment: {
        schema_version: 1,
        taxonomy_version: 1,
        evaluated_signals: [],
        present_signals: [],
        unknown_signals: []
      },
      governance_snapshot: {
        derived: true,
        taxonomy_version: 1,
        task_revision: 1,
        present_signals: [],
        risk_flags: [],
        required_gates: [],
        required_evidence: [],
        requires_approval: [],
        persistence_required: true
      },
      runtime_snapshot: null,
      continuation: null,
      invalidates_previous_runtime: false
    }
  });
  assert.equal(applied.task.status, "blocked");
  assert.deepEqual(applied.task.blockers[0], {
    id: "l5-decision-1",
    statement: "Confirm whether regulated data is affected.",
    status: "open",
    resolution_condition: "Decision supplied by project-owner.",
    owner_role: "project-owner"
  });
});

test("completion is blocked by Review changes requests", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  const blockingReview = {
    schema_version: 1,
    review_id: "review-blocking",
    task_id: "task-1",
    reviewer: {
      subject_id: "reviewer-1",
      independence: "independent"
    },
    subject_snapshot: {
      task_revision: 1,
      git_head: null,
      artifact_refs: [
        {
          locator: "app.js",
          version: null
        }
      ]
    },
    created_at: new Date().toISOString(),
    outcome: "changes-requested",
    coverage: {
      scope: ["app.js"],
      limitations: []
    },
    findings: [
      {
        id: "finding-1",
        statement: "The implementation has a material defect.",
        severity: "high",
        priority: "p1",
        blocking: true,
        status: "open",
        evidence_refs: ["git:HEAD"]
      }
    ],
    evidence_refs: ["git:HEAD"]
  };
  run("record-review", [], projectRoot, {
    expected_revision: 1,
    review: blockingReview
  });

  const assessed = run("assess", ["--id", "task-1"], projectRoot);
  assert.equal(assessed.status, "changes-requested");
  assert.equal(assessed.open_findings.blocking, 1);

  run("update-review", [], projectRoot, {
    expected_revision: 2,
    review: {
      ...blockingReview,
      subject_snapshot: {
        ...blockingReview.subject_snapshot,
        task_revision: 2
      },
      outcome: "approved",
      findings: [
        {
          ...blockingReview.findings[0],
          status: "fixed"
        }
      ]
    }
  });
  const reassessed = run("assess", ["--id", "task-1"], projectRoot);
  assert.equal(reassessed.status, "ready-to-complete");
  assert.equal(reassessed.open_findings.blocking, 0);
  assert.equal(
    run("show", ["--id", "task-1"], projectRoot).findings[0].priority,
    "p1"
  );
});

test("person reports exclude events from out-of-scope Tasks", (context) => {
  const projectRoot = createRepository(context);
  run("create", [], projectRoot, taskInput());
  run("create", [], projectRoot, {
    ...taskInput(),
    task_id: "task-2",
    participants: [
      {
        subject_id: "user-2",
        kind: "human",
        roles: ["developer"]
      }
    ]
  });
  run("transition", [], projectRoot, {
    task_id: "task-2",
    expected_revision: 1,
    status: "in-progress",
    actor_id: "user-2"
  });
  run("transition", [], projectRoot, {
    task_id: "task-2",
    expected_revision: 2,
    status: "completed",
    actor_id: "user-2"
  });

  const report = run(
    "report",
    ["--period", "daily", "--scope", "person", "--subject", "user-1"],
    projectRoot
  );
  assert.equal(report.summary.tasks_touched, 1);
  assert.equal(report.summary.active_tasks, 1);
  assert.equal(report.summary.completed_transitions, 0);
  assert.deepEqual(
    report.tasks.map((task) => task.task_id),
    ["task-1"]
  );
});
