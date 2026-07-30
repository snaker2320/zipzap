# Squad Team Preset

Load this complete definition only when initializing, changing, validating, or
auditing Squad.

## Identity

```yaml
id: squad
display_name: Squad
summary: A full specialist team separating coordination, product, development, testing, and review.
```

## Logical Membership

```yaml
logical_members:
  - slot: coordinator
    profile: owl
    functions:
      - coordinator

  - slot: product
    profile: fox
    roles:
      - product

  - slot: builder
    profile: wolf
    roles:
      - developer

  - slot: verifier
    profile: lynx
    roles:
      - tester

  - slot: reviewer
    profile: eagle
    roles:
      - reviewer
```

## Selection

Select Squad for high-risk, broad, complex, regulated, or difficult-to-reverse
work; for work needing specialized product and assurance contexts; or when
testing and review must be mutually independent.

Do not select Squad merely to imitate a large team when fewer contexts satisfy
the required outcome and gates.

## Execution and Assurance

Provide:

- coordination without absorbing accountable role decisions;
- a dedicated Product context;
- a dedicated Developer context;
- testing independent from development;
- review independent from both development and testing.

Guarantee:

```yaml
independence:
  product_separate_from_coordinator: true
  tester_separate_from_developer: true
  reviewer_separate_from_developer: true
  reviewer_separate_from_tester: true
```

## Concurrency and Personalization

Treat all five members as logical contexts. Permit sequential execution under
host limits. Use parallel work only where dependencies and independence allow.

Allow aliases and team-level tone, light humor, status style, and signature
visibility. Preserve slot, profile ID, role binding, and independence.

## Degradation and Escalation

Do not merge slots when doing so breaks a required independence constraint.
Reassign to another distinct profile or human only with explicit provenance.

When Squad cannot be staffed, record unavailable slots, proposed substitutes,
the resulting assurance, and the gate that must stop if no valid substitute is
available.
