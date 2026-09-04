---
name: zipzap
description: Run low-friction, role-based human-AI collaboration with project-rule routing, risk-proportionate Solo, Copilot, Trio, or Squad execution, compact context, evidence-backed completion, and Git-shareable local Tasks. Use when Codex needs to initialize collaboration, diagnose an existing design, implement or verify work, conduct self or independent Review, manage Findings and handoffs, assess completion, report exact resource use, or package, install, upgrade, roll back, and publish ZipZap.
---

# ZipZap

Run work with explicit authority, minimal context, proportionate assurance, and
truthful evidence. Treat `config/*.json` and `schemas/*.json` as machine authority.
Load only the reference needed for the current decision.

## Keep Three Visible Actions

Expose only:

1. **Initialize**: register project rules and confirm preferences.
2. **Work**: start or continue the requested outcome.
3. **Complete**: verify evidence and make an accurate claim.

Keep internal layers hidden unless the user requests diagnostics. Read [the unified
machine interface](references/skill-interface.md) only when implementing that boundary.

## Use ZipZap as a Black Box

- For ordinary Work, use the Host's normal file, shell, browser, and connector
  tools directly. A ZipZap CLI call is not required by default.
- Do not open `scripts/zipzap.mjs`, `scripts/task.mjs`, bundled entrypoints, or
  `scripts/lib/` merely to learn how to use ZipZap. Inspect runtime source only
  when the user asks to debug or change ZipZap itself.
- When an intent route is unclear, query the compact `intent-routes` catalog.
  When a command shape is unclear, use `--help`, then `--example`, then a
  filtered `describe`; do not infer it from implementation code.
- Run relative CLI examples from the Skill root containing this file; do not
  search the project or runtime source to locate their entrypoints.
- Invoke a CLI only for its declared deterministic or persistent capability,
  such as initialization, source resolution, risk normalization, Task state,
  lifecycle control, or contract diagnostics.

## Stay Unobtrusive

- Start ordinary bounded work ephemerally with automatic team selection.
- Use Solo Developer Produce for small reversible implementation work.
- Do not create a Task, ask for preferences, or request a status decision when defaults suffice.
- Keep a ready action silent and report useful progress without asking.
- Interrupt only for material ambiguity, authority, approval, unsafe or irreversible
  action, missing governing sources, or an unmet gate.
- Ask one concise question for one accountable decision.
- At a critical checkpoint, emit structured Decision Bundles. Group related choices
  for one authority; split different authorities.
- Persist only for continuity, coordination, approval, tracking, durable Findings,
  auditability, or project policy.

Read [the execution policy](references/execution-policy.md) for persistence,
assurance, or gates, and [Decision Forms](references/decision-forms.md) for choices.

## Stop for Accountable Decisions

After every First Run, onboarding, risk-normalization, L4, or L5 call, inspect
`decision_interaction` before doing anything else.

1. If `must_pause` is `false`, continue normally.
2. If `must_pause` is `true`, render the referenced `decision_bundles`, stop
   execution, and wait for the required authority's answer.
3. Resume only after mapping the answer to the stable bundle, question,
   option, authority, and state-revision IDs.

Use a native choice form only when the host provides it; Plan mode is not required.
Otherwise ask one accountable question at a time and validate option IDs in text,
including multi-select. Never infer an answer, write, or launch multiple Agent
contexts while `must_pause` is `true`.

When **Initialize** is requested and `.zipzap/project.json` is absent, start First
Run. Present its choices and final preview before the single write. Treat
`multi-agent-authorization-required` as a hard gate; team selection is not authorization.

## Route Work by Outcome

Classify Work as `diagnose`, `plan`, `implement`, `verify`, `accept`, or `operate`.
When unclear, query the six compact routes without loading runtime source:

```bash
node scripts/zipzap.mjs catalog --kind intent-routes --compact
```

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

