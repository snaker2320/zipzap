# Execution Policy

Load this reference when choosing ephemeral versus persistent work, assessing
risk, selecting single-agent versus multi-agent execution, or defining gates.

## Persistence Decision

Keep work ephemeral by default. Persist it when one or more of these conditions
applies:

- work must continue across sessions;
- multiple people or agents need shared state;
- progress, ownership, or dependencies must be tracked;
- an approval or audit trail is required;
- the change is high risk or difficult to reverse;
- findings or follow-up work must survive the current context;
- the project already requires a task record for this class of work.

Promote an existing ephemeral context rather than reconstructing it from
scratch. Preserve its decisions, evidence, and unresolved risks.

## Risk Factors

Raise assurance when work affects:

- production or external users;
- security, privacy, money, or regulated data;
- destructive or hard-to-reverse operations;
- shared interfaces, migrations, or broad dependencies;
- ambiguous requirements with material consequences;
- areas with weak tests or unfamiliar technology;
- authority boundaries or external communications.

Consider likelihood, impact, reversibility, observability, and recovery cost.
Do not infer low risk merely from a small diff.

## Execution Mode

Use a single agent when the work is low risk, bounded, reversible, and well
covered by objective verification.

Use multiple agents when independent judgment, specialization, parallel
investigation, or separation of duties materially improves assurance. Assign
roles intentionally; do not add agents only to imitate a team.

Use a human gate when completion requires authority, credentials, subjective
acceptance, or acceptance of residual risk.

## Context Selection

Load context by relevance rather than completeness:

1. Start with the current work context and role capsule.
2. Add only the current stage overlay.
3. Add conditional policies whose selectors match scope or risk.
4. Resolve and load only project rules needed for the current action.
5. Add prior handoff evidence needed to continue or verify the work.

Do not load every role, stage, policy, finding, or project rule preemptively.
Expand context when an ambiguity, failed gate, or material risk requires it.

## Gate Selection

Select gates proportionately:

- requirement or scope confirmation;
- implementation or artifact validation;
- automated and manual testing;
- independent review;
- security, privacy, or compliance review;
- user acceptance;
- deployment or release approval.

Record the evidence that satisfies each required gate. A stage transition is
not evidence by itself.

## Findings

Record a finding with:

- concise statement of the issue;
- evidence and affected scope;
- severity or consequence;
- owner or responsible role;
- disposition and rationale;
- verification of the resolution when fixed.

Keep a finding open until it has an explicit disposition. Do not erase a
finding merely because the main work moved forward.
