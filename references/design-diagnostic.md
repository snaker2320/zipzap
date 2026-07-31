# Design Diagnostic Review

Load this reference only for a bounded, read-only diagnosis of an existing
design. Keep it inside the visible Work action. Do not present it as a new
role, topology, workflow layer, or formal Review gate.

## Route

Select `design-diagnostic` when:

```json
{
  "intent": "diagnose",
  "scope_depth": "design-only",
  "assurance_target": "advisory"
}
```

Default an omitted assurance target for `diagnose` to `advisory`. Also permit
an explicitly requested `self-review`. Route to Solo Reviewer Review with an
ephemeral context. Query the compact policy without loading this reference:

```bash
node scripts/zipzap.mjs catalog \
  --kind execution-profiles \
  --id design-diagnostic \
  --section capsule
```

## Separate Risk From Assurance

Classify every present or unknown risk signal with:

- `subject`: risk belongs to the design being inspected;
- `action`: risk belongs to what the current execution will do;
- `both`: both classifications apply.

Use subject risk to choose review focus, evidence, and upgrade thresholds. Do
not derive execution gates, approval, persistence, or Multi-Agent topology
from subject risk alone. Apply normal effects to action risk.

Require explicit exposure on every classified signal in this profile. Never
use `intent: diagnose` to suppress actual access, mutation, authority, data,
or production risk. Return `diagnostic-upgrade-required` when current-action
risk or requested permissions exceed the read-only profile.

## Execute Read-Only

1. Resolve authoritative design and rule sources from
   `.zipzap/project.json`; discover read-only when the manifest is absent.
2. Load the target design, matching Reviewer rules, and only a directly linked
   current Task when relevant.
3. Inspect state transitions, money or value conservation, authorization,
   recovery and idempotency, auditability, observability, and unresolved
   business rules.
4. Return the diagnostic result and one optional upgrade action.

Do not run tests, builds, migrations, production commands, or implementation
scans. Do not mutate code, data, project state, Tasks, Reviews, Findings, or
reports. Do not claim verification, independent Review, acceptance,
completion, approval, or production readiness.

## Keep a Light Budget

Default to:

```json
{
  "evidence": "light",
  "max_source_files": 8,
  "allow_tests": false,
  "allow_mutations": false,
  "allow_persistence": false
}
```

Locate with native search or `rg`, then read the smallest relevant heading or
line range. Stop at the initial file budget, disclose coverage, and offer an
expanded diagnostic instead of silently exceeding it. Treat truncation as
incomplete evidence.

## Return a Diagnostic Result

Use `schemas/diagnostic-review.schema.json`. Include:

- `reasonable`, `conditionally-reasonable`, or `unreasonable`;
- advisory or accurately labeled self-review claim;
- positive conclusions and evidence-backed severity Findings;
- inspected scope, uninspected scope, and limitations;
- local feasibility and `production_acceptability: not-assessed`;
- decisions owned by an accountable business or technical owner;
- an optional upgrade recommendation;
- exact execution counts where available and unavailable token telemetry
  otherwise.

Use `blocker` or `high` severity to trigger an upgrade recommendation. Keep
Task priority `p0`–`p3` out of the diagnostic until accountable triage occurs.

Recommend, but do not start, targeted implementation verification when a
material Finding or suspected design-to-code mismatch needs evidence.
Recommend independent Review or formal acceptance only when the requested
claim requires it.
