# Gates, loops, roles, and acceptance

## Gate

The shared Gate derives requirements from effect and risk:

- file mutation requires `scope-understood`;
- destructive or external effect requires `human-authorized`;
- completion claims require `verification-passed`;
- high risk requires `independent-review-passed`.

Signals describe the current action. The risk taxonomy may raise but never lower risk and may add evidence, approvals, testing, or review requirements. Passing evidence needs a non-empty `evidence_ref`; staged exit evidence also binds the current stage commit. Independent testing and review record the responsible role and actor.

Entry Gate failures block without consuming the correction allowance or activating execution roles. Internal Agent iteration is not submitted governance output and does not increment `attempt`, but it cannot bypass an entry failure, an open high-risk problem item, or an unreviewed standards proposal. A resolved high-risk item may proceed to verification. `event: evaluate` observes a failed exit Gate without consuming a correction; only `event: submitted-result` may spend the one automatic correction. A second submitted failure stops. High-risk submitted failure stops immediately. Identical-input deterministic reruns do not consume the correction.

## Direct and staged Work

Choose based on real handoffs, not business classification:

- direct Work: `result_ref`, no stage;
- staged Work: `stage`, `completion_stage`, and exactly one Git artifact for each represented stage;
- no Loop: a pure request with no controlled delivery.

Stages are `plan`, `design`, `implement`, `verify`, `deploy`, and `maintain`. `next_stage` is always explicit. A successful non-terminal stage without `next_stage` stops at `await-explicit-next-stage`; it never assumes the whole lifecycle. Reaching `completion_stage` completes Work.

Deploy requires a passed delivery assessment. Delivery command slots retain names such as `build.execute`; they are not workflow stages.

## Acceptance contract

Use stable IDs. Address positive, negative, boundary, and regression scenarios. Each records applicability, condition, action, and expected result. A non-applicable item includes a rationale. Record applicable constraints or invariants in the same contract. Completion evidence maps to each applicable acceptance ID; missing or failed evidence creates a problem item.

This contract guides test design, including Playwright work. A clear request can begin Design with `required_roles: [tester]`; Product is unnecessary unless intent, scope, or acceptance needs product judgment.

## Role scheduling

Roles are responsibilities, not Agents. There is no collaboration-mode selection. `required_roles` describes the current or next action; Gate-required Tester or Reviewer roles are additive. The configured stage defaults are deliberately small, and Product is never activated merely because the current stage is Plan.

The Loop projects `activate_or_reuse` entries keyed by `loop_id + role`. Reuse a Tester from Design later in Verify or Feedback. It may stay idle between those actions. Independence depends on behavior, not identity: a Tester that edits the artifact under test cannot keep claiming independent verification without a new valid assurance pass. `active_roles` lets a completion result release retained assignments.

## Feedback and Maintenance

Problem states are `open`, `resolved`, and `closed`; closure requires `verification_ref`. An open issue enters correction without consuming an attempt. `resolved` awaits verification. `event: feedback-verification-failed` reopens resolved items and is the only Feedback event that consumes the one correction allowance.

`return_to` is either `direct` or a named stage. Staged Feedback also carries the original `completion_stage`, preserving the Work boundary while it resumes the explicit stage. Closure resumes the same direct Work or that stage. Repeated fingerprints across independent checkpoints may produce a standards proposal. Proposals require human review before application and never edit standards by themselves.
