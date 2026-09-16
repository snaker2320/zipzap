# Project build and non-production deployment

ZipZap owns delivery vocabulary, ordering, Gates, and evidence. The project owns every command that builds, deploys, probes, tests, diagnoses, or rolls back software. The Skill never executes commands supplied through the delivery contract.

Use `delivery --action plan` to inspect candidates and validate explicit mappings. Discovery is advisory. Record confirmed mappings in the narrowest project standard, normally `standards/engineering/build.md` and `standards/delivery/deployment.md`.

Supported environments are `development` and `test`; production is outside this contract. Targets must be explicit. Shared or destructive deployment requires authorization, and shared targets require a rollback mapping.

Keep deploy and readiness separate. `deploy.apply` proves command success. `deploy.probe` proves target readiness and exact artifact identity. Test environments also require `deploy.smoke`. Do not rebuild during Deploy: a source change creates a new artifact identity and returns to workflow stage Implement.

Prefer existing project commands. Add a script only for multi-step, repeated, timeout/polling, idempotency, target-safety, structured-failure, or rollback behavior.

After the Agent executes confirmed commands through the Host, `delivery --action assess` validates command, artifact digest, target, authorization, readiness, Smoke, and rollback evidence. Pass the assessment to workflow stage `deploy`. A failed Build or Smoke slot returns a problem item with `return_to: implement`; other deploy failures use `return_to: deploy`. Correction and re-verification resume Work at that target.
