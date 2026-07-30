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
        schema_version: 1,
        operation: "execute",
        request: {
          intent: "Change the requested behavior.",
          objective: "Deliver the requested outcome.",
          scope: ["bounded component"],
          requested_action: "modify",
          constraints: [],
          acceptance_criteria: ["The requested behavior is verified."]
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
        confidence: item.confidence ?? "high"
      })),
      unknown_signals: unknown.map((item) => ({
        id: item.id,
        question: item.question ?? `Clarify ${item.id}.`,
        required_authority: item.required_authority ?? "project-owner",
        evidence_refs: item.evidence_refs ?? []
      }))
    },
    host: {
      concurrency_limit: 2,
      distinct_context_limit: 5
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
});
