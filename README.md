# ZipZap

ZipZap is a standalone AI collaboration skill for initializing role-based
human–AI execution and running ad-hoc or tracked work to verifiable completion.

The project is in active product and workflow design. Its current structure is:

```text
.
├── SKILL.md                       # Runtime instructions and resource routing
├── agents/openai.yaml             # Skill UI metadata
├── config/                        # Authoritative L0–L4 and L6–L7 catalogs
│   ├── invariants.json            # L0 invariants and claim vocabulary
│   ├── roles.json                 # L1 complete Role contracts
│   ├── agents.json                # L2 Agent Profiles and capsules
│   ├── teams.json                 # L3 Team Presets and assurance
│   ├── control-functions.json     # L4 Coordinator and Advisor
│   ├── modules.json               # Internal role, policy, and context modules
│   ├── runtime-policy.json        # L4 gates, risks, events, lifecycle
│   ├── risk-taxonomy.json         # L5 evidence-backed risk normalization
│   ├── task-policy.json           # Local Task persistence and patch policy
│   ├── onboarding.json            # Page and conversational preference form
│   ├── compatibility.json         # L6 adapters and host requirements
│   └── lifecycle.json             # L7 packaging and release policy
├── schemas/                       # L4–L7, capability, Task, and project contracts
│   ├── decision-bundle.schema.json # Shared critical-decision form contract
│   └── decision-interaction.schema.json # Host-neutral pause/render contract
├── scripts/zipzap.mjs             # Collaboration and lifecycle runner
├── scripts/lib/                   # Kernel modules, matchers, and diagnostics
├── scripts/task.mjs               # Local Task, Git, Review, and report runner
├── tests/                         # Composition and conformance tests
└── references/
    ├── operating-model.md         # Roles, agents, contexts, and invariants
    ├── skill-interface.md          # L5 public interface semantics
    ├── task-integration.md         # Neutral Task Contract and adapter flow
    ├── runtime-composition.md      # L4 control-plane contract
    ├── preset-resolver.md          # Team selection and assurance matching
    ├── binding-planner.md          # Logical members, contexts, and scheduling
    ├── control-functions.md        # Coordinator and advisor overlays
    ├── context-router.md           # Runtime context selection and projection
    ├── business-documentation.md  # Capability docs and active-design entry point
    ├── projection-reconciler.md    # Runtime change and staleness handling
    ├── project-initialization.md  # Project discovery and registration model
    ├── onboarding.md              # Guided preference setup and reset contract
    ├── execution-policy.md        # Persistence, risk, and collaboration policy
    ├── decision-forms.md          # Single/multi-select decision presentation
    ├── role-catalog.md             # Lightweight standard-role routing index
    ├── role-contract.md            # Role authoring and projection standard
    ├── role-product.md             # Standard Product role definition
    ├── role-developer.md           # Standard Developer role definition
    ├── role-tester.md              # Standard Tester role definition
    ├── role-reviewer.md            # Standard Reviewer role definition
    ├── agent-profile.md            # Agent Profile authoring standard
    ├── agent-catalog.md            # Lightweight profile routing index
    ├── agent-<id>.md               # Owl, Fox, Wolf, Lynx, and Eagle
    ├── team-preset.md              # Team Preset authoring standard
    ├── team-catalog.md             # Solo, Copilot, Trio, and Squad selector
    └── team-<id>.md                # Full standard team definitions
```

Project-specific business rules remain in each project's own source of truth.
ZipZap registers and loads those rules when needed instead of copying them.
Project-derived capability profiles are stored separately under
`.zipzap/capabilities/*.json`; they contain bounded facts, selectors,
provenance, fingerprints, and source references, never executable hooks or
copied rule prose.
Persistent Tasks are maintained in the project as
`.zipzap/tasks/<task-id>.json`. Immutable per-event files, Review evidence,
Feedback, and derived reports remain under `.zipzap/`. Commit shared project
state to Git; do not commit each developer's installed Skill.

Except for Codex-required `SKILL.md` frontmatter and `agents/openai.yaml`, the
ZipZap runtime format is JSON. Markdown contains semantic guidance only.

## CLI discovery

Both zero-dependency entry points provide global help, command help, and
copyable JSON input examples:

```bash
node scripts/zipzap.mjs --help
node scripts/zipzap.mjs invoke --help
node scripts/zipzap.mjs invoke --example

node scripts/task.mjs --help
node scripts/task.mjs validate --input task.json
node scripts/task.mjs create --example
```

Run an example directly with `--input`, such as
`node scripts/zipzap.mjs evaluate --input examples/zipzap/evaluate.json`.
CLI failures use structured JSON with a stable error code, message, corrective
hint, and the most relevant help command.

## Modular Kernel and project capabilities

ZipZap ships as one package with an internal Module Catalog, Loop Controller,
ExecutionSpec builder, Capability Matcher, and Rule Doctor. These are module
boundaries for precise context assembly, not installable role plugins. There
is no plugin marketplace, external module loader, dependency resolver, or
separate lifecycle for role modules.

Standard Product, Developer, Tester, and Reviewer authority remains fixed.
Project-specific requirements—such as a declared Java version, build tool,
framework configuration, verification command, or directory convention—stay
owned by the project. Initialize can derive bounded evidence-backed facts into
project Capability Profiles; Work automatically selects only profiles whose
role, stage, action, component, and file selectors match the current work.

Java/Maven and Java/Gradle support in this repository is local fixture evidence
for the profiling pipeline. ZipZap does not ship generic Java engineering
rules: concrete Java behavior must come from each project's registered sources.

