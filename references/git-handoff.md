# Git Checkpoint Handoff

Prepare the final commit message from an explicit base revision. The parser resolves both revisions to full commit SHAs, checks ancestry, enumerates every commit and changed file in `base..HEAD`, and reads structured metadata only from `HEAD`.

Required trailers are `ZipZap-Handoff: 1`, `ZipZap-Base`, `ZipZap-Status`, and `ZipZap-Summary`. Verification uses `ZipZap-Verify: <command> => passed|failed|not-run`. Remaining problem items use `ZipZap-Issue: low|medium|high | <title>`. Loaded standards use repeatable `ZipZap-Standard` trailers.

If a later commit changes the delivery, regenerate the metadata and amend the final effective commit. An earlier handoff trailer cannot describe later commits safely.
