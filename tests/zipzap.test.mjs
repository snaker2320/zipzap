import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDecisionBundles,
  compose,
  evaluateKernel,
  loadCatalogs,
  projectDecisionInteraction,
  queryCatalog,
  validateCatalogs
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function baseInput(overrides = {}) {
  return {
    schema_version: 1,
    work_id: "test-work",
    work_signals: {
      objective: "Deliver the requested outcome.",
      scope_summary: "Bounded test scope.",
      work_type: "development",
      requested_action: "modify",
      affected_components: [],
      risk_flags: [],
      required_gates: [],
      required_evidence: []
    },
    host_capability: {
      concurrency_limit: 2,
      distinct_context_limit: 5,
      multi_agent_authorization: "granted"
    },
    ...overrides
  };
}

function baseKernelRequest(overrides = {}) {
  return {
    schema_version: 1,
    work: {
      id: "kernel-work",
      objective: "Deliver the requested outcome.",
      requested_action: "modify",
      scope: [],
      affected_components: []
    },
    governance: {
      risk_flags: [],
      required_gates: [],
      required_evidence: [],
      project_sources: []
    },
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 5,
      multi_agent_authorization: "granted"
    },
    ...overrides
  };
}

test("catalogs are internally valid", () => {
  const result = validateCatalogs(catalogs);
  assert.equal(result.valid, true);
  assert.deepEqual(result.counts, {
    invariants: 8,
    agents: 5,
      roles: 4,
      teams: 4,
      control_functions: 2,
      execution_profiles: 1,
      risk_signals: 11,
    task_policies: 12,
    onboarding_questions: 6,
    adapters: 3,
    releases: 6
  });
});

test("rejects experience policy that can skip an active decision", () => {
  const unsafe = structuredClone(catalogs);
  delete unsafe.experience.decision_interaction;
  delete unsafe.experience.policies.decision_bundles_stop_execution;

  const result = validateCatalogs(unsafe);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /decision interaction/i);
});

test("queries a role capsule without loading the full catalog", () => {
  const capsule = queryCatalog(catalogs, "roles", "developer", "capsule");
  assert.equal(
    capsule.must_not.includes("Claim independent review or unauthorized approval."),
    true
  );
});

test("queries the compact design diagnostic capsule", () => {
  const capsule = queryCatalog(
    catalogs,
    "execution-profiles",
    "design-diagnostic",
    "capsule"
  );
  assert.equal(capsule.role, "reviewer");
  assert.equal(capsule.stage, "review");
  assert.equal(capsule.claim_limit, "advisory");
  assert.match(capsule.prohibited.join(" "), /Run tests/);
});

test("bundled runtime schemas match the L4 Kernel envelope", () => {
  const result = evaluateKernel(
    baseKernelRequest({
      state: {
        current_role: "developer",
        current_stage: "produce"
      }
    }),
    catalogs
  );
  const schema = catalogs.schemas.runtimeOutput;
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.deepEqual(
    Object.keys(result).sort(),
    [...schema.required].sort()
  );
});

test("L4 Kernel returns one ready next action", () => {
  const result = evaluateKernel(
    baseKernelRequest({
      governance: {
        risk_flags: [],
        required_gates: [
          "independent-testing-from-developer",
          "independent-review-from-developer"
        ],
        required_evidence: ["tests"],
        project_sources: []
      },
      state: {
        current_role: "developer",
        current_stage: "produce"
      }
    }),
    catalogs
  );
  assert.equal(result.status, "ready");
  assert.equal(result.next_action.participant.profile, "wolf");
  assert.equal(result.next_action.participant.role, "developer");
  assert.equal(result.assurance.mode, "independent-from-developer");
  assert.equal(
    result.next_action.instructions.source_access.includes(
      "Treat truncation as incomplete evidence, never as proof of absence."
    ),
    true
  );
});

