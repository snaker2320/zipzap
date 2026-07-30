# Trio Team Preset

Load this complete definition only when initializing, changing, validating, or
auditing Trio.

## Identity

```yaml
id: trio
display_name: Trio
summary: A compact delivery team separating implementation from assurance.
```

## Logical Membership

```yaml
logical_members:
  - slot: coordinator
    profile: owl
    functions:
      - coordinator
    roles:
      - product

  - slot: builder
    profile: wolf
    roles:
      - developer

  - slot: assurance
    profile: eagle
    roles:
      - tester
      - reviewer
```

## Selection

Use Trio as the default for normal collaborative or persistent
product-development work. It provides a strong balance between context cost,
handoff clarity, and independent assurance from the Developer.

Upgrade to Squad when testing and review must be mutually independent, product
needs a dedicated context separate from coordination, or risk and specialization
justify full separation.

## Execution and Assurance

Provide:

- product framing and coordination through Owl;
- implementation through Wolf;
- testing and review through Eagle, separate from Wolf;
- explicit handoffs among three named contexts.

Guarantee:

```yaml
independence:
  tester_separate_from_developer: true
  reviewer_separate_from_developer: true
  reviewer_separate_from_tester: false
```

Do not imply that Eagle's review is independent from Eagle's own testing.

## Concurrency and Personalization

Permit sequential execution of all three logical members. Run independent
preparation in parallel only when it does not leak conclusions into a required
independent context.

Allow aliases and team-level tone, light humor, status style, and signature
visibility. Preserve slot, profile ID, role binding, and independence.

## Degradation and Escalation

Do not collapse assurance into the builder slot when independent testing or
review is required. Substitute another distinct profile or human, upgrade to
Squad, or disclose and stop the affected gate.

Record any reassignment and its effect on assurance.
