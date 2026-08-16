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
│   ├── runtime-policy.json        # L4 gates, risks, events, lifecycle
│   ├── risk-taxonomy.json         # L5 evidence-backed risk normalization
│   ├── task-policy.json           # Local Task persistence and patch policy
│   ├── onboarding.json            # Page and conversational preference form
│   ├── compatibility.json         # L6 adapters and host requirements
│   └── lifecycle.json             # L7 packaging and release policy
├── schemas/                       # L4–L7, source, Task, and project contracts
│   ├── decision-bundle.schema.json # Shared critical-decision form contract
│   └── decision-interaction.schema.json # Host-neutral pause/render contract
├── scripts/zipzap.mjs             # Collaboration and lifecycle runner
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

## Project initialization

Discover without writing, then configure or refresh only when requested:

```bash
node scripts/zipzap.mjs initialize --input l5-initialize-request.json
node scripts/zipzap.mjs source-resolve --input source-resolution-input.json
```

The project registry is `.zipzap/project.json`. It stores source locators,
topics, selectors, hashes, and local Task policy—not source document content.
`AGENTS.md` is treated as host-managed instructions rather than a content
index. Section indexes remain optional, derived accelerators.

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
node scripts/task.mjs track-git --input git-tracking.json
node scripts/task.mjs sync-git --id task-id
node scripts/task.mjs assess --id task-id
node scripts/task.mjs report --period weekly --scope team
node scripts/task.mjs feedback --input feedback.json
```

Task Standard v1 creates only `ready` or explicitly `blocked` Tasks; candidate
work does not use a Task `backlog` status. Acceptance criteria carry stable IDs
so evidence can reference them without positional inference.

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

Before publishing, run L7 `verify-release` and `publish` with evidence for all
registered release gates. Repository and marketplace locators remain
distribution-channel configuration; do not embed an unpublished URL in the
Skill.
