# Git Checkpoint Handoff

A handoff describes a non-empty `base..HEAD` range. ZipZap resolves commits, checks ancestry, enumerates the full range and reads structured metadata from the final effective commit. A handoff is useful for transfer or recovery; an internal edit, test failure or independent-check assignment does not require another commit.

Keep coherent, independently reviewable or revertible commits. Preserve checkpoints while another participant depends on them. Before final integration, fixup commits may be consolidated by logical change; do not squash the whole Loop automatically. Rebase/squash can invalidate commit references. Regenerate handoff metadata and re-establish evidence against the resulting content before making a completion claim. Do not rewrite shared history without authorization.

## Prepare and inspect

Use `handoff --action prepare` after a non-empty range exists, before amending the final message. Required trailers are `ZipZap-Handoff: 1`, `ZipZap-Base`, `ZipZap-Status` and `ZipZap-Summary`. Single-line fields cannot inject additional trailers. If later commits change delivery, regenerate metadata on the new final effective commit.

Verification uses `ZipZap-Verify: <command> => passed|failed|not-run`. A new `complete` handoff requires at least one passing verification, no failed/not-run checks, and no unresolved issues. Partial and blocked handoffs preserve incomplete work honestly. Inspection still reads legacy records, but exposes contradictory completion as `consistency.status: blocked`; it does not treat a historical declaration as proof.

## Continuation boundary

When another context must continue the work, supply `work`:

```yaml
work:
  goal: Deliver the design only; implementation is out of scope.
  return_to: design
  completion_stage: design
```

For Direct Work use `return_to: direct` and `result_ref`, without `completion_stage`. Optional `inputs` preserve unique IDs, repository-relative locators, commit SHAs and acceptance references. The final commit stores this compact object in one `ZipZap-Work` JSON trailer. Its terminal staged boundary must be reached before declaring the whole work complete.

Inspection returns this boundary, input availability/freshness, worktree cleanliness, and `ready_to_resume`. Legacy handoffs without the boundary remain readable but are not automatically resumable; reconstruct the missing goal/end point from authoritative context. Readiness is a recommendation, not authorization to execute the next stage or replay Host messages. Checkpoints do not restore an execution context or message queue.

Git input comparison uses content identity, so a metadata-only amend need not invalidate unchanged content while the original reference is available. If referenced commits are no longer available after history rewriting, rebind through a reviewed equivalence decision or repeat the affected verification. Never replace SHAs in an old report and claim it was rerun.

## Problem items

Rich issue trailers use:

```text
ZipZap-Issue: 2 | <severity> | <status> | <return-to> | <fingerprint> | <verification-ref-or-> | <title>
```

`return-to` is `direct` or a workflow stage. Inspection derives the checkpoint from the containing commit. Titles may contain `|`; structural fields may not. Structured version 1 remains readable and maps legacy `build`/`test` to `implement`/`verify`. The simple `low|medium|high | title` form remains readable as an unresolved legacy observation. These are commit records, not external issue-tracker operations.
