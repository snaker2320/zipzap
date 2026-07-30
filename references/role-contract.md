# Role Contract and Runtime Projections

Load this reference when creating, changing, validating, or auditing a role.
Do not load it for routine execution under an already configured role.

## Contents

- Authoritative Role Contract
- Runtime Modules
- Projection Algorithm
- Validation Rules
- Conservative Fallback

## Authoritative Role Contract

Store complete standard roles in
[`config/roles.json`](../config/roles.json). Define these dimensions in JSON:

| Field | Purpose |
| --- | --- |
| `id` | Stable machine-facing identity |
| `display_name` | Localized human-facing name |
| `purpose` | Outcome for which the role is accountable |
| `select_when` | Conditions that route work to the role |
| `excluded_scope` | Work and claims outside the role |
| `responsibilities` | Non-optional duties |
| `authority` | Decisions the role may and may not make |
| `inputs` | Required and conditional starting information |
| `rule_selectors` | Project rule topics to resolve on demand |
| `stages` | Stage-specific instructions, outputs, and exit gates |
| `escalation` | Conditions requiring pause or higher authority |
| `independence` | Conflicts and separation-of-duty constraints |
| `completion_claims` | Permitted completion states and claims |

Keep project business rules outside the catalog. Store topic selectors and
source locators, not copied rule text. Use
`node scripts/zipzap.mjs validate` after changing a catalog.

## Runtime Modules

Split the contract logically into:

### Capsule

Keep the stable minimum:

- role ID and purpose;
- non-negotiable responsibilities;
- authority needed for ordinary work;
- prohibitions and truthfulness boundaries.

Target 150–250 tokens. Shorten wording before removing a material boundary.

### Stage Overlay

Include only what changes with the current stage:

- current objective;
- required actions and outputs;
- evidence to collect;
- exit gate;
- next expected handoff.

Target 100–200 tokens per active overlay.

### Conditional Policy

Activate a policy through explicit selectors such as:

- production impact;
- destructive or irreversible action;
- security, privacy, money, or regulated data;
- schema migration or shared interface change;
- required independent review;
- external communication or human approval.

Keep inactive policies out of runtime context.

## Projection Algorithm

Build a projection in this order:

1. Select the current role and its capsule.
2. Select exactly one current stage overlay unless the workflow explicitly
   combines stages.
3. Evaluate policy selectors against work scope, risk, and requested action.
4. Resolve rule selectors against the project's source registry.
5. Add the minimum work and handoff context needed for the action.
6. Remove duplicate, explanatory, completed-stage, and unrelated content.
7. Verify that no omitted item changes authority, safety, required output, or
   the current exit gate.

Rebuild the projection whenever role, stage, scope, risk, or handoff changes.

## Validation Rules

Reject or revise a role definition when:

- it permanently binds a named agent profile;
- it embeds project-specific rule content;
- its authority or prohibitions are ambiguous;
- it permits self-review to satisfy an independent-review gate;
- an output has no corresponding evidence or gate where one is needed;
- escalation conditions have no destination or expected response;
- its capsule is simply a copy of the complete contract;
- runtime modules can contradict the authoritative contract.

## Conservative Fallback

When no project role is configured, create a temporary capsule containing:

- the requested role and outcome;
- the obligation to remain within scope and follow discovered project rules;
- the obligation to provide evidence and disclose uncertainty;
- the prohibition against changing acceptance criteria or claiming authority,
  approval, or independent review that was not granted.

Do not persist the fallback as a project role without user authorization.
