# Project Initialization

Load this reference before initializing or changing ZipZap collaboration in a
project.

## Discovery

Inspect the project before proposing configuration. Look for:

- repository and directory-level agent instructions;
- product requirements and architecture decisions;
- coding, testing, security, and documentation standards;
- task, issue, approval, and release systems;
- ownership and review requirements;
- existing roles, agent profiles, automations, and integrations;
- preferred team topology and allowed personalization;
- commands or tools that produce verification evidence.

Prefer established project conventions over a ZipZap-specific parallel system.

## Registration

Register an authoritative source with enough information to route and load it:

- stable identifier;
- path, URI, or system locator;
- authority and ownership;
- topics or work types it governs;
- conditions under which it must be loaded;
- precedence or conflict rule when multiple sources apply.

Do not copy the source's substantive rules into ZipZap configuration. A short
description used for discovery and routing is not a duplicate source of truth.

## Collaboration Configuration

Define the smallest useful set of:

- roles and responsibility contracts;
- named agent profiles;
- enabled team presets and their independence constraints;
- allowed personalization fields and defaults;
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
2. Add indexes or routing metadata before adding new documents.
3. Add durable task records only where continuity or governance needs them.
4. Make defaults explicit and overridable.
5. Leave undecided schema or storage choices open until a real workflow
   requires them.

After initialization, report authoritative sources, active roles and profiles,
configured gates, persistence policy, and unresolved decisions.