Route implementation to Developer Produce, verification to Tester Verify, diagnosis
to Reviewer Review, and acceptance to Product Accept. Default `accept` to formal
acceptance; advisory intent never suppresses actual action risk.

For `diagnose + design-only + advisory|self-review`, use `design-diagnostic`: Solo
Reviewer, read-only, ephemeral, no tests or Task, bounded sources, advisory output.
For ordinary diagnosis query its capsule only; do not load its reference. Load
[Design Diagnostic Review](references/design-diagnostic.md) only when the user
explicitly requests the detailed contract or an audit, or the capsule lacks a required field.

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

Read [the operating model](references/operating-model.md) only for authority disputes,
design changes, or audits. Read [roles](references/role-catalog.md), [Agent Profiles](references/agent-catalog.md),
[teams](references/team-catalog.md), or [control functions](references/control-functions.md)
only when selecting, authoring, or auditing those definitions.

## Load the Smallest Sufficient Context

Compose one runtime view from:

```text
profile capsule + role or control overlay + current stage
+ triggered policy + matching project-capability facts and rule fragments
+ work, evidence, Findings, handoff, and exit gate
```

Locate before reading. Expand the smallest relevant range only when evidence is
insufficient, and treat truncation as incomplete. Query compact definitions through `catalog`:

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

When Work authors business or development-design documentation, read [Business and
Development Documentation](references/business-documentation.md). Preserve coherent
routes, one active design entry point, exact business headings, and a confirmed
maintenance preview. Do not load it for other Work.

## Initialize, Persist, and Complete Selectively

Discover sources and profiles read-only, preview, then write confirmed registration
to `.zipzap/project.json` and validated profiles to
`.zipzap/capabilities/<capability-id>.json`. Only Initialize and Refresh write shared
profiles. Keep installation separate. Read
[project initialization](references/project-initialization.md), [onboarding](references/onboarding.md),
or [First Run](references/first-run.md) only for those flows.

Run Rule Doctor only after an explicit user request. Initialization, source
refresh, ordinary Work, and file changes never trigger it. Diagnosis provides
advice and migration previews only; an ignore remains silent while its
evidence versions are unchanged.

Treat the repository's Maven and Gradle profiling as local proof of the
pipeline, not as generic Java authority. Load Java requirements only when the
concrete project declares and registers them.

Manifest, L5, Kernel, and runtime contracts are v2 only. For v1 state or input,
return `migration-required` and require Initialize discovery, preview, and
confirmation; never rewrite automatically. Independent Task, First Run, onboarding,
lifecycle, Host capability, and Rule Doctor records retain v1.

Keep persistent state under `.zipzap/`, outside the installed Skill. Use
`scripts/task.mjs` only for a justified Task. Git is candidate evidence, not
completion. Persist Review snapshots with current artifact versions and independence.
Record token counts only from exact host telemetry; otherwise record unavailable.

Read [Task integration](references/task-integration.md) before Task mutation, Git
tracking, persistent Review, reporting, feedback, or usage. Read [CLI contracts and
progress](references/cli-contracts.md) only for command discovery or Host integration.

Complete with outcomes, evidence, actual test and Review coverage, Finding
dispositions, approvals, residual risk, limitations, and continuation state.
Use precise labels such as `implemented`, `tested`, `self-reviewed`,
`independently-reviewed`, or `accepted-by-user`.

## Adapt and Distribute

Use the Host Capability Matrix for Multi-Agent contexts, guided forms, exact token
telemetry, Goal budgeting, Node acceleration, and project state with explicit
fallbacks. Missing Node never weakens semantics. Read [Host
capabilities](references/host-capabilities.md) only when adapting a host.

Run installed commands only from bundled `dist/skill`; never run `npm install` there.
Source dependencies are allowed only when locked, audited, and bundled at build time.
Let the installer own authorized mutation and backup, preserve project `.zipzap/`
state, and read [lifecycle control](references/lifecycle.md) only for distribution work.
