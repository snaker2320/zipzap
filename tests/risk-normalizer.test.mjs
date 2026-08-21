import assert from "node:assert/strict";
import test from "node:test";

import {
  evaluateKernel,
  loadCatalogs,
  normalizeRiskAssessment
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();
const allSignals = Object.keys(catalogs.riskTaxonomy.signals);

function normalizationInput({
  present = [],
  unknown = [],
  teamPreset = null,
  evidence = [],
  request = {},
  host = {},
  state = {
    current_role: "developer",
    current_stage: "produce"
  }
} = {}) {
  return {
    schema_version: 1,
    work_id: "risk-work",
    work_type: "development",
    affected_components: [],
    assessment_input: {
      schema_version: 1,
      taxonomy_version: 1,
      invocation: {
        schema_version: 2,
        operation: "execute",
        request: {
          intent: "Change the requested behavior.",
          objective: "Deliver the requested outcome.",
          scope: ["bounded component"],
          requested_action: "modify",
          constraints: [],
          acceptance_criteria: ["The requested behavior is verified."],
          ...request
        },
        ...(teamPreset
          ? {
              collaboration: {
                team_preset: teamPreset
              }
            }
          : {})
      },
      evidence
    },
    assessment: {
      schema_version: 1,
      taxonomy_version: 1,
      evaluated_signals: [...allSignals],
      present_signals: present.map((item) => ({
        id: item.id,
        evidence_refs: item.evidence_refs ?? ["request.objective"],
        confidence: item.confidence ?? "high",
        ...(item.exposure ? { exposure: item.exposure } : {})
      })),
      unknown_signals: unknown.map((item) => ({
        id: item.id,
        question: item.question ?? `Clarify ${item.id}.`,
        required_authority: item.required_authority ?? "project-owner",
        evidence_refs: item.evidence_refs ?? [],
        ...(item.exposure ? { exposure: item.exposure } : {})
      }))
    },
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 5,
      multi_agent_authorization: "granted",
      ...host
    },
    project_sources: [],
    ...(state ? { state } : {})
  };
}

test("normalizes a low-risk assessment and lets L4 select Solo", () => {
  const normalized = normalizeRiskAssessment(normalizationInput(), catalogs);
  assert.equal(normalized.status, "ready");
  assert.deepEqual(normalized.derived_governance.risk_flags, []);
  assert.equal(normalized.derived_governance.persistence_required, false);

  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.status, "ready");
  assert.equal(kernel.assurance.mode, "self");
  assert.equal(kernel.next_action.participant.profile, "owl");
});

test("maps material ambiguity to Copilot peer challenge", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      present: [
        {
          id: "ambiguous-material-requirements"
        }
      ]
    }),
    catalogs
  );
  assert.deepEqual(normalized.derived_governance.required_gates, [
    "peer-challenge"
  ]);
  assert.deepEqual(normalized.derived_governance.requires_approval, [
    "product-or-domain-owner"
  ]);

  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.assurance.mode, "peer-challenge");
  assert.equal(kernel.next_action.participant.profile, "wolf");
});

test("maps external user impact to Trio", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      present: [
        {
          id: "external-user-impact"
        }
      ]
    }),
    catalogs
  );
  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.assurance.mode, "independent-from-developer");
  assert.equal(kernel.next_action.participant.profile, "wolf");
});

test("maps regulated data to Squad and persistent governance", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      present: [
        {
          id: "privacy-or-regulated-data"
        }
      ]
    }),
    catalogs
  );
  assert.deepEqual(normalized.derived_governance.risk_flags, [
    "regulated-data"
  ]);
  assert.equal(normalized.derived_governance.persistence_required, true);

  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.assurance.mode, "full-separation");
  assert.equal(kernel.next_action.participant.profile, "wolf");
});

test("keeps high-risk subject matter lightweight for a read-only design diagnostic", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      request: {
        intent: "diagnose",
        scope_depth: "design-only",
        assurance_target: "advisory",
        requested_action: "diagnose-design"
      },
      present: [
        {
          id: "financial-impact",
          exposure: "subject"
        }
      ],
      host: {
        multi_agent_authorization: "unknown"
      },
      state: null
    }),
    catalogs
  );

  assert.equal(normalized.status, "ready");
  assert.equal(
    normalized.derived_governance.execution_profile,
    "design-diagnostic"
  );
  assert.deepEqual(normalized.derived_governance.subject_risk_signals, [
    "financial-impact"
  ]);
  assert.deepEqual(normalized.derived_governance.action_risk_signals, []);
  assert.deepEqual(normalized.derived_governance.required_gates, []);
  assert.deepEqual(normalized.derived_governance.requires_approval, []);
  assert.equal(normalized.derived_governance.persistence_required, false);
  assert.equal(normalized.derived_governance.claim_limit, "advisory");
  assert.equal(
    normalized.derived_governance.execution_budget.max_source_files,
    8
  );
  assert.match(
    normalized.derived_governance.review_focus.join(" "),
    /settlement states/
  );

  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.status, "ready");
  assert.equal(kernel.assurance.mode, "self");
  assert.equal(kernel.next_action.execution_profile, "design-diagnostic");
  assert.equal(kernel.next_action.participant.role, "reviewer");
  assert.equal(
    kernel.next_action.instructions.execution_profile_overlay.claim_limit,
    "advisory"
  );
  assert.match(
    kernel.next_action.instructions.execution_profile_overlay.prohibited.join(
      " "
    ),
    /Run tests/
  );
});

