# Operating Model

Load this reference when assigning roles, selecting agent profiles, composing
runtime context, or explaining ZipZap's conceptual model.

## Contents

- Core Entities
- Runtime Control Plane
- Runtime Binding
- Assurance Boundary

## Core Entities

### Role

Define a role as a responsibility contract independent from any stage or named
agent profile. Maintain it in two forms:

- **Role definition**: the complete, authoritative contract used to initialize,
  validate, govern, and audit the role.
- **Role projection**: the minimal stage- and work-specific instructions given
  to a participant at runtime.

Typical roles include product, development, testing, and review. Projects may
add, remove, or specialize roles.

### Agent Profile

Define an agent profile as a named execution configuration, not a job title.
It may specify capabilities, temperament, model or tool preferences, context
boundaries, and interaction style. Names such as Owl, Wolf, and Eagle identify
profiles; they do not imply fixed responsibilities.

Assign the same profile to different roles at different times when appropriate.
Assign different profiles to the same role when independent context or
specialization is required.

Maintain a complete profile for initialization and audit, and derive a compact
profile capsule for runtime. Apply user aliases and communication preferences
as a presentation overlay. Do not let personalization change profile ID, bias
guards, role authority, gates, or project rules.

### Team Preset

Define a team preset as a reusable collaboration topology containing logical
agent slots, default profile assignments, role or coordination bindings,
independence constraints, assurance limits, and degradation rules.

Keep logical team size independent from simultaneous concurrency. Permit
Copilot, Trio, or Squad to execute sequentially while preserving distinct named
profiles, contexts, and handoffs.

### Preset Resolution

Record the requested preset, effective preset, recommended preset, assurance
requirements, capability comparison, capacity constraints, reasons, and
unresolved decisions. Do not create an executable binding from a recommendation
when a topology-changing decision is required.

### Team Binding

Instantiate a Team Preset as revisioned logical members with stable profile
IDs, unique context IDs, role and control-function assignments, actual
assurance, personalization, and scheduling.

### Control Function

Define a narrow L4 behavior such as `coordinator` or `advisor`. Let it sequence,
route, or challenge accountable work without inheriting project-role authority,
approval, authorship, risk acceptance, or independent-assurance claims.

### Work Context

Maintain a work context for every request. Include the objective, scope,
constraints, acceptance criteria, relevant sources, risks, decisions, findings,
and evidence. The context may be ephemeral or persistent.

### Stage Context

Use stage context to expose only the information and responsibilities relevant
to the current stage. Preserve enough provenance to audit prior decisions, but
avoid leaking conclusions into an independent review when doing so would bias
the reviewer.

### Project Rules

Treat project rules as external authoritative inputs. Register a rule using its
location, purpose, scope, and loading condition. Load the authoritative content
at execution time.

### Role Projection

Derive a role projection from the role definition rather than authoring a
second independent role description. Include the stable capsule, current stage
overlay, triggered policies, and applicable rule locators. Exclude unrelated
stages, dormant policies, explanatory design history, and duplicate project
rules.

### Runtime Projection

Compose one participant's current profile, role or control function, stage,
authority, outputs, evidence, sources, handoff, Findings, and assurance into a
minimal revisioned execution context.

### Projection Manifest

Record why each module and source was included, which binding and source
versions the projection used, what assurance applies, and what remains
unresolved. Keep authoritative source content outside the manifest.

## Runtime Control Plane

Run:

```text
Preset Resolver
  → Binding Planner
  → Context Router
  → Runtime Participant
```

Use the Projection Reconciler to detect runtime changes and choose `no-op`,
`patch`, `rebuild-projection`, `rebind`, `re-resolve-preset`, or `block`.

### Preset Resolver

Select the least costly topology satisfying explicit gates and project policy,
unless the user has explicitly selected a sufficient preset. Keep concurrency
separate from logical topology.

### Binding Planner

Assign profiles, unique contexts, roles, control functions, independence, human
gates, and scheduling. Compute actual assurance rather than inheriting the
preset's promise blindly.

### Control Functions

Provide narrow coordination and advisory overlays to the Context Router. Select
a Role for accountable work or a Control Function for control-plane work; do
not combine their authority implicitly in one action.

### Context Router

Treat the Context Router as a ZipZap control-plane function, not a project role
or named agent profile. Make it select the role capsule, stage overlay,
agent profile capsule, personalization overlay, conditional policies, project
rules, and handoff context needed for the current action.

Require the Router to emit an inspectable projection manifest and to recompute
the projection when role, stage, scope, risk, findings, or handoff state
changes. Let a role executor request missing context, but do not let it silently
remove mandatory context.

### Projection Reconciler

Re-run composition from the highest affected component when team selection,
capacity, membership, stage, scope, risk, gates, Findings, handoff state, or
source availability changes. Invalidate stale projections before consequential
actions.

## Runtime Binding

Compose each participant at runtime:

```text
team preset and agent slot
  + binding and context revision
  + agent profile capsule
  + personalization overlay
  + context-router-selected role projection or control-function overlay
  + work context
  + stage context
  + applicable project rules
  = execution participant
```

Do not encode a role permanently into a profile. Do not assume that changing a
role changes the underlying profile's tools or capabilities.

Recompute the projection when the role, stage, work scope, risk, handoff, or
applicable rules change. A stale projection is not a durable identity.

## Assurance Boundary

Permit a single agent to frame, implement, test, and self-review work in
sequence when risk is low. Label the result as self-reviewed.

Require a distinct agent or human for independent review. Preserve meaningful
independence through separate context, an explicit handoff, and freedom to
raise findings. Sharing the implementation agent's conclusion without need
weakens independence.
