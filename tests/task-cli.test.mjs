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
    status: "in-progress",
    work: {
      objective: "Implement tracked behavior.",
      work_type: "development",
      acceptance_criteria: ["The tracked behavior is verified."]
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
        criteria_refs: ["criterion-1"],
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

  const tracked = run("track-git", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 1,
    tracking: {
      paths: ["app.js"]
    }
  });
  assert.equal(tracked.task.revision, 2);
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

  assert.match(
    runFailure("sync-git", ["--id", "task-1"], projectRoot),
    /Task revision mismatch/
  );
  const synced = run(
    "sync-git",
    ["--id", "task-1", "--expected-revision", "2"],
    projectRoot
  );
  assert.equal(synced.task.revision, 3);
  assert.equal(synced.snapshot.confirmed_commits.length, 1);
  assert.equal(synced.snapshot.candidate_commits.length, 0);
  assert.equal(synced.snapshot.confirmed_commits[0].subject_id, "user-1");
  assert.equal(synced.snapshot.changed_paths[0], "app.js");

  const review = run("record-review", [], projectRoot, {
    expected_revision: 3,
    review: {
      schema_version: 1,
      review_id: "review-1",
      task_id: "task-1",
      reviewer: {
        subject_id: "reviewer-1",
        independence: "independent"
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
  assert.equal(review.task.revision, 4);

  const assessed = run("assess", ["--id", "task-1"], projectRoot);
  assert.equal(assessed.status, "ready-to-complete");
  assert.deepEqual(assessed.criteria, {
    verified: 1,
    total: 1
  });

  const transitioned = run("transition", [], projectRoot, {
    task_id: "task-1",
    expected_revision: 4,
    status: "completed",
    actor_id: "user-1"
  });
  assert.equal(transitioned.task.status, "completed");
  assert.equal(transitioned.task.revision, 5);

  const report = run(
    "report",
    ["--period", "daily", "--scope", "person", "--subject", "user-1"],
    projectRoot
  );
  assert.equal(report.tasks.length, 1);
  assert.equal(report.summary.completed_transitions, 1);
  assert.equal(report.tasks[0].completion, "complete");

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
      runtime_snapshot: null,
      continuation: null,
      invalidates_previous_runtime: false
    }
  });
  assert.equal(applied.task.revision, 2);
  assert.equal(applied.task.governance_snapshot.derived, true);
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
