# Project Initialization

Load this reference before initializing or changing ZipZap collaboration in a
project.

## Discovery

Inspect the project before proposing configuration. Look for:

- repository and directory-level agent instructions;
- product requirements and architecture decisions;
- coding, testing, security, and documentation standards;
- local Task, approval, and release conventions;
- ownership and review requirements;
- existing roles, agent profiles, automations, and integrations;
- preferred team topology and allowed personalization;
- guided-onboarding presentation and preference scope;
- commands or tools that produce verification evidence.

Prefer established project conventions over a ZipZap-specific parallel system.
For a new project, use the First Run adapter so discovery and preference
selection reach one combined preview before configuration. Do not treat a
plain initialization confirmation as consent to unseen preference defaults.
Create and commit `.zipzap/project.json` once per project. A member joining an
initialized project must reuse that manifest and initialize only personal
preferences; do not generate a competing manifest.

## Registration

Register an authoritative source with enough information to route and load it:

- stable identifier;
- path, URI, or system locator;
- authority and ownership;
- topics or work types it governs;
- conditions under which it must be loaded;
- precedence or conflict rule when multiple sources apply.

For automatically discovered files, derive the identifier from an ASCII slug
plus the first 12 hexadecimal characters of the SHA-256 hash of the normalized
project-relative locator. Preserve Unicode in the locator itself. This keeps
identifiers deterministic and valid while preventing different Unicode names
with the same ASCII portion from colliding. Keep `repository-instructions` as
the special identifier for the root `AGENTS.md`. Never rewrite an explicitly
configured source identifier.

Treat ordinary Markdown headings and links as the default document structure.
Do not require ZipZap-specific anchors or copy document content into the
registry. Treat `AGENTS.md` as host-managed instructions; it is not a document
index. Let a host observation state whether it was already loaded.

Do not copy the source's substantive rules into ZipZap configuration. A short
description used for discovery and routing is not a duplicate source of truth.

For durable initialization, store the registry at `.zipzap/project.json` and
validate it against
[`schemas/project-manifest.schema.json`](../schemas/project-manifest.schema.json).
Keep standard roles, profiles, teams, functions, policies, and public
interfaces in the ZipZap Skill. Keep project source locators, enabled
collaboration choices, extension locators, and persistence integration in the
project manifest.

Keep personal response detail, humor, aliases, signatures, and preferred team
in `.zipzap/state/preferences.json`. Reuse the existing `/state/` ignore rule
so member onboarding never changes a tracked ignore file. Treat preferences
retained in older project manifests as shared defaults for
backward compatibility, with personal overrides taking precedence before
governance is applied.

Resolve required topics through
[`schemas/source-resolution-input.schema.json`](../schemas/source-resolution-input.schema.json)
and return the selected locators, coverage, availability, preloaded state, and
limitations through
[`schemas/source-resolution-output.schema.json`](../schemas/source-resolution-output.schema.json).
Use `on_missing` to allow a disclosed limitation, require a decision, or block.
Do not infer a content conflict from two matching documents; report a conflict
only when source evidence establishes one.

Use session-only registration when durable project configuration adds no
value. Never write project data into the installed Skill.

## Collaboration Configuration

Define the smallest useful set of:

- roles and responsibility contracts;
- named agent profiles;
- enabled team presets and their independence constraints;
- allowed personalization fields and defaults;
- preview, confirmation, reset, and configuration revision behavior;
- preset-resolution policy and required assurance mappings;
- authorized binding overrides and human substitution rules;
- enabled control functions and their authorship boundaries;
- host capability and concurrency discovery;
- source-version or staleness signals available to the runtime control plane;
- allowed runtime bindings;
- output and handoff standards;
- acceptance and approval gates;
- persistence triggers;
- risk and escalation policies.

Keep these dimensions independently editable. Avoid a single monolithic
“agent” record that mixes identity, role, project rules, and current task state.

Initialize stable profiles before applying user aliases or communication
preferences. Preserve the underlying profile ID. Treat team members as logical
contexts that may run sequentially when host concurrency is limited.

Configure L4 through selectors and registries rather than copied projections.
Treat preset resolutions, bindings, projections, and reconciliation results as
derived runtime state. Persist them only when continuity, approval, or audit
requires reconstruction.

For each role, maintain:

- one authoritative Role Contract;
- one compact capsule containing purpose, non-negotiable obligations, authority,
  and prohibitions;
- stage overlays selected by the current stage;
- conditional policy modules selected by scope or risk;
- rule selectors that resolve to project-owned sources.

Treat runtime projections as derived context, not a second source of truth.
Regenerate them when their inputs change. Read
[role-contract.md](role-contract.md) when designing or validating this model.

## Change Strategy

Initialize incrementally:

1. Reuse compatible project systems.
2. Add source routing metadata before adding new documents.
3. Add durable task records only where continuity or governance needs them.
4. Make defaults explicit and overridable.
5. Leave undecided schema or storage choices open until a real workflow
   requires them.

Keep persistent Tasks as one JSON file per Task under `.zipzap/tasks/`. Keep an
optional `.zipzap/index.json` derived and rebuildable; do not require it for
small projects or native host search.

Keep Git-shareable Reviews, Feedback, and immutable per-event JSON under
`.zipzap/`. Generate `.zipzap/.gitignore` for reports, caches, indexes, locks,
temporary files, and machine-local state. Never place project collaboration
records in the installed Skill directory.

After initialization, report authoritative sources, active roles and profiles,
configured gates, persistence policy, and unresolved decisions.
