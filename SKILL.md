---
name: zipzap
description: Initialize and run role-based human-AI collaboration for ad-hoc work or persistent tasks. Use when Codex needs to configure collaboration roles and named agent profiles, select Solo, Copilot, Trio, or Squad team presets, personalize agent names and communication style, create context-efficient runtime projections, register project rules without copying them, manage handoffs, apply risk-based gates, run testing and independent review, track findings, or establish evidence-backed completion.
---

# ZipZap

Configure the collaboration system appropriate to the project and execute work
through explicit roles, context, evidence, and completion gates.

## Preserve the Core Invariants

- Keep roles separate from named agent profiles. Treat product, development,
  testing, and review as roles; treat Owl, Wolf, Eagle, or other names as agent
  profiles.
- Keep team presets separate from host concurrency. Treat Solo, Copilot, Trio,
  and Squad as logical collaboration topologies that may execute sequentially.
- Let personalization change presentation, never authority, project rules,
  evidence requirements, gates, or independence.
- Bind execution at runtime as: agent profile + current role + work context +
  stage context + project rules.
- Keep complete role definitions as low-frequency authority. Inject only a
  context-efficient projection of the current role during routine execution.
- Keep project-specific rules in the project's source of truth. Register,
  route to, and load those rules only when needed; never maintain shadow copies.
- Create a temporary work context for every request. Persist a task only when
  durable coordination or governance adds value.
- Allow one agent to perform several roles sequentially, but never label its
  self-review as independent review.
- Require claims of completion to cite relevant evidence.

Read [references/operating-model.md](references/operating-model.md) when
reasoning about roles, profiles, contexts, stages, or their relationships.

## Route the Request

Classify the request before acting:

1. **Initialize collaboration**: discover a project's existing sources of truth
   and configure roles, profiles, standards, gates, and routing.
2. **Execute ad-hoc work**: establish an ephemeral work context and complete the
   work without creating durable task records by default.
3. **Execute tracked work**: create or use a persistent task when the work
   requires cross-session continuity, coordination, approval, progress
   tracking, or risk governance.
4. **Resume or assess work**: reconstruct context from the task, artifacts,
   handoffs, findings, and project sources before deciding the next action.

If the request combines initialization and execution, initialize only the
minimum collaboration configuration needed for the current work, then proceed.

## Initialize a Project

Inspect before creating or changing collaboration files:

1. Find repository instructions, specifications, task systems, test commands,
   review rules, ownership data, and existing agent configuration.
2. Identify authoritative sources and record references to them instead of
   duplicating their content.
3. Define only the roles the project needs.
4. Define named agent profiles independently from roles.
5. Establish output standards, acceptance gates, and escalation rules.
6. Select project-local persistence and integration points that fit existing
   conventions.
7. Report what was discovered, registered, created, left unchanged, and still
   needs a decision.

Read
[references/project-initialization.md](references/project-initialization.md)
before initializing or changing a project's ZipZap configuration.

## Establish Work Context

Create a compact working context whether or not it becomes a persistent task:

- objective and expected outcome;
- scope, constraints, and exclusions;
- relevant project sources of truth;
- current role and agent profile;
- stage and prior handoff state;
- acceptance criteria and required evidence;
- risks, findings, decisions, and unresolved questions.

Keep ephemeral context in the active conversation or execution environment.
Promote it to the project's task system only when the persistence policy calls
for durable state.

Read [references/execution-policy.md](references/execution-policy.md) when
choosing persistence, risk level, execution mode, or gates.

## Select the Team and Profiles

Honor an explicit team preset when it can satisfy the work's required
assurance. Otherwise recommend:

- **Solo** for low-risk, bounded, reversible work that does not require
  independent assurance.
- **Copilot** for everyday execution that benefits from a continuous second
  context offering correction and advice, but does not require a formal
  independent testing or review gate.
- **Trio** as the default for normal collaborative delivery with implementation
  separated from testing and review.
- **Squad** for high-risk or complex work requiring product, development,
  testing, and review to have distinct named profiles and contexts.

Do not silently downgrade a required separation-of-duty gate because fewer
agents or less concurrency are available. Execute logical members sequentially,
add a human gate, or disclose the unavailable assurance.

Read [references/team-catalog.md](references/team-catalog.md) to select a
standard preset. Read [references/agent-catalog.md](references/agent-catalog.md)
to select or explain the bundled profiles.

Load the generic contracts only when designing or validating these concepts:

- [Agent Profile contract](references/agent-profile.md)
- [Team Preset contract](references/team-preset.md)

