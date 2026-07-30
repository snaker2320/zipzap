---
name: zipzap
description: Initialize, run, and distribute role-based human-AI collaboration for ad-hoc work or persistent tasks. Use when Codex needs to configure collaboration roles and named agent profiles, select Solo, Copilot, Trio, or Squad team presets, personalize agents, create context-efficient runtime projections, register project rules without copying them, manage handoffs, apply risk-based gates, run testing and independent review, establish evidence-backed completion, or package, verify, install, upgrade, roll back, or publish the ZipZap Skill.
---

# ZipZap

Run human-AI work through explicit roles, risk-proportionate collaboration,
minimal context, evidence, and completion gates. Treat `config/*.json` and
`schemas/*.json` as machine authority. Load Markdown only for the current
decision.

## Run the Public Workflow

Normalize the request into one L5 operation:

- `initialize`: discover or configure project collaboration;
- `execute`: start ephemeral or persistent work;
- `resume`: continue from a continuation reference;
- `inspect`: query configuration, work, evidence, gates, or catalogs.

Preserve caller-owned intent and preferences. Let host context supply
capability, state, initialization results, and authoritative evidence. Never
claim approval, independence, satisfied gates, or host capability for the
caller.

Use the optional zero-dependency adapter:

```bash
node scripts/zipzap.mjs invoke --input l5-adapter-invocation.json
```

Use command-level `--help` or `--example` when constructing CLI input.
Return invalid input as a structured error. Return valid workflow state as
`ready`, `decision-required`, `blocked`, or `completed`. Expose only the next
accountable action; keep control-plane records behind diagnostics.

Read [the L5 interface](references/skill-interface.md) only when implementing,
validating, or debugging the public boundary.

## Route the Work

Classify before acting:

1. Initialize collaboration when project sources, roles, preferences, or gates
   are not registered.
2. Execute bounded work with an ephemeral context by default.
3. Persist a Task when continuity, coordination, approval, progress tracking,
   durable Findings, or risk governance adds value.
4. Resume by reconstructing current state from the Task, handoff, evidence,
   Findings, and registered project sources.

If initialization and execution are combined, configure only what the current
work requires, then continue.

## Preserve the Invariants

- Keep roles separate from named Agent Profiles. Product, developer, tester,
  and reviewer are roles; Owl, Fox, Wolf, Lynx, and Eagle are profiles.
- Bind runtime execution as profile + current role or control function + work
  context + stage context + applicable project rules.
- Treat Solo, Copilot, Trio, and Squad as logical topologies, not host
  concurrency counts.
- Let personalization change presentation only, never authority, project
  rules, gates, evidence, risk, or independence.
- Keep project rules in the project's source of truth. Register locators and
  load applicable fragments; never create shadow copies.
- Inject compact profile, role, and stage projections instead of full
  definitions during routine execution.
- Create a temporary work context for every request; persist selectively.
- Allow one Agent to perform roles sequentially, but never label self-review
  as independent Review.
- Require completion claims to cite acceptance, verification, Review, and
  remaining-risk evidence.

Read [the operating model](references/operating-model.md) only for conceptual
design, authority disputes, or audits.

## Initialize and Configure

Inspect before writing. Discover repository instructions, requirements,
architecture, development and testing standards, ownership, Review rules, and
verification commands. Register source locators, topics, selectors, authority,
and versions without copying source content.

Use:

```bash
node scripts/zipzap.mjs initialize --input l5-initialize-request.json
node scripts/zipzap.mjs source-resolve --input source-resolution-input.json
```

Keep discovery read-only. Store durable project registration in
`.zipzap/project.json`. Treat `AGENTS.md` as host-managed instructions and do
not load it twice.

For first-run or repeatable preferences:

```bash
node scripts/zipzap.mjs onboard --input onboarding-request.json
```

Prefer a host-rendered `form`; use `stepwise` conversation as fallback. Do not
require Plan mode. Preview and confirm before writing. Keep team choice a
preference that risk and assurance may strengthen.

Read [project initialization](references/project-initialization.md) for source
registration and [guided onboarding](references/onboarding.md) for form,
reconfiguration, reset, scope, and precedence behavior.

## Establish Context and Persistence

Keep the active context limited to:

- objective, scope, constraints, exclusions, and acceptance criteria;
- current profile, role or control function, stage, and handoff;
- selected project-source locators and loaded fragments;
- required evidence, gates, risks, Findings, and unresolved decisions.

Keep ordinary work in the session. For durable work, store current Task state
under `.zipzap/tasks/`, append events under `.zipzap/events/`, store Reviews
under `.zipzap/reviews/`, and treat `.zipzap/reports/` as rebuildable.

Use the independent local entry point:

```bash
node scripts/task.mjs create --input task.json
node scripts/task.mjs assess --id task-id
```

Use `node scripts/task.mjs <command> --help` for options and `--example` when
the command exposes a copyable JSON input.
Associate Git Commits only through an explicit SHA or
`ZipZap-Task: task-id` trailer. Treat range, path, author, and branch matches
as candidates. Git activity is evidence of activity, not proof of completion.

Let scripts aggregate Task, Git, verification, and Review facts before asking
AI to explain them. Preserve sample size, task mix, confidence, evidence
references, and limitations in reports and capability profiles; do not produce
an unsupported performance ranking.

