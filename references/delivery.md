# Project build and non-production deployment

ZipZap owns the delivery vocabulary, ordering, gates, and evidence contract. The project owns every
command that builds, deploys, probes, tests, diagnoses, or rolls back its software. The Skill never
executes commands supplied through the `delivery` contract.

Use `delivery --action plan` to inspect project-owned candidates and validate an explicit mapping.
Discovery is advisory: a candidate is never executable authority. Record the confirmed mapping in the
narrowest project standard, normally `standards/engineering/build.md` and
`standards/delivery/deployment.md`, then give the same mapping to the plan.

The supported environments are `development` and `test`. Production is outside this contract. A
target must be explicit; shared or destructive deployment requires authorization, and a shared target
requires a rollback mapping.

Keep deploy and readiness separate. `deploy.apply` proves only that the project command returned
successfully. `deploy.probe` must prove that the target is ready and is running the exact artifact
identified by commit SHA and SHA-256. Test environments also require `deploy.smoke`. Do not rebuild in
the deploy phase: a source change produces a new artifact identity and restarts the build sequence.

Prefer existing project commands. A stable one-line probe or diagnostic command may be recorded
directly in a standard. Add a project script only when the behavior is multi-step, repeated, needs
timeouts or polling, or must enforce idempotency, target safety, structured failure, or rollback.

Use `delivery --action assess` only after the Agent has executed the confirmed commands through the
Host. Evidence must repeat the selected command and artifact digest; deploy evidence must also bind the
explicit target. A successful delivery verifies rollback availability without executing rollback merely
to create evidence. Pass the assessment result to the Work Loop while advancing the `deploy` stage.
A passed assessment permits the normal transition to Maintain. A failed assessment returns stable
problem items with a `return_stage` and enters the Feedback Loop; after correction and re-verification,
resume Work at that stage.