## Project initialization

Discover without writing, then configure or refresh only when requested:

```bash
node scripts/zipzap.mjs initialize --input l5-initialize-request.json
node scripts/zipzap.mjs source-resolve --input source-resolution-input.json
```

The Manifest v2 registry is `.zipzap/project.json`. It stores source locators,
topics, selectors, document kinds, relations, hashes, capability-profile
registrations, routing, and local Task policy—not source document, copied
rules, or external PRD content. Capability profiles are Git-shareable files at
`.zipzap/capabilities/<capability-id>.json`.
`AGENTS.md` is treated as host-managed instructions rather than a content
index. Section indexes remain optional, derived accelerators.

Initialize and Refresh are the only flows that may write shared profiles. They
first return an exact preview fingerprint and write only after confirmation.
Ordinary Work reads the confirmed Manifest, matches profiles automatically,
and projects only selected facts and exact source locators. If evidence has
changed, Work may rebuild a bounded in-memory overlay and recommend Refresh;
it never repairs or rewrites the shared profile itself.

Initialization preserves coherent existing locations and only registers their
routes. New projects use lazy defaults such as
`docs/business/<capability>.md` and
`docs/design/active/<demand-id>-<slug>.md`; directories appear only during an
authorized document write.

## Rule health and governed documents

Rule health is never automatic. Run it explicitly and choose its visible cost
boundary:

```bash
node scripts/zipzap.mjs rule-health --input rule-health-input.json
node scripts/zipzap.mjs document-route --input document-route-input.json
```

`quick` performs deterministic checks. `standard` adds a bounded semantic
candidate request, while `deep` requires an explicit source-file budget.
Diagnosis is read-only and only proposes migrations. Explicit ignore and
restore operations maintain version-bound records under
`.zipzap/rule-health/ignores/`; unchanged evidence stays silent.
Capability checks include missing or stale evidence, selectors that are
invalid, overbroad, or never match, duplicate or conflicting profiles, missing
modules, context-budget overflow, and possible copied-rule prose. None of these
checks run during Initialize, Refresh, or ordinary Work.

Authorized Work can use the exported `planDocumentMaintenance` and
`applyDocumentMaintenance` adapters for governed create, edit, move, and
delete operations. Previewing is read-only. Apply requires the exact confirmed
preview fingerprint, writes the manifest last, and reports `blocked` with
reconciliation steps if document and registry state diverge. These are Work
internals, not a fourth public lifecycle action.

Business knowledge is grouped in vertical capability documents so actors,
states, flows, exceptions, and rules needed together stay together. One active
development design is the entry point for each bounded change and references
registered business source IDs plus exact headings, normally expanding no more
than three business sources. See
[`references/business-documentation.md`](references/business-documentation.md)
for the landing and maintenance workflow.

Guided preference setup is page-neutral:

```bash
node scripts/zipzap.mjs onboard --input onboarding-request.json
```

Use `presentation: form` for a host-rendered settings page or
`presentation: stepwise` for conversational confirmation. Both paths preview
changes before applying them and can be rerun or reset later.

## Local Task tracking

Use the independent zero-dependency entry point:

```bash
node scripts/task.mjs validate --input task.json
node scripts/task.mjs create --input task.json
node scripts/task.mjs claim --id task-id --subject agent-id --expected-revision 1
node scripts/task.mjs track-git --input git-tracking.json
node scripts/task.mjs sync-git --id task-id
node scripts/task.mjs assess --id task-id
node scripts/task.mjs report --period weekly --scope team
node scripts/task.mjs feedback --input feedback.json
```

Task Standard v1 creates only `ready` or explicitly `blocked` Tasks; candidate
work does not use a Task `backlog` status. Acceptance criteria carry stable IDs
so evidence can reference them without positional inference. Ready creation
needs an executable objective, bounded outcome scope, and acceptance results;
implementation impact, estimates, and verification details can be added during
the first Work Analysis. An optional `assignee_id` supports direct assignment
or a lightweight Git-backed claim without pretending Git provides a real-time
lock.

Feedback is stored at `.zipzap/feedback/<feedback-id>.json` with the current
ZipZap version and an optional minimal Task snapshot, making real-use problems
easy to reproduce without copying project source.

Confirm Commit association with an explicit SHA or
`ZipZap-Task: task-id` trailer. The script returns compact Git statistics and
locators; it does not load full Diff content by default.

## Install and release

ZipZap does not modify its own installation. Use the host's Skill installer
with this repository or a verified release directory.

With the optional Node runner, generate the deterministic release inventory:

```bash
node scripts/zipzap.mjs release-plan
```

Assess the target host through L6, then check installation eligibility:

```bash
node scripts/zipzap.mjs install-check --input host-conformance.json
```

Install only when the result is `ready`, using the files and hashes from the
release manifest. The host installer owns backup, copy, upgrade, and rollback.
Installation must not install Node or Python and must not create or modify a
project's `.zipzap/project.json`.

Release `0.1.1-beta.5` deliberately changes Manifest, L5, Kernel, and runtime
machine boundaries to version 2. Version 1 payloads have no dual-read path.
Preserve project-owned state during upgrade, then run Initialize discovery,
review the new preview, and confirm reinitialization before Work. Independent
records such as Task Standard, First Run, onboarding, lifecycle requests,
Host capability reports, and Rule Doctor records retain their own version 1
contracts.

Before publishing, run L7 `verify-release` and `publish` with evidence for all
registered release gates. Repository and marketplace locators remain
distribution-channel configuration; do not embed an unpublished URL in the
Skill.
