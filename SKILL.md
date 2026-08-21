---
name: zipzap
description: Run low-friction, role-based human-AI collaboration with project-rule routing, risk-proportionate Solo, Copilot, Trio, or Squad execution, compact context, evidence-backed completion, and Git-shareable local Tasks. Use when Codex needs to initialize collaboration, diagnose an existing design, implement or verify work, conduct self or independent Review, manage Findings and handoffs, assess completion, report exact resource use, or package, install, upgrade, roll back, and publish ZipZap.
---

# ZipZap

Run work with explicit authority, minimal context, proportionate assurance,
and truthful evidence. Treat `config/*.json` and `schemas/*.json` as machine
authority. Load only the reference needed for the current decision.

## Keep Three Visible Actions

Expose only:

1. **Initialize**: register project rules and confirm preferences.
2. **Work**: start or continue the requested outcome.
3. **Complete**: verify evidence and make an accurate claim.

Keep layers, Kernel, normalization, bindings, projections, adapters, and
revisions internal unless the user requests diagnostics.
Read [the unified machine interface](references/skill-interface.md) only when
implementing or debugging that boundary.

## Stay Unobtrusive

- Start ordinary bounded work ephemerally with automatic team selection.
- Use Solo Developer Produce for small reversible implementation work.
- Do not create a Task, ask for preferences, or request a status decision when
  defaults are sufficient.
- Keep a ready action silent and report useful progress without asking.
- Interrupt only for material ambiguity, authority, approval, unsafe or
  irreversible action, missing governing sources, or an unmet gate.
- Ask one concise question for one accountable decision.
- At a critical checkpoint, emit structured Decision Bundles. One bundle may
  contain multiple related single-select, multi-select, or confirmation
  questions for the same authority; split different authorities.
- Persist only for continuity, coordination, approval, tracking, durable
  Findings, auditability, or project policy.

Read [the execution policy](references/execution-policy.md) when selecting
persistence, assurance, or gates.
Read [Decision Forms](references/decision-forms.md) when presenting or changing
structured choices at a critical checkpoint.

## Stop for Accountable Decisions

After every First Run, onboarding, risk-normalization, L4, or L5 call, inspect
`decision_interaction` before doing anything else.

1. If `must_pause` is `false`, continue normally.
2. If `must_pause` is `true`, render the referenced `decision_bundles`, stop
   execution, and wait for the required authority's answer.
3. Resume only after mapping the answer to the stable bundle, question,
   option, authority, and state-revision IDs.

Use a native choice form only when the host provides that interaction. Plan
mode is not required. Without a native form, ask the visible question in
ordinary conversation, one accountable question at a time; support
multi-select by collecting and validating option IDs in text. Never infer an
answer, accept a recommendation silently, perform a write, or launch multiple
Agent contexts while `must_pause` is `true`.

When **Initialize** is requested and `.zipzap/project.json` is absent, start
First Run instead of directly configuring project state. Present its choices
and final preview confirmation before the single write. Before a Multi-Agent
launch, treat `multi-agent-authorization-required` as a hard decision gate;
team selection alone is not authorization.

## Route Work by Outcome

Use structured request facts when available:

```json
{
  "intent": "diagnose",
  "scope_depth": "design-only",
  "assurance_target": "advisory"
}
```

Separate:

- subject risk, which selects what to inspect;
- current-action risk, which selects safety controls and persistence;
- assurance target, which selects topology, gates, and allowed claims.

Route implementation to Developer Produce, verification to Tester Verify,
Review or diagnosis to Reviewer Review, and acceptance to Product Accept.
Default `accept` to formal acceptance. Never use an advisory intent to suppress
actual mutation, access, authority, data, or production risk.

For `diagnose + design-only + advisory|self-review`, use the internal
`design-diagnostic` profile: Solo Reviewer, read-only, ephemeral, no tests, no
Task, bounded sources, and advisory output. Load
[Design Diagnostic Review](references/design-diagnostic.md) for that path.

Assess every risk signal with evidence. For a design diagnostic, label each
classified signal `subject`, `action`, or `both`; apply formal effects only to
current-action risk. Let deterministic normalization derive policy.

## Preserve Core Invariants

- Separate Product, Developer, Tester, and Reviewer roles from named Agent
  Profiles.
- Treat Solo, Copilot, Trio, and Squad as logical topologies, not concurrency
  counts.
- Let personalization change presentation only, never authority, risk, gates,
  evidence, or independence.
- Keep project rules at their source of truth; register locators and never
  copy governing content into ZipZap state.
