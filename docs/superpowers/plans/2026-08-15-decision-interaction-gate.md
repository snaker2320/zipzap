# Decision Interaction Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Decision Bundles into a host-neutral interaction gate that always pauses for user input, including outside Plan mode.

**Architecture:** Add one shared interaction projection derived from Decision Bundles and expose it through every user-facing workflow. Keep host rendering separate: native form when available, conversational fallback otherwise. Reinforce the machine contract with imperative ZipZap skill instructions.

**Tech Stack:** Node.js ESM, JSON Schema draft 2020-12, Node test runner, Markdown skill contract.

## Global Constraints

- Preserve current Decision Bundle IDs, authority, revisions, and submission modes.
- Perform no project write or Multi-Agent launch while `must_pause` is true.
- Plan mode is optional; non-Plan fallback is required.

---

### Task 1: Interaction projection contract

**Files:**
- Modify: `tests/zipzap.test.mjs`
- Modify: `scripts/zipzap.mjs`
- Modify: `schemas/user-view.schema.json`

**Interfaces:**
- Consumes: `decision_bundles` and a requested presentation.
- Produces: `projectDecisionInteraction(bundles, options)` and the extended `user_view.interaction` object.

- [ ] Write tests asserting active bundles pause and empty bundles do not.
- [ ] Run the focused tests and verify they fail because the projection is missing.
- [ ] Implement the minimal projection and schema fields.
- [ ] Run the focused tests and verify they pass.

### Task 2: Workflow integration

**Files:**
- Modify: `tests/onboarding.test.mjs`
- Modify: `tests/first-run.test.mjs`
- Modify: `tests/l5-task.test.mjs`
- Modify: `scripts/zipzap.mjs`
- Modify: `schemas/onboarding-output.schema.json`

**Interfaces:**
- Consumes: each workflow's authoritative `decision_bundles`.
- Produces: matching `user_view.interaction` pause and presentation metadata.

- [ ] Write workflow tests for native-form, stepwise, plain-text, and no-decision paths.
- [ ] Run focused tests and verify the new assertions fail.
- [ ] Wire the projection into onboarding, First Run, and L5 responses.
- [ ] Run focused tests and verify they pass.

### Task 3: Skill enforcement and release validation

**Files:**
- Modify: `SKILL.md`
- Modify: `references/decision-forms.md`
- Modify: `config/experience.json`
- Modify: release metadata and related tests if required by repository policy.

**Interfaces:**
- Consumes: `user_view.interaction.must_pause` and Decision Bundles.
- Produces: mandatory render-pause-resume behavior for ZipZap consumers.

- [ ] Add a failing behavioral/contract validation for the new experience policy.
- [ ] Add the minimal imperative skill instructions and catalog policy.
- [ ] Run schema validation, focused tests, the full test suite, and skill validation.
