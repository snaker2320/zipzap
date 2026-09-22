# Gates, Work and conditional branches

This reference applies after governed delivery is requested or required by project policy. Standalone standards discovery, document assistance and ordinary project work do not create a Loop. Optional assistance may be unavailable without blocking ordinary work; an unavailable required check still blocks its governed boundary.

## Three separate concepts

Stages (`plan`, `design`, `implement`, `verify`, `deploy`, `maintain`) identify delivery artifacts. Loops (`work`, `feedback`, `maintenance`) identify delivery, defect correction or standards improvement. Internal actions such as edit, build, test and fix do not create new stages or Feedback entries by themselves.

Operational maintenance can diagnose an incident and start bounded Work, or return a broader change to Plan/Design. It does not automatically enter the standards Maintenance Loop. Existing accepted designs and implementation plans can be consumed directly; do not manufacture missing historical stages or duplicate authoritative documents.

## Gate and Host boundary

The Gate derives scope checks for mutation, authorization for destructive/external actions, verification for completion, and independent review for high risk. Risk signals may raise declared risk and add checks. `claims_completion: true` submits the current result or stage, not permission to exceed `completion_stage`.

Entry checks are due before execution. With `claims_completion: false`, exit checks are pending and `completion_allowed` is false, even when execution is allowed. An internal iteration does not recruit future reviewers automatically. Missing/not-run evidence is distinct from a failed check or invalid binding.

`gate --enforce` writes JSON and exits 0 when the requested boundary is allowed, 2 when blocked, and 1 on invalid input. A Host hook or CI wrapper must actually invoke it and honor that exit before running the action. ZipZap installs no hooks and does not intercept commands. Authorization scope, authentic actor identity, protected paths, branch protections and tool access remain Host responsibilities.

Evidence with `status: passed` needs `evidence_ref`. `file:<path>` must exist relative to the project (standalone Gate uses the working directory). Other references, such as `host:<run-id>`, are Host attestations: ZipZap does not fetch remote logs, authenticate approvals or judge their contents. Preserve tool outputs and distinguish observed results from assertions.

Independent checks require `gate.authors` listing all artifact authors. Passing evidence records `actor` and `actor_type: agent`; the actor must match the Agent bound to that check ID in `execution.checks`. The Owner and authors cannot independently check their own result. When review must be independent from testing, the review and testing check IDs must bind different Agents. An identity label change does not create independence. Final check Agents should inspect requirements, artifacts and raw evidence without inheriting the author's conclusion.

## Owner, independent checks, handoffs and progress

`execution.owner` is the one current Work owner. Direct Work does not declare roles. `execution.checks` contains only `{id, agent_id}` bindings for independent Gate checks that are currently due; check status and evidence stay in `gate.evidence`. Do not create future check Agents while `claims_completion: false`. This keeps one source for each fact and avoids carrying duplicate status through the context.

The Host performs deterministic orchestration and remains responsible for Agent creation, liveness and message delivery. Do not assign an Orchestrator, Coordinator or Maintainer role. `maintain` is an operational stage; standards Maintenance is a separate Loop.

The installed Host profile records whether multi-Agent execution is available, allowed by default, identity-stable and able to acknowledge Handoffs. Missing or unknown profiles fail conservatively only when more than one Agent is required. `execution.multi_agent` may override the default policy for one Work, but cannot invent unavailable identity or acknowledgement support. Refresh the profile during install or upgrade when Host capability changes; do not probe it on each Loop call.

The same Owner may continue across stages without a Handoff. An ownership change at a staged Work boundary uses one current `execution.handoff`, bound to the current Git artifact. `prepared` waits for receiver acceptance; `accepted` transfers progress to the new Owner. A same-Agent transfer, mismatched artifact, or Handoff outside a real stage transition blocks. Handoff history belongs in Git rather than an ever-growing runtime array.

The Loop output exposes a derived `progress` snapshot with only `stage`, `status`, `owner`, `next_stage` and `blocker`; percentages and self-reported progress are excluded. Full output includes execution facts for audit. `--brief` omits those repeated facts and retains compact progress, Gate decision, active issues and artifact/input references.