test("L4 Kernel defaults routine work to Developer Produce without prompting", () => {
  const result = evaluateKernel(baseKernelRequest(), catalogs);
  assert.equal(result.status, "ready");
  assert.equal(result.next_action.participant.role, "developer");
  assert.equal(result.next_action.participant.stage, "produce");
  assert.deepEqual(result.decisions_required, []);
  assert.deepEqual(result.decision_bundles, []);
  assert.deepEqual(result.decision_interaction, {
    must_pause: false,
    presentation: "none",
    bundle_ids: [],
    visible_question_ids: []
  });
  assert.deepEqual(Object.keys(result).sort(), [
    "assurance",
    "continuation",
    "decision_bundles",
    "decision_interaction",
    "decisions_required",
    "diagnostics_ref",
    "next_action",
    "schema_version",
    "status"
  ]);
});

test("L5 schemas expose four operations and four workflow statuses", () => {
  assert.deepEqual(
    catalogs.schemas.l5Input.properties.operation.enum,
    ["initialize", "execute", "resume", "inspect"]
  );
  assert.deepEqual(
    catalogs.schemas.l5Output.properties.status.enum,
    ["ready", "decision-required", "blocked", "completed"]
  );
  assert.equal(catalogs.schemas.l5Input.oneOf.length, 4);
  assert.equal(catalogs.schemas.l5Output.oneOf.length, 2);
});

test("L5 initialize requires an explicit action and project manifest contract", () => {
  const initializeBranch = catalogs.schemas.l5Input.oneOf.find(
    (branch) => branch.properties.operation.const === "initialize"
  );
  assert.deepEqual(initializeBranch.required, ["project", "initialization"]);
  assert.deepEqual(
    catalogs.schemas.l5Input.$defs.initialization.properties.action.enum,
    ["discover", "configure", "refresh"]
  );
  assert.equal(
    catalogs.schemas.l5Input.$defs.initialization.properties.preferences.$ref,
    "./onboarding-input.schema.json#/$defs/configuration"
  );
  assert.deepEqual(
    catalogs.schemas.projectManifest.required,
    ["schema_version", "project_id", "sources"]
  );
});

test("selects Solo for work with no additional assurance", () => {
  const result = compose(baseInput(), catalogs);
  assert.equal(result.preset_resolution.effective, "solo");
  assert.equal(result.team_binding.members.length, 1);
});

test("does not bind an insufficient explicit Copilot preset", () => {
  const result = compose(
    baseInput({
      user_selection: {
        team_preset: "copilot"
      },
      host_capability: {
        concurrency_limit: 3
      },
      work_signals: {
        ...baseInput().work_signals,
        required_gates: [
          "independent-review-from-developer"
        ]
      }
    }),
    catalogs
  );
  assert.equal(result.preset_resolution.effective, null);
  assert.equal(result.preset_resolution.recommended, "trio");
  assert.equal(result.preset_resolution.status, "decision-required");
  assert.equal(result.team_binding, null);
});

test("selects Trio and projects Developer Produce", () => {
  const result = compose(
    baseInput({
      host_capability: {
        concurrency_limit: 2,
        distinct_context_limit: 5,
        multi_agent_authorization: "granted"
      },
      work_signals: {
        ...baseInput().work_signals,
        required_gates: [
          "independent-testing-from-developer",
          "independent-review-from-developer"
        ]
      },
      execution_state: {
        current_role: "developer",
        current_stage: "produce"
      }
    }),
    catalogs
  );
  assert.equal(result.preset_resolution.effective, "trio");
  assert.equal(result.runtime_projection.participant.slot, "builder");
  assert.equal(result.runtime_projection.participant.role, "developer");
  assert.equal(
    result.runtime_projection.instructions.control_function_overlay,
    null
  );
});

test("selects Squad for regulated data and respects concurrency", () => {
  const result = compose(
    baseInput({
      host_capability: {
        concurrency_limit: 2,
        distinct_context_limit: 5,
        multi_agent_authorization: "granted"
      },
      work_signals: {
        ...baseInput().work_signals,
        risk_flags: [
          "regulated-data",
          "difficult-to-reverse"
        ]
      }
    }),
    catalogs
  );
  assert.equal(result.preset_resolution.effective, "squad");
  assert.equal(result.team_binding.members.length, 5);
  assert.equal(
    result.team_binding.schedule.waves.every((wave) => wave.length <= 2),
    true
  );
});

