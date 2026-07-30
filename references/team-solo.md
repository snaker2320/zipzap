# Solo Team Preset

Load this complete definition only when initializing, changing, validating, or
auditing Solo.

## Identity

```yaml
id: solo
display_name: Solo
summary: One adaptive profile executes roles sequentially with explicit boundaries.
```

## Logical Membership

```yaml
logical_members:
  - slot: primary
    profile: owl
    functions:
      - coordinator
    roles:
      - product
      - developer
      - tester
      - reviewer
```

Use Owl as the balanced default profile. Allow an authorized profile override
while keeping one stable named context for the work.

## Selection

Select Solo for bounded, reversible, low-risk work that has objective checks
and no required independent gate.

Avoid Solo when work requires independent review, separation of duties,
adversarial testing, specialized authority, or material risk acceptance.

## Execution and Assurance

Require explicit sequential role transitions. Recompute the runtime projection
at every transition and keep role-specific claims accurate.

Provide:

- product framing;
- implementation;
- self-testing;
- self-review.

Do not provide:

- independent testing;
- independent review;
- multi-context challenge;
- authority not held by the primary agent.

## Personalization

Allow aliasing the primary profile and applying team tone, light humor, status
style, and signature visibility. Do not let a lively persona blur role
transitions or assurance labels.

## Degradation and Escalation

Solo has no lower preset. When independent assurance becomes required, upgrade
to Trio or Squad, add a distinct human or agent gate, or stop with the missing
assurance disclosed.
