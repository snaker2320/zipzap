# Gates, loops, and problem items

The shared Gate derives requirements from effect and risk:

- file mutation requires `scope-understood`;
- destructive or external effect requires `human-authorized`;
- completion claims require `verification-passed`;
- high risk requires `independent-review-passed`.

Work, Feedback, and Maintenance Loops share this gate. Attempt `0` is the initial model result. A non-high-risk failure may produce one correction at attempt `1`; another failure stops. High-risk failure stops immediately. `deterministic-rerun` may continue without incrementing the model attempt.

Feedback input contains problem items from explicit Git Checkpoints. A fingerprint appearing in two distinct checkpoints produces a proposal; high severity may produce one immediately. Proposals never write standards or `AGENTS.md`. Human-reviewed resolution merges or revises existing rules where possible.