test("projects Copilot Advisor without role authority", () => {
  const result = compose(
    baseInput({
      user_selection: {
        team_preset: "copilot",
        personalization: {
          agent_aliases: {
            eagle: "Sentinel"
          },
          response_detail: "detailed",
          humor: "none"
        }
      },
      host_capability: {
        concurrency_limit: 2,
        distinct_context_limit: 2,
        multi_agent_authorization: "granted"
      },
      work_signals: {
        ...baseInput().work_signals,
        required_gates: [
          "second-context"
        ]
      },
      execution_state: {
        target_slot: "copilot",
        current_function: "advisor",
        current_checkpoint: "pre-verification"
      }
    }),
    catalogs
  );
  assert.equal(result.preset_resolution.effective, "copilot");
  assert.equal(result.team_binding.personalization.humor, "off");
  assert.equal(
    result.team_binding.personalization.response_detail,
    "detailed"
  );
  assert.equal(result.runtime_projection.participant.display_name, "Sentinel");
  assert.equal(result.runtime_projection.participant.role, null);
  assert.equal(result.runtime_projection.participant.function, "advisor");
  assert.equal(result.runtime_projection.instructions.role_capsule, null);
  assert.notEqual(
    result.runtime_projection.instructions.control_function_overlay,
    null
  );
});

test("requires explicit authorization before binding multiple Agent contexts", () => {
  const request = baseKernelRequest({
    governance: {
      risk_flags: [],
      required_gates: ["second-context"],
      required_evidence: [],
      project_sources: []
    },
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 2,
      multi_agent_authorization: "unknown"
    },
    state: {
      current_role: "developer",
      current_stage: "produce"
    }
  });
  const result = evaluateKernel(request, catalogs);
  assert.equal(result.status, "decision-required");
  assert.equal(result.next_action, null);
  assert.equal(
    result.decisions_required[0].code,
    "multi-agent-authorization-required"
  );
  assert.equal(result.decision_bundles.length, 1);
  assert.equal(result.decision_bundles[0].required_authority, "user");
  assert.equal(
    result.decision_bundles[0].questions[0].kind,
    "single-select"
  );
  assert.deepEqual(
    result.decision_bundles[0].questions[0].options.map((option) => option.id),
    ["granted", "denied"]
  );
  assert.deepEqual(result.decision_interaction, {
    must_pause: true,
    presentation: "plain-text",
    bundle_ids: ["collaboration-decision"],
    visible_question_ids: ["multi-agent-authorization-required"]
  });
});

test("projects active decisions to a blocking host interaction", () => {
  const bundles = buildDecisionBundles([
    {
      code: "confirm-launch",
      kind: "confirm",
      message: "Launch the selected team?",
      options: [
        { id: "confirm", label: "Confirm" },
        { id: "cancel", label: "Cancel" }
      ]
    },
    {
      code: "choose-focus",
      message: "Choose the exploration focus.",
      options: [
        { id: "business", label: "Business" },
        { id: "technology", label: "Technology" }
      ]
    }
  ], { id: "launch-team" });

  assert.deepEqual(
    projectDecisionInteraction(bundles, {
      preferred_presentation: "form",
      native_form_available: true
    }),
    {
      must_pause: true,
      presentation: "native-form",
      bundle_ids: ["launch-team"],
      visible_question_ids: ["confirm-launch", "choose-focus"]
    }
  );
  assert.deepEqual(
    projectDecisionInteraction(bundles, {
      preferred_presentation: "form",
      native_form_available: false
    }),
    {
      must_pause: true,
      presentation: "stepwise",
      bundle_ids: ["launch-team"],
      visible_question_ids: ["confirm-launch"]
    }
  );
  assert.deepEqual(projectDecisionInteraction([]), {
    must_pause: false,
    presentation: "none",
    bundle_ids: [],
    visible_question_ids: []
  });
});

