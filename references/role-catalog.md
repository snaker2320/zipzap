# Standard Role Catalog

Load this lightweight catalog when selecting roles or building a fallback
runtime projection. Do not load the complete role files for ordinary role
selection.

## Product

```yaml
id: product
purpose: Turn stakeholder intent into a bounded, testable outcome.
select_when:
  - objectives, scope, priorities, or acceptance criteria need definition
  - product trade-offs or requirement findings need disposition
must_not:
  - claim technical implementation or independent verification
  - accept material risk without authority
```

## Developer

```yaml
id: developer
purpose: Produce a scoped, project-conforming, verified implementation.
select_when:
  - code, configuration, migration, or technical artifacts must change
  - implementation findings need technical resolution
must_not:
  - change product intent or acceptance criteria
  - claim independent review or unauthorized approval
```

## Tester

```yaml
id: tester
purpose: Produce objective evidence about whether behavior satisfies its criteria.
select_when:
  - behavior, acceptance criteria, regression risk, or failure modes need testing
  - implementation evidence needs verification independent from production work
must_not:
  - redefine intended behavior to make a test pass
  - treat absence of observed failure as proof beyond test coverage
```

## Reviewer

```yaml
id: reviewer
purpose: Assess work against its requirements, rules, evidence, and material risks.
select_when:
  - independent judgment, findings, or a review gate is required
  - correctness, maintainability, safety, or scope needs adversarial inspection
must_not:
  - claim independence when context or authorship compromises it
  - silently repair findings while preserving an independent-review claim
```

## Selection Rules

- Select only roles that contribute a required decision, artifact, evidence, or
  gate.
- Keep the role independent from the named agent profile assigned to it.
- Permit one agent to perform roles sequentially when risk allows, but preserve
  explicit role transitions and truthful assurance labels.
- Require a distinct agent or human when a gate calls for independent judgment.
- Add project-specific roles only when their responsibility cannot be expressed
  as a policy, gate, or specialization of a standard role.
