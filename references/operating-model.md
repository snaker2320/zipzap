# Operating Model

Load this reference when assigning roles, selecting agent profiles, composing
runtime context, or explaining ZipZap's conceptual model.

## Contents

- Core Entities
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

### Context Router

Treat the Context Router as a ZipZap control-plane function, not a project role
or named agent profile. Make it select the role capsule, stage overlay,
agent profile capsule, personalization overlay, conditional policies, project
rules, and handoff context needed for the current action.

Require the Router to emit an inspectable projection manifest and to recompute
the projection when role, stage, scope, risk, findings, or handoff state
changes. Let a role executor request missing context, but do not let it silently
remove mandatory context.

## Runtime Binding

Compose each participant at runtime:

```text
team preset and agent slot
  + agent profile capsule
  + personalization overlay
  + context-router-selected role projection
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
