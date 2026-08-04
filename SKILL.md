---
name: zipzap
description: Run low-friction, role-based human-AI collaboration with project-rule routing, risk-proportionate Solo, Copilot, Trio, or Squad execution, compact context, evidence-backed completion, Git-shareable Demands, phase plans, and local Tasks. Use when Codex needs to initialize collaboration, capture or plan requirements, defects, or technical debt, promote ready work, diagnose a design, implement or verify work, conduct Review, manage Findings and handoffs, assess completion, report resource use, or distribute ZipZap.
---

# ZipZap

Run work with explicit authority, proportionate assurance, minimal context, and
truthful evidence. `config/*.json` and `schemas/*.json` are machine authority.
Load a reference only when its decision is active.

## Public Model

Expose only **Initialize**, **Work**, and **Complete**. Keep routing, layers,
bindings, projections, caching, and adapters internal unless diagnostics are
requested. Read [the machine interface](references/skill-interface.md) only to
implement or debug that boundary.

Default ordinary bounded work to ephemeral automatic selection and small,
reversible implementation to Solo Developer Produce. Do not create a Task or
ask for preferences when safe defaults suffice. Interrupt only for material
ambiguity, authority, approval, unsafe or irreversible action, missing
governing sources, or an unmet gate. Persist only for continuity, coordination,
approval, tracking, durable Findings, auditability, or project policy. Read
[execution policy](references/execution-policy.md) only for those decisions.

## Routing

Separate subject risk, current-action risk, and assurance target. Route
implementation to Developer Produce, verification to Tester Verify, Review or
diagnosis to Reviewer Review, and acceptance to Product Accept.

For `diagnose + design-only + advisory|self-review`, use `design-diagnostic`:
Solo Reviewer, read-only, ephemeral, bounded sources, no tests, advisory claims.
Load [its policy](references/design-diagnostic.md) only for that path. Advisory
intent never suppresses actual mutation, access, data, authority, or production
risk.

Resolve preferences as:

```text
request > personal project preferences > shared project defaults > ZipZap defaults
```

Governance overrides an insufficient preference. Require explicit authorization
before multiple Agent contexts.

## Invariants

- Roles are Product, Developer, Tester, and Reviewer; named Agent Profiles are
  separate identities/configurations.
- Solo, Copilot, Trio, and Squad are logical topologies, not concurrency counts.
- Personalization never changes authority, risk, gates, evidence, or independence.
- Register project-rule locators; never copy governing content into ZipZap.
- Sequential self-review is not independent Review.
- Never claim approval, capability, gates, completion, or production readiness
  without evidence.

Load [the operating model](references/operating-model.md) only for design or
authority audits. Load [roles](references/role-catalog.md),
[profiles](references/agent-catalog.md), [teams](references/team-catalog.md), or
[control functions](references/control-functions.md) only when selecting or
changing them.

## Context

For Work, prefer `invoke` with `context.compiler`. AI supplies an
evidence-backed risk assessment; the script merges preferences and registered
sources, derives governance, selects and binds the team, and returns one bounded
Projection. Use `compile` only for its diagnostic report.

Locate files and symbols before reading. Read the smallest useful heading or
line range and treat truncation as incomplete evidence. Enforce script-visible
budgets; disclose Host-enforced limits. Prefer exact Host Tokens; otherwise use
a clearly labeled low/medium/high relative estimate, never a false exact count. Cache only
deterministic Projection composition and always inject the returned capsule—a
digest is not model memory. Read
[context routing](references/context-router.md) only for loading, budgets,
cache, or Projection diagnostics.

## State and Claims

Initialization offers Quick (recommended defaults and one preview confirmation)
or Custom setup. Both discover read-only, preview, then perform one confirmed write to the
Git-shared `.zipzap/project.json`. Personal preferences belong in ignored
`.zipzap/state/preferences.json`; member onboarding must not rewrite shared
defaults unless requested. Installation never initializes a project. Load
[project initialization](references/project-initialization.md),
[onboarding](references/onboarding.md), or
[First Run](references/first-run.md) only during those flows.

Use `complete` for ephemeral work and `scripts/task.mjs assess` for Tasks. Cite
outcome, evidence, tests, Review, Findings, approvals, residual risks,
limitations, and continuation. Use precise labels such as `implemented`,
`tested`, `self-reviewed`, `independently-reviewed`, and `accepted-by-user`.
Place the execution stamp immediately before the result.

Render normal results through the compact Run Receipt: active team/view,
result, verification, necessary collaboration summary, resource band, and next
action only. Distinguish planned topology from Host-confirmed actual Contexts.
Load [the output template](references/output-template.md) only when rendering,
auditing actual execution, or controlling collaboration rounds.

Pass only actionable deltas between contexts. Persist authorized handoffs as
immutable `.zipzap/handoffs/<work-id>/<handoff-id>.json`; never overwrite or
replay full transcripts. Use Tasks only when justified and keep all shared
project state under `.zipzap/`, outside the installed Skill. Git activity is
candidate evidence, not completion. Persist Task Tokens only from exact Host
telemetry; keep rough bands ephemeral. Read [Task integration](references/task-integration.md) before Task
mutation, persistent Review, reporting, Feedback, or usage recording.

Capture requirements, defects, and technical debt with `scripts/demand.mjs`
without applying Task ceremony. Promote only triaged or planned Demand into a
Task, preserving both locators. Keep phase plans as small reference lists and
derive target-slip, deadline, blocked, and missing-record warnings; do not turn
them into capacity scheduling. Read [Task integration](references/task-integration.md)
before Demand promotion or phase-plan mutation.

When discussion reveals a material defect, requirement, or technical debt,
prefill a Capture Suggestion. Prompt immediately for blocker/high or currently
blocking findings, at stage end for medium, and only in the completion summary
for low/advisory. Never persist before confirmation. Prefer a Host form and
fall back to one stepwise choice. Read [Task integration](references/task-integration.md)
before presenting or confirming the suggestion.

## Host and Lifecycle

Report Multi-Agent contexts, guided forms, exact Token telemetry, Goal budgets,
Node acceleration, and state persistence through the Host Capability Matrix
with explicit fallbacks. Missing Node reduces acceleration, not semantics. Read
[Host capabilities](references/host-capabilities.md) only when adapting a Host.

Install no runtime packages. Preserve project `.zipzap/` state across upgrades.
Read [lifecycle control](references/lifecycle.md) only for build, verification,
installation, upgrade, rollback, or publication.
