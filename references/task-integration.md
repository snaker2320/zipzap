# Local Task Integration

Load this reference when persisting project-local work. The authoritative
contracts are:

- `schemas/task.schema.json`;
- `schemas/task-event.schema.json`;
- `schemas/feedback.schema.json`;
- `schemas/review-result.schema.json`;
- `schemas/task-report.schema.json`;
- `schemas/capability-report.schema.json`;
- `schemas/task-adapter-input.schema.json`;
- `schemas/task-adapter-output.schema.json`;
- `config/task-policy.json`.

## Contents

- Boundary
- Task Standard and Ready
- Local Entry Point
- Git Evidence
- Review and Completion
- Reports and Capability
- Feedback
- Derived State

## Boundary

Persist a Task only when continuity, coordination, approval, tracking,
governance, durable findings, or project policy requires it. Keep ordinary
bounded work ephemeral.

Store each persistent Task at `.zipzap/tasks/<task-id>.json`. Register the
local store in `.zipzap/project.json` with adapter `local-json`. Never store
project rule content in the Task directory.

Write each immutable event to
`.zipzap/events/<task-id>/<event-id>.json`. Read legacy
`.zipzap/events/YYYY-MM.jsonl` files without modifying them. Store structured
Review results in `.zipzap/reviews/` and Feedback in `.zipzap/feedback/`.
Treat `.zipzap/reports/` as derived and rebuildable.

Commit project-owned Tasks, Reviews, Events, and Feedback to the project Git
repository. Keep the Skill installation outside the project. The generated
`.zipzap/.gitignore` excludes only derived or machine-local state.

Treat the Task as the durable source of work facts, evidence locators,
findings, continuation, and an optional team preference. Do not treat a team
preference or prior runtime snapshot as authority.

## Task Standard and Ready

Use Task Standard v1 for executable work. A Task is not a demand-pool item:
create it only after authorization and readiness, with status `ready`, or with
status `blocked` when an explicit open blocker and its resolution condition are
recorded. Do not use a `backlog` Task status.

Record origin, bounded scope and exclusions, stable acceptance-criterion IDs,
verification and evidence requirements, priority, schedule, three-point
estimate, accountability, dependencies, blockers, source locators, and the
readiness policy. Keep project rules at their authoritative locations;
`source_refs` contains locators, not copied rule content. Use
`origin.kind: direct` without promotion and reserve `backlog-item` for later
demand-pool promotion.

Evaluate the deterministic Definition of Ready before creating:

```bash
node scripts/task.mjs validate --input task.json
```

The result exposes `ready`, status compatibility, missing requirements,
warnings, and decisions. `create` invokes the same validation. Expedite mode
requires named authorization, reason, explicit waived requirements, and an
unexpired waiver. Objective, acceptance criteria, and accountable role cannot
be waived.

## Local Entry Point

Use `scripts/task.mjs` for local persistence and tracking:

```bash
node scripts/task.mjs validate --input task.json
node scripts/task.mjs create --input task.json
node scripts/task.mjs show --id task-id
node scripts/task.mjs list --status in-progress
node scripts/task.mjs transition --input transition.json
```

Every mutation uses an expected Task revision and writes atomically. Keep the
L5 Task Adapter as a pure patch derivation boundary; apply its patch only when
the stored revision matches:

```bash
node scripts/task.mjs apply-patch --input task-patch.json
```

Use `ready → in-progress → review → completed`, with risk-based short paths
where gates permit. Move active work to `blocked` only with an open blocker,
and leave it only after resolving that blocker. Unfinished work may be
cancelled; completed work may reopen to `in-progress`; cancelled work may
return to `ready`. Supply `blocker` while entering `blocked`, or
`resolve_blocker_ids` while leaving it, so the status and blocker mutation are
atomic. Do not change status through the general `update` command.

## Git Evidence

Capture the repository HEAD when tracking starts:

```bash
node scripts/task.mjs track-git --input git-tracking.json
node scripts/task.mjs sync-git --id task-id --expected-revision 2
```

Confirm Commit association only through an explicit SHA or this Commit
trailer:

```text
ZipZap-Task: task-id
```

Keep range, path, author, and branch matches as candidates until confirmed.
Persist SHA, subject, timestamp, mapped subject ID, file count, line statistics,
and changed paths. A Task creation or update input may supply participant
`git_identities` for local mapping; the CLI converts them to
`git_identity_hashes` before persistence. Do not persist full Diff or raw Git
identity. Load an exact Diff only when Review or diagnosis requires it.

## Review and Completion

Record Review through `record-review`. After fixes and recheck, replace the
revisioned result through `update-review`, then run `assess`. Derive completion
from acceptance-criterion evidence, required gates, Review independence, and
open Findings. A Commit, changed file, or completed-looking status is not
completion evidence by itself.

Use explainable states: `verification-needed`, `review-needed`,
`changes-requested`, `ready-to-complete`, `complete`, or `blocked`. Reject a
transition to completed unless the assessment is ready.

Use `assess --write --expected-revision <revision>` only when persisting the
derived assessment back into the Task. A read-only `assess` needs no expected
revision.

## Reports and Capability

Generate compact, deterministic data before asking AI to write prose:

```bash
node scripts/task.mjs report --period daily --scope person --subject user-id
node scripts/task.mjs report --period weekly --scope team
node scripts/task.mjs capability --subject user-id
```

Use Task, Event, Git Snapshot, criteria evidence, and Review Findings. Capability
profiles describe observed AI collaboration outcomes, not authorship share.
Always expose sample size, work mix, evidence references, confidence, and
limitations. Do not use the report as a standalone performance ranking.

## Feedback

Capture a problem, suggestion, success, or question as an immutable,
Git-shareable record:

```bash
node scripts/task.mjs feedback --input feedback.json
node scripts/task.mjs feedback-list
```

Link `task_id` when applicable. The CLI adds the current ZipZap version, Task
Standard version, a minimal Task/completion snapshot, and a Task locator
without copying source code or the Task objective. Keep observations and
artifact locators specific enough to reproduce. Share the resulting
`.zipzap/feedback/<feedback-id>.json` when reporting ZipZap behavior.

## Derived State

Store governance and runtime snapshots with `derived: true`, taxonomy and
policy versions, and the Task revision they assessed. Invalidate the prior
runtime snapshot when the Task, risk assessment, project sources, runtime
policy, or host capability changes.

Record the effective team only in the derived runtime snapshot. Never copy
project rules into the Task; retain their locators and the minimum evidence
statement needed for assessment.
