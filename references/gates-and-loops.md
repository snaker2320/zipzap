# Gates, loops, and problem items

The shared Gate derives requirements from effect and risk:

- file mutation requires `scope-understood`;
- destructive or external effect requires `human-authorized`;
- completion claims require `verification-passed`;
- high risk requires `independent-review-passed`.

The Agent supplies observed current-action `signals`, not the final policy. Subject risk selects
context but does not impose action effects. `risk-taxonomy.yml` may raise the declared action risk and
contributes its required evidence, named approvals, testing, and review checks. It can never lower
risk. `status: passed` is accepted only with a non-empty `evidence_ref`; within Work, exit evidence must
also bind the current stage `commit_sha`. Independent review/testing checks record the responsible
reviewer/tester identity without introducing a separate role database.

Evaluate scope and human authorization before acting. After execution, route an actual stage failure
to Feedback before evaluating completion claims. Only a successful stage with verification and any
required independent assurance may advance. This keeps one Gate engine while preventing a failed
Deploy from getting stuck behind its expected missing completion evidence.

## Collaboration mode at Work entry

Use Gate requirements as the only collaboration threshold:

- no second-context or independence requirement: Solo, selected silently;
- `peer-challenge` or `second-context`: Copilot or stronger, with Copilot recommended;
- testing or review independent from development: Trio or Squad, with Trio recommended;
- high risk or review independent from testing: Squad.

When Solo is sufficient, continue without a decision. Otherwise stop at the entry check
`collaboration-mode-selected` and ask the human once before launching multiple Agent contexts. Show
only Gate-compatible modes. Put the reason in each option label, prefix the recommendation with
`[推荐]`, and do not add a separate rationale paragraph. If only Squad is compatible, pair it with a
`暂不执行` option. A selected multi-Agent mode requires the human actor and selection evidence.

Reuse the selection throughout the same Work, Feedback, and Maintenance flow. Re-evaluate only when
scope, normalized action risk, or Gate requirements materially change. Team presets are logical role
topologies; the Host may schedule them sequentially, but it may not weaken required independence.

Work, Feedback, and Maintenance Loops share this gate. Attempt `0` is the initial model result. A non-high-risk failure may produce one correction at attempt `1`; another failure stops. High-risk failure stops immediately. `deterministic-rerun` may continue without incrementing the model attempt only when the current and previous input SHA-256 values match.

## SDLC stage flow

Work carries one current stage: `plan`, `design`, `build`, `test`, `deploy`, or `maintain`. The default
forward path follows that order. `next_stage` supports a bounded non-linear return, for example Test to
Build or Deploy to Test. A successful step returns `outcome: complete` with the next Work stage;
`workflow_complete` becomes true only when neither a next Loop nor a next stage remains.

Carry stage artifacts in `artifacts`. The current stage cannot advance until its artifact has a
`commit_sha`; Build also requires the immutable artifact `sha256`. Loop state in the user cache supports
continuation but is not the audit source; use the Git Checkpoint chain for durable reconstruction.
Deploy must receive the output of `delivery --action assess`. Missing or blocked assessment produces
problem items and routes Work to Feedback instead of advancing to Maintain.

## Feedback and Maintenance

Feedback input contains problem items from explicit Git Checkpoints. `open` means it still needs a
correction, `resolved` means the correction awaits re-verification, and `closed` requires a
`verification_ref`. `return_stage` tells Work where to resume after closure. High-risk problem items
stop for human handling; other problems retain the one-model-correction limit.

A fingerprint appearing in two distinct checkpoints produces a standards proposal; high severity may
produce one immediately. Active product or implementation problems stay in Feedback. Once they are
closed, a resulting standards proposal may enter Maintenance. Proposal state progresses through
`proposed`, `approved`, `applied`, and `closed`; `proposed` stops for human review, and `closed`
requires verification evidence. Proposals never write standards or `AGENTS.md` themselves.
Human-reviewed resolution merges or revises existing rules where possible.