Read [execution policy](references/execution-policy.md) when deciding
persistence or gates. Read [local Task integration](references/task-integration.md)
before tracking Git, recording Reviews, assessing completion, or reporting.

## Assess Risk and Select Execution

Before L4 evaluation:

1. Assess every signal registered in `config/risk-taxonomy.json`.
2. Cite request or registered evidence for every present signal.
3. Mark materially unresolved signals unknown; do not assume absence.
4. Let deterministic normalization derive risk flags, evidence, gates,
   approvals, persistence, and required assurance.
5. Pass only a ready Kernel Request to L4 `evaluate`.

Do not let AI assessment choose a risk level, topology, gate, approval, or
policy effect. Treat a requested topology as a preference. Resolve unknowns
with the stated authority.

Use:

```bash
node scripts/zipzap.mjs normalize-risk --input risk-normalization-input.json
node scripts/zipzap.mjs evaluate --input kernel-request.json
```

Select the least costly topology satisfying assurance:

- Solo for bounded, reversible work without independent-assurance needs;
- Copilot for primary execution plus continuous peer advice;
- Trio when implementation must be separated from testing and Review;
- Squad for high-risk work requiring fuller role and context separation.

If capacity is limited, schedule logical members sequentially or require a
human gate. Never silently downgrade required assurance.

## Execute the Minimal Projection

Let L4 resolve the preset, bind logical participants, route one minimal
projection, and reconcile material state changes. For routine work, load only:

```text
profile capsule
  + personalization overlay
  + role capsule or control-function overlay
  + current stage or checkpoint
  + triggered policies
  + applicable project-rule fragments
  + work and handoff context
```

The projection must state the participant, authority, objective, required
output, applicable constraints, evidence obligation, and exit gate. Load a
complete definition only when creating or changing it, validating coverage,
resolving authority, or auditing.

Execute proportionate stages:

1. Frame outcome, scope, sources, criteria, and risk.
2. Plan participants, gates, and evidence.
3. Produce the requested artifact.
4. Verify with reproducible checks.
5. Obtain independent Review when required; otherwise label self-review.
6. Resolve Findings with explicit disposition and rationale.
7. Complete only after criteria, evidence, gates, residual risks, and durable
   state agree.

Use humans for decisions requiring authority, credentials, business judgment,
approval, or acceptance of material risk. Make every handoff identify outcome,
changed artifacts, evidence, Findings, decisions, open risks, and requested
next role.

## Verify and Report Completion

Do not create ceremony that adds no assurance, and do not skip a required gate
because implementation is finished.

Report:

- delivered outcome and changed artifacts;
- checks and Reviews performed, including independence and results;
- acceptance criteria and supporting evidence;
- Findings and their disposition;
- residual risks, approvals, limitations, and follow-up work;
- persistent Task or continuation updates when applicable.

Use precise claims such as `implemented`, `tested`, `self-reviewed`,
`independently reviewed`, or `accepted by the user`. Do not collapse them into
an unsupported claim of `done`.

## Load References Only When Triggered

- Runtime composition or L4 audit: [runtime composition](references/runtime-composition.md).
- Preset debugging: [preset resolver](references/preset-resolver.md).
- Participant binding: [binding planner](references/binding-planner.md).
- Coordinator or advisor semantics: [control functions](references/control-functions.md).
- Projection construction: [context router](references/context-router.md).
- Runtime change or staleness: [projection reconciler](references/projection-reconciler.md).
- Role selection or authoring: [role catalog](references/role-catalog.md) and
  [role contract](references/role-contract.md). Load only the matching full
  definition: [product](references/role-product.md),
  [developer](references/role-developer.md),
  [tester](references/role-tester.md), or
  [reviewer](references/role-reviewer.md).
- Profile selection or authoring: [Agent catalog](references/agent-catalog.md)
  and [Agent Profile contract](references/agent-profile.md). Load only
  [Owl](references/agent-owl.md), [Fox](references/agent-fox.md),
  [Wolf](references/agent-wolf.md), [Lynx](references/agent-lynx.md), or
  [Eagle](references/agent-eagle.md) when that profile needs full inspection.
- Team selection or authoring: [team catalog](references/team-catalog.md) and
  [Team Preset contract](references/team-preset.md). Load only
  [Solo](references/team-solo.md), [Copilot](references/team-copilot.md),
  [Trio](references/team-trio.md), or [Squad](references/team-squad.md) when
  that preset needs full inspection.

Query a narrow machine-readable section instead of loading a catalog:

```bash
node scripts/zipzap.mjs catalog --kind roles --id developer --section capsule
```

## Adapt and Distribute

Before relying on scripts, project writes, concurrency, distinct contexts, or
state, assess the host through `config/compatibility.json`. Prefer native
execution, then the optional Node adapter, then direct JSON. Missing Node may
disable acceleration but must not make ZipZap unusable. Never weaken output
semantics or assurance to fit an adapter.

Treat L7 as distribution control, not another execution interface. Let
`config/lifecycle.json` and lifecycle schemas govern build, verification,
publish, install, upgrade, and rollback:

```bash
node scripts/zipzap.mjs lifecycle --input lifecycle-request.json
```

Let the host installer own authorized file mutation and recoverable backup.
Never install runtime packages. Keep installation separate from project
initialization and preserve project-owned `.zipzap/` state across lifecycle
operations.
