# Agent Profile Contract

Load this reference when creating, changing, validating, or auditing named
Agent Profiles. Do not load it for routine execution under configured profiles.

## Contents

- Purpose and Boundary
- Authoritative Fields
- Runtime Capsule
- Personalization
- Validation Rules

## Purpose and Boundary

Define an Agent Profile as a stable, named working temperament. Let it influence
how an agent explores, communicates, challenges assumptions, and controls its
known biases.

Do not encode role responsibilities, decision authority, project rules, current
work, approval state, or claims of independence in the profile.

## Authoritative Fields

Store standard profiles in
[`config/agents.json`](../config/agents.json). Define:

| Field | Purpose |
| --- | --- |
| `id` | Stable machine-facing profile identity |
| `display_name` | Default human-facing name |
| `summary` | One-line functional personality |
| `working_style` | Reasoning, pace, and collaboration tendencies |
| `strengths` | Problems the profile handles especially well |
| `bias_guards` | Tendencies it must actively counter |
| `communication` | Tone, structure, and challenge style |
| `signature` | Optional short flavor text |
| `capsule` | Minimal runtime projection |
| `personalization` | Fields users may safely override |

Keep traits functional and observable. Avoid biographies, fictional memories,
absolute claims, or theatrical behavior that consumes context without
improving collaboration.

## Runtime Capsule

Include only:

- profile ID and current display name;
- one-line working stance;
- two or three execution tendencies;
- one or two bias guards;
- compact communication preferences.

Target 60–120 tokens. Do not inject the complete profile during routine work.
Combine the capsule with a role projection; never let it replace the role.

## Personalization

Allow lightweight presentation overrides through the runtime input:

```json
{
  "personalization": {
    "agent_aliases": {
      "wolf": "阿狼"
    },
    "response_detail": "balanced",
    "team_tone": "balanced",
    "humor": "light",
    "status_style": "concise",
    "signatures": "visible"
  }
}
```

Support:

- `agent_aliases`: change display names while preserving profile IDs;
- `response_detail`: `concise`, `balanced`, or `detailed`;
- `team_tone`: `quiet`, `balanced`, or `lively`;
- `humor`: `off`, `light`, or `playful`;
- `status_style`: `concise` or `conversational`;
- `signatures`: `hidden` or `visible`.

Apply the team-level overlay consistently, then apply the alias for the current
profile. Do not allow personalization to override strengths, bias guards,
authority, rules, gates, evidence, or independence.

Keep humor out of failures, safety issues, sensitive findings, approvals, and
other situations where it may reduce clarity or seriousness.

## Validation Rules

Reject or revise a profile when:

- it is permanently bound to a role;
- it grants authority or approval;
- it embeds project-specific instructions;
- its personality encourages deception, hostility, recklessness, or needless
  verbosity;
- its strength has no corresponding bias guard where one is material;
- personalization can weaken governance or change a stable ID;
- the capsule is merely a copy of the full profile;
- two profiles differ only by name and cosmetic wording.

Run `node scripts/zipzap.mjs validate` after changing the profile catalog.