## Work and input binding

Direct Work supplies `result_ref`, without artificial stages. Staged Work supplies `stage`, `completion_stage` and one artifact per represented stage. Its current artifact uses a repository-relative `locator` (file, directory, or `.`) and full `commit_sha`. Choose a scope that covers the governed result; a report file alone does not bind the code it describes. ZipZap checks the Git object, compares its content with HEAD, rejects uncommitted changes under that path, and checks an optional digest. Historical stages are not required solely to satisfy a sequence.

When work consumes accepted Git inputs, declare `inputs: [{id, locator, commit_sha, accepted_ref}]`. IDs are unique. Each input must still match its repository path. For external sources, the Host must maintain their authoritative version and acceptance; do not create Git copies just to satisfy this optional field.

Evaluation returns `bindings.inputs_sha256` for declared inputs and `bindings.acceptance_sha256` for a supplied acceptance contract. Obtain these with an in-progress evaluation, execute the work and checks, then attach the input digest to the current artifact and all exit evidence. Attach the acceptance digest to all exit evidence and each acceptance evidence item. Reusing old evidence after changing the inputs or expectations fails the binding check. Updating hashes is not re-verification: the Host must actually repeat affected checks.

An acceptance contract addresses positive, negative, boundary and regression cases and applicable constraints. `not-applicable` requires a reason. Applicable IDs need passing evidence. For a persisted Work, changing or removing the recorded contract also requires `acceptance_change_ref` naming the decision that permits the change; fresh evidence remains necessary. A legitimate test correction is allowed, but weakening the success criterion needs the appropriate authority.

Stage transitions remain explicit and reaching `completion_stage` ends Work. In-progress actions never complete it. Ordinary completion returns `report-result`; only `handoff_required: true` returns `prepare-git-handoff`. Deploy also requires a passed delivery assessment with checks and an artifact bound to the stage commit.

## Feedback and Maintenance

Problems retain fingerprint, checkpoint, status, return target and closure evidence. Open problems are corrected; resolved problems await verification; closure requires `verification_ref`. Failed Feedback verification reopens resolved items. Staged Feedback retains `completion_stage`; direct Feedback returns to the original Direct Work.

Ordinary standard proposals have `blocks_work: false` and do not stop Work or Feedback. Apply them through a separate, reviewed Maintenance action. A proposal that is necessary for delivery sets `blocks_work: true`. Before diverting, supply `resume` with `goal`, `return_to`, and either the staged `completion_stage` or direct `result_ref`, plus relevant Git `inputs` when needed. This preserves the original boundary. After Maintenance verification and closure, the next action resumes that Work; reassess affected inputs and evidence before completing it.

Proposal approval is still required to modify standards. Two independent checkpoints with the same problem may propose a change; high severity may propose one immediately. Prefer merging into the narrowest existing rule. Do not auto-approve proposals or edit `AGENTS.md` automatically.

## Correction and recovery

Scope/authorization failures, open high-risk issues and unreviewed required proposals block before internal iteration. Evaluation does not spend a correction. A submitted exit-Gate failure or failed Feedback re-verification permits one automatic correction; a second submitted failure stops. High-risk submitted failures stop immediately.

Normal CLI advancement records attempts in per-loop files under the repository/worktree user cache and takes a lock for each update. Omitting or lowering `attempt` cannot replenish the recorded budget, and interleaved loop IDs do not overwrite one another. Reuse a loop ID for the same work, not to reset a failed submission. `persist: false` is a labeled simulation; it does not enforce durable retry history. Lost cache cannot reconstruct attempts from Host memory or message queues.

A deterministic rerun must match the saved canonical input digest and returns the recorded decision without executing checks or spending another correction. It cannot turn a stopped decision into permission to proceed. A leftover lock requires inspection after confirming no writer remains; do not auto-delete a potentially live lock.

Use `loop --action status --input <same-request-file>` to inspect that loop's recorded result. Use `--brief` during ordinary advancement; omit it when the full execution record is needed. Agent creation, liveness and message transport remain Host-owned; saved Owner, check and Handoff facts are attestations, not a scheduler or message queue.