- Ship one modular Kernel package. Module boundaries are internal; do not add
  an external role-plugin loader, marketplace, installer, or dependency solver.
- Keep Product, Developer, Tester, and Reviewer authority fixed. Project
  Capability Profiles may add evidence-backed facts and source locators, never
  authority, executable hooks, or copied rule prose.
- Never call sequential self-review independent Review.
- Never claim approval, host capability, satisfied gates, completion, or
  production readiness without cited evidence.
- Require explicit authorization before using multiple Agent contexts.

Read [the operating model](references/operating-model.md) only for authority
disputes, design changes, or audits.
Read [roles](references/role-catalog.md),
[Agent Profiles](references/agent-catalog.md),
[teams](references/team-catalog.md), or
[control functions](references/control-functions.md) only when selecting,
authoring, or auditing those definitions.

## Load the Smallest Sufficient Context

Compose one runtime view from:

```text
profile capsule + role or control overlay + current stage
+ triggered policy + matching project-capability facts and rule fragments
+ work, evidence, Findings, handoff, and exit gate
```

Locate files and symbols before reading. Read the smallest relevant heading or
line range, expand only when evidence is insufficient, and treat truncation as
an incomplete read. Query compact definitions through `catalog`; for example:

```bash
node scripts/zipzap.mjs catalog \
  --kind execution-profiles \
  --id design-diagnostic \
  --section capsule
```

Read [the context router](references/context-router.md) for source loading,
budgets, and projection details.

For Work with a project locator, hydrate only confirmed registrations from
Manifest v2, match profiles by current role, stage, action, component, and
affected file, and project their bounded facts plus authoritative source
locators. A stale profile may be rebuilt only as an in-memory overlay with a
Refresh recommendation; ordinary Work never writes `.zipzap/capabilities/`.

When Work creates or maintains business-capability or development-design
documentation, read [Business and Development Documentation](references/business-documentation.md).
Preserve coherent project routes, use one active design as the execution entry
point, reference exact business headings, and require a confirmed maintenance
preview before mutation. Do not load this guidance for ordinary Work that does
not author those documents.

## Initialize, Persist, and Complete Selectively

Discover sources and candidate profiles read-only, preview changes, then write
confirmed registration to `.zipzap/project.json` and validated profiles to
`.zipzap/capabilities/<capability-id>.json`. Initialize and Refresh are the only
shared profile write paths. Keep installation separate from project
initialization. Read [project initialization](references/project-initialization.md),
[onboarding](references/onboarding.md), or
[First Run](references/first-run.md) only for those flows.

Run Rule Doctor only after an explicit user request. Initialization, source
refresh, ordinary Work, and file changes never trigger it. Diagnosis provides
advice and migration previews only; an ignore remains silent while its
evidence versions are unchanged.

Treat the repository's Maven and Gradle profiling as local proof of the
pipeline, not as generic Java authority. Load Java requirements only when the
concrete project declares and registers them.

Manifest, L5, Kernel, and runtime machine contracts are version 2 with no v1
execution path. When v1 project state or machine input is encountered, return
`migration-required` guidance and require Initialize discovery, preview, and
confirmation. Do not rewrite old state automatically. Independent Task, First
Run, onboarding, lifecycle, Host capability, and Rule Doctor records keep
their own version 1 contracts.

Keep persistent project state under `.zipzap/`, outside the installed Skill.
Use `scripts/task.mjs` only when a Task is justified. Treat Git activity as
candidate evidence, not completion. Persist Review snapshots with current
artifact versions and independence. Record token counts only from exact host
telemetry; otherwise record unavailable without estimating.

Read [Task integration](references/task-integration.md) before Task mutation,
Git tracking, persistent Review, reporting, feedback, or usage recording.

Complete with outcomes, evidence, actual test and Review coverage, Finding
dispositions, approvals, residual risk, limitations, and continuation state.
Use precise labels such as `implemented`, `tested`, `self-reviewed`,
`independently-reviewed`, or `accepted-by-user`.

## Adapt and Distribute

Use the Host Capability Matrix to report Multi-Agent contexts, guided forms,
exact token telemetry, Goal budgeting, Node acceleration, and project state
with explicit fallbacks. Missing Node may reduce acceleration but must not
weaken semantics. Read [Host capabilities](references/host-capabilities.md)
only when adapting or explaining a host.

Install no runtime packages. Let the host installer own authorized mutation
and backup, preserve project-owned `.zipzap/` state across upgrades, and read
[lifecycle control](references/lifecycle.md) only for build, verification,
installation, upgrade, rollback, or publication.
