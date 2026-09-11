# Git Checkpoint Handoff

Prepare the final commit message from an explicit base revision. The parser resolves both revisions to full commit SHAs, checks ancestry, enumerates every commit and changed file in `base..HEAD`, and reads structured metadata only from `HEAD`.

Required trailers are `ZipZap-Handoff: 1`, `ZipZap-Base`, `ZipZap-Status`, and `ZipZap-Summary`.
Verification uses `ZipZap-Verify: <command> => passed|failed|not-run`. A simple remaining problem item
may use `ZipZap-Issue: low|medium|high | <title>`. When Feedback must continue across the handoff,
`handoff prepare` uses compact versioned fields:

```text
ZipZap-Issue: 1 | <severity> | <status> | <return-stage> | <fingerprint> | <verification-ref-or-> | <title>
```

Inspection derives `checkpoint` from the containing commit SHA instead of duplicating it in the
payload. The title is last and may contain `|`; structural fields may not. This is commit metadata; it
does not create a GitHub Issue or ZipZap Task. Loaded standards use repeatable `ZipZap-Standard`
trailers.

If a later commit changes the delivery, regenerate the metadata and amend the final effective commit. An earlier handoff trailer cannot describe later commits safely.
