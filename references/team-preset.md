# Team Preset Contract

Load this reference when creating, changing, validating, or auditing team
presets. Do not load it for routine execution under a selected preset.

## Contents

- Purpose and Boundary
- Authoritative Fields
- Selection and Assurance
- Logical Membership and Concurrency
- Personalization
- Degradation Rules
- Binding Manifest
- Validation Rules

## Purpose and Boundary

Define a Team Preset as a reusable collaboration topology. Let it choose logical
agent slots, default profiles, default role or control-plane bindings,
independence constraints, assurance limits, and degradation behavior.

Do not treat team size as proof of quality or as a requirement that every
logical member run simultaneously.

## Authoritative Fields

Define:

| Field | Purpose |
| --- | --- |
| `id` | Stable preset ID |
| `display_name` | Human-facing name |
| `summary` | One-line collaboration promise |
| `logical_members` | Named slots and default profiles |
| `default_bindings` | Roles or control functions assigned by default |
| `select_when` | Suitable scope and risk |
| `assurance` | What separation the preset can and cannot provide |
| `independence` | Required distinct slots or contexts |
| `concurrency` | Sequential and parallel execution behavior |
| `degradation` | Allowed fallback and disclosure |
| `personalization` | Safe user-facing overrides |

Keep project-specific role changes and sources in project configuration.

## Selection and Assurance

Prefer:

- Solo for bounded low-risk work with no independent-assurance requirement;
- Copilot for everyday work benefiting from continuous peer challenge without
  a formal independent gate;
- Trio for normal collaborative delivery;
- Squad for high-risk, complex, or full-separation work.

Honor an explicit user selection unless it cannot satisfy a required gate.
Explain the mismatch and offer a stronger preset, a human gate, or a truthful
assurance downgrade. Do not silently claim missing independence.

## Logical Membership and Concurrency

Treat each member as a stable profile and context boundary. Permit members to
run sequentially when the host cannot run them concurrently.

Use concurrency to improve latency only when work can proceed independently.
Preserve handoffs, provenance, and separation even under sequential execution.

## Personalization

Allow team-level tone, light humor, status style, signature visibility, and
per-profile aliases. Apply these after preset and profile selection.

Do not allow personalization to change:

- stable preset or profile IDs;
- logical membership or role binding;
- independence constraints;
- authority, gates, rules, evidence, or escalation;
- assurance labels.

## Degradation Rules

When a logical member is unavailable:

1. Determine whether another distinct profile or a human can satisfy the gate.
2. Preserve independent context when independence is required.
3. Rebind only within project authorization.
4. Record the changed topology and assurance.
5. Stop the affected gate when no valid substitute exists.

Never degrade Squad, Trio, or Copilot to a weaker topology silently.

## Binding Manifest

Emit an inspectable binding:

```yaml
team_binding:
  preset: trio
  personalization:
    team_tone: balanced
    humor: light
    status_style: concise
  members:
    - slot: coordinator
      profile: owl
      functions: [coordinator]
      roles: [product]
    - slot: builder
      profile: wolf
      roles: [developer]
    - slot: assurance
      profile: eagle
      roles: [tester, reviewer]
  assurance:
    reviewer_separate_from_developer: true
    reviewer_separate_from_tester: false
```

## Validation Rules

Reject or revise a preset when:

- a slot has no stable profile;
- bindings imply authority not granted by a role;
- an independence claim maps conflicting roles to the same slot;
- it assumes concurrency that the logical workflow does not require;
- unavailable members cause an undisclosed assurance downgrade;
- personalization changes governance;
- its selection guidance depends only on headcount rather than work assurance.