test("builds atomic multi-select forms and separates decision authorities", () => {
  const bundles = buildDecisionBundles(
    [
      {
        code: "choose-scouts",
        kind: "multi-select",
        label: "Choose exploration lenses",
        description: "Select the roles that should investigate independently.",
        required_authority: "user",
        min_selections: 1,
        max_selections: 3,
        options: [
          { id: "business", label: "Business" },
          { id: "technology", label: "Technology" },
          { id: "risk", label: "Risk" }
        ]
      },
      {
        code: "accept-business-scope",
        message: "Accept the resulting business scope.",
        required_authority: "product-owner"
      }
    ],
    {
      id: "exploration-setup",
      title: "Configure exploration",
      context: "Resolve the exploration setup before launching Agent contexts."
    }
  );

  assert.equal(bundles.length, 2);
  const userBundle = bundles.find(
    (bundle) => bundle.required_authority === "user"
  );
  assert.equal(userBundle.submit_mode, "atomic");
  assert.equal(userBundle.questions[0].kind, "multi-select");
  assert.equal(userBundle.questions[0].min_selections, 1);
  assert.equal(userBundle.questions[0].max_selections, 3);
  assert.equal(
    bundles.find((bundle) => bundle.required_authority === "product-owner")
      .questions.length,
    1
  );
});

test("rejects invalid decision form selection bounds", () => {
  assert.throws(
    () =>
      buildDecisionBundles([
        {
          code: "choose-scouts",
          kind: "multi-select",
          description: "Choose exploration roles.",
          min_selections: 2,
          max_selections: 1,
          options: [
            { id: "product", label: "Product" },
            { id: "risk", label: "Risk" }
          ]
        }
      ]),
    /selection bounds are invalid/
  );
});

test("does not downgrade denied Multi-Agent assurance to Solo", () => {
  const request = baseKernelRequest({
    governance: {
      risk_flags: [],
      required_gates: ["second-context"],
      required_evidence: [],
      project_sources: []
    },
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 2,
      multi_agent_authorization: "denied"
    },
    state: {
      current_role: "developer",
      current_stage: "produce"
    }
  });
  const result = evaluateKernel(request, catalogs);
  assert.equal(result.status, "blocked");
  assert.equal(result.next_action, null);
  assert.equal(result.assurance.mode, "unavailable");
  assert.equal(
    result.assurance.limitations.some((item) =>
      item.includes("Multi-Agent execution was denied")
    ),
    true
  );
});

test("Solo remains available without a Multi-Agent authorization decision", () => {
  const result = evaluateKernel(
    baseKernelRequest({
      host: {
        concurrency_limit: 1,
        distinct_context_limit: 1,
        multi_agent_authorization: "unknown"
      },
      state: {
        current_role: "developer",
        current_stage: "produce"
      }
    }),
    catalogs
  );
  assert.equal(result.status, "ready");
  assert.equal(result.assurance.mode, "self");
});

test("supersedes a projection on a normal stage transition", () => {
  const result = compose(
    baseInput({
      work_signals: {
        ...baseInput().work_signals,
        required_gates: [
          "independent-testing-from-developer",
          "independent-review-from-developer"
        ]
      },
      execution_state: {
        current_role: "developer",
        current_stage: "produce"
      },
      event: {
        type: "stage-transitioned",
        previous_projection_id: "test-work-wolf-plan"
      },
      previous: {
        preset_resolution_revision: 1,
        binding_revision: 1,
        projection_revision: 1
      }
    }),
    catalogs
  );
  assert.equal(result.reconciliation_result.action, "rebuild-projection");
  assert.equal(result.reconciliation_result.superseded.length, 1);
  assert.equal(result.reconciliation_result.invalidated.length, 0);
  assert.equal(result.runtime_projection.revision, 2);
});

test("invalidates a projection when risk changes", () => {
  const result = compose(
    baseInput({
      work_signals: {
        ...baseInput().work_signals,
        risk_flags: [
          "regulated-data"
        ]
      },
      event: {
        type: "risk-changed",
        previous_projection_id: "test-work-wolf-produce"
      },
      previous: {
        preset_resolution_revision: 1,
        binding_revision: 1,
        projection_revision: 1
      }
    }),
    catalogs
  );
  assert.equal(result.preset_resolution.effective, "squad");
  assert.equal(result.reconciliation_result.action, "re-resolve-preset");
  assert.equal(result.reconciliation_result.invalidated.length, 1);
  assert.equal(result.reconciliation_result.superseded.length, 0);
  assert.equal(result.preset_resolution.revision, 2);
});

test("rejects unknown personalization fields", () => {
  assert.throws(
    () =>
      compose(
        baseInput({
          user_selection: {
            personalization: {
              status_updates: "concise"
            }
          }
        }),
        catalogs
      ),
    /unknown personalization field/
  );
});
