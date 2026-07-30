# Copilot Team Preset

The authoritative Copilot definition is
[`config/teams.json`](../config/teams.json) at `teams.copilot`.

Wolf is the default Pilot and owns execution, artifact changes, evidence, and
role transitions. Eagle is the default read-only Advisor and challenges plans,
risks, omissions, tests, and completion evidence at material checkpoints.
Material advice requires a disposition.

Copilot provides a distinct second context and peer challenge. It does not
provide formal independent testing, review, approval, or role separation. If
the Advisor co-authors an artifact, record the changed authorship boundary.

Query `node scripts/zipzap.mjs catalog --kind teams --id copilot` for design or
audit. Upgrade to Trio or Squad when formal independent assurance is required.
