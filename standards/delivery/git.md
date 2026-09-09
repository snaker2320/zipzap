---
priority: 10
applies_to:
  actions:
    - handoff
    - release
---
# Git delivery and Handoff standard

Keep commits single-purpose and use concise Conventional Commit-style subjects. Handoff state belongs in the final effective commit through `ZipZap-*` trailers. The durable delivery range is `base..HEAD`; the receiver must validate ancestry, commit availability, changed files, verification evidence, and remaining problem items.

Do not commit `dist/`. A local commit does not authorize push or release publication.
