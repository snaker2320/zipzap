import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compileContext,
  completeWork,
  createHandoff,
  loadCatalogs
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();
const allSignals = Object.keys(catalogs.riskTaxonomy.signals);

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-compiler-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".zipzap"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".zipzap", "project.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        project_id: "compiler-project",
        revision: 1,
        sources: [
          {
            id: "primary-rules",
            locator: "docs/rules.md",
            topics: ["implementation"],
            priority: 10
          },
          {
            id: "secondary-rules",
            locator: "docs/secondary.md",
            topics: ["implementation"],
            priority: 1
          }
        ]
      },
      null,
      2
    )}\n`
  );
  return root;
}

function compilerEnvelope(projectRoot, overrides = {}) {
  return {
    schema_version: 1,
    request: {
      schema_version: 1,
      operation: "execute",
      project: {
        locator: projectRoot
      },
      request: {
        intent: "implement",
        objective: "Implement one bounded behavior.",
        requested_action: "modify",
        execution_budget: {
          max_source_files: 1,
          max_source_bytes: 4096,
          max_tool_output_bytes: 10000,
          max_findings_expansion: 1,
          allow_full_file_read: false,
          allow_tests: true,
          allow_mutations: true,
          allow_persistence: false
        }
      }
    },
    context: {
      output_detail: "compact",
      compiler: {
        schema_version: 1,
        work_id: "compiler-work",
        work_type: "development",
        affected_components: ["component-a"],
        evidence: [],
        assessment: {
          schema_version: 1,
          taxonomy_version: 1,
          evaluated_signals: allSignals,
          present_signals: [],
          unknown_signals: []
        },
        host: {
          concurrency_limit: 1,
          distinct_context_limit: 1
        },
        state: {
          current_role: "developer",
          current_stage: "produce",
          open_findings: [
            { id: "finding-1" },
            { id: "finding-2" }
          ]
        },
        cache_mode: "read-write",
        ...overrides
      }
    }
  };
}

function collaborationView() {
  return {
    output_detail: "compact",
    perspective: {
      slot: "builder",
      profile: "owl",
      display_name: "Owl",
      role: "developer",
      stage: "produce"
    },
    selection: {
      preference: "auto",
      preference_source: "default",
      effective: "solo",
      minimum_sufficient: "solo",
      recommended: "solo",
      reason_codes: ["minimum-sufficient-preset"]
    },
    member_count: 1,
    assurance: {
      target: "self-review",
      mode: "self",
      claim_limit: "self-reviewed",
      limitations: ["No independent Review."]
    },
    persistence: "ephemeral"
  };
}

test("context compiler loads project sources, enforces bounds, and reuses cache", (context) => {
  const root = project(context);
  const first = compileContext(compilerEnvelope(root), catalogs);
  assert.equal(first.response.status, "ready");
  assert.equal(first.response.execution.source_locators.length, 1);
  assert.equal(
    first.response.execution.source_locators[0].id,
    "primary-rules"
  );
  assert.equal(first.compiler_report.project_sources.omitted.length, 1);
  assert.equal(first.compiler_report.budget.findings.omitted, 1);
  assert.equal(first.compiler_report.cache.status, "written");
  const second = compileContext(compilerEnvelope(root), catalogs);
  assert.equal(second.response.status, "ready");
  assert.equal(second.compiler_report.cache.status, "hit");
  assert.equal(second.compiler_report.cache.hit, true);
  assert.equal(
    second.compiler_report.cache.projection_digest,
    first.compiler_report.cache.projection_digest
  );
  assert.match(
    fs.readFileSync(path.join(root, ".zipzap", ".gitignore"), "utf8"),
    /\/cache\//
  );
});

test("context compiler blocks a capsule over its deterministic output budget", (context) => {
  const root = project(context);
  const envelope = compilerEnvelope(root, { cache_mode: "off" });
  envelope.request.request.execution_budget.max_tool_output_bytes = 1024;
  const compiled = compileContext(envelope, catalogs);
  assert.equal(compiled.response.status, "blocked");
  assert.equal(compiled.compiler_report.budget.output_limit_enforced, true);
  assert.ok(compiled.compiler_report.budget.output_bytes <= 1024);
});

test("completion view never promotes tests to independent Review", () => {
  const completion = completeWork({
    schema_version: 1,
    work_id: "completion-work",
    collaboration_view: collaborationView(),
    outcome: {
      status: "succeeded",
      summary: "Implemented and tested the change.",
      artifact_change: true
    },
    evidence: [
      {
        id: "implementation",
        kind: "implementation",
        locator: "git:working-tree",
        statement: "Implementation exists."
      },
      {
        id: "tests",
        kind: "test",
        locator: "command:node --test",
        statement: "Tests passed."
      }
    ],
    tests: { status: "passed", evidence_refs: ["tests"] },
    review: { mode: "none", outcome: "not-run", evidence_refs: [] },
    findings: [],
    approvals: [],
    residual_risks: [],
    limitations: [],
    continuation: null
  });
  assert.equal(completion.status, "complete");
  assert.equal(completion.completion_label, "tested");
  assert.equal(completion.assurance_mode, "self");
  assert.match(completion.execution_stamp, /^solo · Owl/);
});

test("completion view stays partial when an artifact change lacks evidence", () => {
  const completion = completeWork({
    schema_version: 1,
    work_id: "completion-work",
    collaboration_view: collaborationView(),
    outcome: {
      status: "succeeded",
      summary: "A change was reported.",
      artifact_change: true
    },
    evidence: [],
    tests: { status: "not-run", evidence_refs: [] },
    review: { mode: "none", outcome: "not-run", evidence_refs: [] },
    findings: [],
    approvals: [],
    residual_risks: [],
    limitations: [],
    continuation: null
  });
  assert.equal(completion.status, "partial");
  assert.equal(completion.completion_label, "partial");
  assert.match(completion.limitations[0], /lacks implementation evidence/);
});

test("project handoff is immutable and stored one file per record", (context) => {
  const root = project(context);
  const input = {
    schema_version: 1,
    persistence: "project",
    project: { locator: root },
    handoff: {
      handoff_id: "developer-reviewer-1",
      work_id: "handoff-work",
      from: {
        slot: "builder",
        profile: "owl",
        display_name: "Owl",
        role: "developer",
        stage: "produce"
      },
      to: {
        slot: "reviewer",
        profile: "eagle",
        display_name: "Eagle",
        role: "reviewer",
        stage: "review"
      },
      objective: "Review the implementation.",
      completed_work: ["Implemented the change."],
      artifact_refs: [{ locator: "git:working-tree", version: null }],
      evidence: [],
      findings: [],
      unresolved_decisions: [],
      limitations: [],
      next_action: "Perform independent Review."
    }
  };
  const created = createHandoff(input);
  assert.equal(created.write_performed, true);
  assert.equal(
    created.locator,
    ".zipzap/handoffs/handoff-work/developer-reviewer-1.json"
  );
  assert.match(created.record.content_sha256, /^sha256:[a-f0-9]{64}$/);
  assert.throws(() => createHandoff(input), /immutable handoff already exists/);
});
