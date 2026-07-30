# Copilot Team Preset

Load this complete definition only when initializing, changing, validating, or
auditing Copilot.

## Contents

- Identity
- Logical Membership
- Selection
- Operating Protocol
- Advice and Findings
- Assurance
- Personalization
- Degradation and Escalation

## Identity

```yaml
id: copilot
display_name: Copilot
summary: One primary Agent executes while a second context accompanies, challenges, and advises.
```

## Logical Membership

```yaml
logical_members:
  - slot: pilot
    profile: wolf
    functions:
      - coordinator
    roles:
      - product
      - developer
      - tester
      - reviewer

  - slot: copilot
    profile: eagle
    functions:
      - advisor
```

Use Wolf as the default action-oriented Pilot and Eagle as the default
wide-angle Copilot. Permit an explicit profile rebinding while preserving two
distinct named contexts and the same assurance limits.

## Selection

Select Copilot for everyday, low-to-normal-risk execution when continuous
second-context challenge materially improves the result but formal independent
testing or review is not required.

Prefer Solo for trivial work where companion cost adds no value. Upgrade to
Trio when implementation must be separated from formal testing or review.
Upgrade to Squad for full role separation or high-risk work.

## Operating Protocol

Keep the Pilot responsible for execution, artifact changes, tool actions,
evidence collection, and role transitions.

Keep the Copilot advisory and read-only by default. Give it compact checkpoint
context rather than every intermediate trace:

- objective, scope, assumptions, and applicable rules;
- proposed plan or next consequential action;
- material artifact changes or diff;
- verification evidence and open Findings;
- current risks, unresolved questions, and intended completion claim.

Invite Copilot input at material checkpoints:

1. after framing and before committing to an approach;
2. before a high-impact or difficult-to-reverse action;
3. after implementation and before verification is considered sufficient;
4. before the final completion claim.

Avoid commentary on every minor action. The mode should add judgment, not
constant narration.

## Advice and Findings

Allow the Copilot to:

- challenge assumptions, scope, sequencing, and risk;
- identify omissions, contradictions, and likely regressions;
- suggest alternatives, tests, evidence, and escalation;
- raise advisory Findings with consequence and rationale;
- request that the Pilot pause a material action.

Require the Pilot to disposition material advice as adopted, rejected,
deferred, duplicate, or escalated, with brief rationale. The Copilot does not
gain decision authority from its advisory function.

If the Copilot writes or directly co-authors the artifact, record the changed
binding and treat it as a contributor for that scope.

## Assurance

Provide:

- a second named context;
- continuous peer challenge;
- checkpoint feedback;
- independent-of-execution observations when the Copilot remains read-only.

Do not provide:

- formally independent testing;
- formally independent review or approval;
- separation between Product, Developer, Tester, and Reviewer roles;
- authority or risk acceptance.

```yaml
assurance:
  second_context: true
  copilot_separate_from_pilot: true
  independent_testing: false
  independent_review: false
```

Do not relabel peer challenge as independent Review. Continuous advice makes
the Copilot part of the decision process even when it does not edit artifacts.

## Personalization

Allow aliases and canonical team tone, humor, status style, and signature
visibility. Preserve Pilot and Copilot slots, stable profile IDs, the default
read-only advisory boundary, and assurance labels.

## Degradation and Escalation

If the Copilot is unavailable, explicitly degrade to Solo and disclose the loss
of second-context challenge.

If formal independent assurance becomes required, upgrade to Trio or Squad or
add a distinct qualified human or Agent gate. Do not reuse the continuously
involved Copilot as an independent Reviewer for the same scope.
