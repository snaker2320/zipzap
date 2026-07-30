# Context Router

Load this reference when configuring, debugging, validating, or auditing
runtime context selection. The Context Router is a ZipZap control-plane
function, not a project role or named agent profile.

## Contents

- Responsibility Boundary
- Routing Inputs
- Selection Algorithm
- Projection Manifest
- Recalculation
- Failure Policy
- Execution Modes

## Responsibility Boundary

Make the Context Router decide what context a role receives. Do not let the
role executor silently remove mandatory context. Allow the executor to request
additional context or report that the projection is insufficient.

Keep routing separate from quality judgment. Selecting a Reviewer projection
does not itself perform independent review.

## Routing Inputs

Keep lightweight metadata available:

```yaml
routing_inputs:
  - team_preset
  - agent_slot
  - agent_profile
  - personalization
  - current_role
  - current_stage
  - objective
  - work_type
  - scope
  - requested_action
  - affected_components
  - risk_flags
  - applicable_gate
  - prior_handoff
  - open_findings
```

Use metadata and selectors to decide which full sources to load. Do not preload
all source contents merely to evaluate routing.

## Selection Algorithm

1. Resolve the team preset and logical agent slot.
2. Select the assigned agent profile and apply permitted personalization.
3. Select the current role from the project registry or standard role catalog.
4. Include the profile and role capsules.
5. Select the current stage overlay.
6. Match conditional policies against action, scope, components, risk, gates,
   findings, and handoff state.
7. Resolve rule selectors against the project's authoritative source registry.
8. Load only sources required for the current action.
9. Add the minimum work and handoff context needed to act.
10. Verify that omissions do not change authority, safety, required output, or
   the current exit gate.
11. Emit a projection and its manifest before role execution.

Prefer deterministic selector matching. Use agent judgment for semantic scope,
novel risks, and ambiguous applicability. Record material judgment calls.

## Projection Manifest

Produce a compact, inspectable record:

```yaml
projection_manifest:
  team: trio
  agent_slot: builder
  profile: wolf
  role: developer
  stage: produce
  included:
    - developer-capsule
    - developer-produce
    - migration-safety
    - project:database-migration-standard
  reasons:
    migration-safety: "The requested action changes a database schema."
  unresolved:
    - "Production deployment scope is not yet known."
```

Keep locators and selection reasons in the manifest. Keep the loaded rule text
in runtime context, not in the manifest or another copied source of truth.

## Recalculation

Recompute the projection when:

- the team, agent slot, profile, or permitted personalization changes;
- the role or stage changes;
- scope, acceptance criteria, or requested action changes;
- affected components or risk classification changes;
- a new finding changes required work or assurance;
- a handoff changes ownership or supplies new evidence;
- a high-impact action is about to execute;
- a required source changes or becomes unavailable.

Do not treat a projection as durable identity. Persist the manifest only when
the work requires an audit trail or cross-session reconstruction.

## Failure Policy

Fail conservatively when a routing decision may change authority, safety, or a
required gate:

- include the uncertain policy or rule when its context cost is reasonable;
- pause the affected action and request clarification when consequences are
  material;
- disclose missing or conflicting sources;
- never infer approval, independence, credentials, or risk acceptance.

Avoid conservative overloading for harmless uncertainty. Loading everything
reduces the value of routing and can hide important constraints.

## Execution Modes

In single-agent mode, require the primary agent to finish routing before
explicitly entering the selected work role.

In multi-agent mode, require the coordinating agent to build the projection and
handoff supplied to each role executor. Let the executor challenge missing
context, but keep mandatory selection with the coordinator.

When a deterministic host or script is available, let it perform selector
matching and manifest generation. Keep semantic ambiguity and authorization
decisions visible to an agent or human.