Load exactly one matching full definition when initializing, changing,
validating, or auditing a named profile or team:

- Agents: [Owl](references/agent-owl.md),
  [Fox](references/agent-fox.md), [Wolf](references/agent-wolf.md),
  [Lynx](references/agent-lynx.md), or
  [Eagle](references/agent-eagle.md)
- Teams: [Solo](references/team-solo.md),
  [Copilot](references/team-copilot.md),
  [Trio](references/team-trio.md), or
  [Squad](references/team-squad.md)

Apply user personalization after selecting the stable profile. Allow aliases,
team tone, light humor, status style, and optional signatures. Keep the stable
profile ID and its bias guards intact.

Emit personalization with these canonical fields and values:

```yaml
personalization:
  agent_aliases: {}
  team_tone: quiet | balanced | lively
  humor: off | light
  status_style: concise | conversational
  signatures: hidden | visible
```

Normalize equivalent user language such as “no humor” to `humor: off`. Omit
unspecified fields rather than inventing preferences.

## Project the Current Role

Do not inject a complete role definition into routine execution context.
Compose the smallest sufficient runtime projection from:

```text
agent profile capsule
  + personalization overlay
  + role capsule
  + current stage overlay
  + triggered conditional policies
  + applicable project rules
  + work and handoff context
  = runtime role projection
```

Include only:

- the active profile's working style and bias guards;
- the current role's purpose and non-negotiable boundaries;
- the authority needed for the current action;
- current-stage obligations, outputs, and exit gate;
- policies triggered by the work's scope or risk;
- locators for project rules that must be loaded now.

Treat 60–120 tokens for a profile capsule, 150–250 tokens for a role capsule,
and 100–200 tokens for a stage overlay as design targets, not correctness
limits. Prefer correctness when a material boundary or risk requires more
context.

Load a complete role definition only when creating or changing the role,
validating its coverage, resolving an authority dispute, or auditing a prior
decision. Read
[references/role-contract.md](references/role-contract.md) for that work.

Read [references/role-catalog.md](references/role-catalog.md) when selecting
among the standard roles or creating a conservative fallback projection. Read
[references/context-router.md](references/context-router.md) when configuring,
debugging, or auditing routing and projection selection.

Load exactly one matching standard role definition only when initializing,
changing, validating, or auditing that role:

- [Product](references/role-product.md)
- [Developer](references/role-developer.md)
- [Tester](references/role-tester.md)
- [Reviewer](references/role-reviewer.md)

Do not load all role definitions during routine execution.

If a project has no role registry, synthesize a conservative projection from
the core invariants and work context. State material assumptions and avoid
granting authority that was not provided.

## Compose the Execution Team

Use the lightest mode that preserves the required assurance:

- Use a single agent for low-risk, tightly scoped work. Let it switch roles
  explicitly and preserve stage boundaries.
- Use distinct agents for independent review, material approval, adversarial
  testing, high-risk changes, or work where separation of duties matters.
- Use human participants for decisions requiring authority, business judgment,
  credentials, or acceptance of material risk.
- Make every handoff identify the outcome, changed artifacts, evidence,
  findings, decisions, open risks, and requested next role.

When additional agents are unavailable or not permitted, continue with the
strongest valid single-agent workflow and state which independent assurance was
not obtained.

## Execute Through Stages

Adapt the stages to the request rather than forcing every request through a
fixed board:

1. **Frame**: confirm the outcome, scope, sources, acceptance criteria, and risk.
2. **Plan**: select roles, execution mode, gates, and evidence requirements.
3. **Produce**: create the requested change or artifact within scope.
4. **Verify**: run proportionate checks and record their results.
5. **Review**: obtain independent review when required; otherwise label
   self-review accurately.
6. **Resolve**: disposition findings as fixed, accepted, deferred, duplicate,
   or not reproducible, with rationale.
7. **Complete**: confirm acceptance criteria, evidence, residual risks, and
   durable state updates.

Do not create ceremony that does not improve the outcome or its verifiability.
Do not skip a required gate merely because the implementation is finished.

## Report Completion

State:

- what outcome was delivered;
- what changed and where;
- which checks and reviews ran, with results;
- which findings remain and their disposition;
- which acceptance criteria are satisfied;
- which risks, approvals, or follow-up actions remain.

Use precise language such as “implemented,” “tested,” “self-reviewed,”
“independently reviewed,” or “accepted by the user.” Do not collapse these into
an unsupported claim of “done.”