test("requires an upgrade when a diagnostic has current-action risk", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      request: {
        intent: "diagnose",
        scope_depth: "design-only",
        assurance_target: "advisory",
        requested_action: "diagnose-design"
      },
      present: [
        {
          id: "privacy-or-regulated-data",
          exposure: "action"
        }
      ],
      state: null
    }),
    catalogs
  );

  assert.equal(normalized.status, "decision-required");
  assert.equal(normalized.kernel_request, null);
  assert.equal(
    normalized.decisions_required[0].code,
    "diagnostic-upgrade-required"
  );
  assert.equal(normalized.derived_governance.persistence_required, true);
});

test("keeps subject uncertainty as a diagnostic limitation", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      request: {
        intent: "diagnose",
        scope_depth: "design-only",
        requested_action: "diagnose-design"
      },
      unknown: [
        {
          id: "ambiguous-material-requirements",
          exposure: "subject"
        }
      ],
      state: null
    }),
    catalogs
  );
  assert.equal(normalized.status, "ready");
  assert.deepEqual(normalized.derived_governance.subject_uncertainties, [
    "ambiguous-material-requirements"
  ]);
  assert.deepEqual(normalized.decisions_required, []);
});

test("requires an upgrade when diagnostic permissions exceed the profile", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      request: {
        intent: "diagnose",
        scope_depth: "design-only",
        requested_action: "diagnose-design",
        execution_budget: {
          allow_tests: true
        }
      },
      state: null
    }),
    catalogs
  );
  assert.equal(normalized.status, "decision-required");
  assert.equal(
    normalized.decisions_required[0].code,
    "diagnostic-upgrade-required"
  );
  assert.match(normalized.decisions_required[0].message, /permissions exceed/);
});

test("requires explicit risk exposure for a design diagnostic", () => {
  assert.throws(
    () =>
      normalizeRiskAssessment(
        normalizationInput({
          request: {
            intent: "diagnose",
            scope_depth: "design-only",
            requested_action: "diagnose-design"
          },
          present: [
            {
              id: "financial-impact"
            }
          ],
          state: null
        }),
        catalogs
      ),
    /requires subject, action, or both exposure/
  );
});

test("defaults acceptance to formal assurance", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      request: {
        intent: "accept",
        requested_action: "accept"
      },
      state: null
    }),
    catalogs
  );
  assert.equal(
    normalized.derived_governance.assurance_target,
    "formal-acceptance"
  );
  assert.equal(normalized.derived_governance.persistence_required, true);
  assert.deepEqual(normalized.derived_governance.requires_approval, [
    "authorized-acceptance-owner"
  ]);
  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.assurance.mode, "full-separation");
  assert.equal(kernel.next_action.participant.role, "product");
});

test("treats an explicit insufficient Solo selection as preference only", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      teamPreset: "solo",
      present: [
        {
          id: "external-user-impact"
        }
      ]
    }),
    catalogs
  );
  assert.equal(normalized.kernel_request.preferences.team_preset, "solo");

  const kernel = evaluateKernel(normalized.kernel_request, catalogs);
  assert.equal(kernel.status, "decision-required");
  assert.equal(
    kernel.decisions_required[0].code,
    "team-selection-required"
  );
  assert.deepEqual(kernel.decisions_required[0].options, ["trio"]);
});

test("requires a decision instead of assuming an unknown risk absent", () => {
  const normalized = normalizeRiskAssessment(
    normalizationInput({
      unknown: [
        {
          id: "security-critical",
          question: "Does this change affect an authentication boundary?",
          required_authority: "security-owner"
        }
      ]
    }),
    catalogs
  );
  assert.equal(normalized.status, "decision-required");
  assert.equal(normalized.kernel_request, null);
  assert.equal(normalized.decisions_required.length, 1);
  assert.equal(
    normalized.decisions_required[0].signal,
    "security-critical"
  );
});

test("rejects incomplete taxonomy coverage and invented evidence", () => {
  const incomplete = normalizationInput();
  incomplete.assessment.evaluated_signals.pop();
  assert.throws(
    () => normalizeRiskAssessment(incomplete, catalogs),
    /evaluate every registered risk signal/
  );

  const invented = normalizationInput({
    present: [
      {
        id: "security-critical",
        evidence_refs: ["invented-fact"]
      }
    ]
  });
  assert.throws(
    () => normalizeRiskAssessment(invented, catalogs),
    /cites unknown evidence/
  );
});

test("rejects AI attempts to select a team through assessment output", () => {
  const input = normalizationInput();
  input.assessment.team_preset = "solo";
  assert.throws(
    () => normalizeRiskAssessment(input, catalogs),
    /unknown risk assessment output field/
  );
});

test("registers the L5 risk assessment and normalization schemas", () => {
  assert.equal(
    catalogs.schemas.riskAssessmentInput.title,
    "ZipZap L5 Risk Assessment Input"
  );
  assert.equal(
    catalogs.schemas.riskAssessmentOutput.title,
    "ZipZap L5 Risk Assessment Output"
  );
  assert.equal(
    catalogs.schemas.riskNormalizationOutput.title,
    "ZipZap L5 Risk Normalization Output"
  );
  assert.equal(
    catalogs.schemas.diagnosticReview.title,
    "ZipZap Design Diagnostic Review"
  );
  assert.equal(
    catalogs.schemas.diagnosticReview.required.includes("task_id"),
    false
  );
  assert.equal(
    catalogs.executionProfiles.profiles["design-diagnostic"].role,
    "reviewer"
  );
});
