# First Run

Load this reference when guiding a newly installed ZipZap Skill through its
first project initialization. Use `schemas/first-run-input.schema.json` and
`schemas/first-run-output.schema.json` as the machine contract.

## Boundary

Treat First Run as a presentation and orchestration adapter above L5. Do not
add a fifth L5 operation. Keep direct `initialize` and `onboard` calls
available for automation and later reconfiguration.

Use project First Run only when `.zipzap/project.json` does not exist. When it
already exists, treat the person as a joining member: route to `onboard` with
user scope and do not rewrite the shared manifest. Use `initialize` with
`refresh` only for explicit source reconciliation.

## Sequence

Offer two presentation paths:

- `quick`: recommended defaults, one combined preview, then confirmation;
- `custom`: the complete form or stepwise preference flow.

Default a plain First Run request to Quick. Treat an explicit form or stepwise
presentation as Custom for backward compatibility.

Run:

1. `start` to discover project sources without writing and return the
   discovery preview, Host Capability Matrix, and either a form or the first
   question.
2. `submit` for a page form, or repeat `answer` for stepwise presentation.
3. Present one combined preview containing discovered source routing,
   coverage, all selected preferences, project storage, and warnings.
4. `confirm` the exact state revision and discovery fingerprint.
5. Configure project sources in one shared manifest write and store user-scoped
   preferences separately in Git-ignored `.zipzap/state/preferences.json`.
6. Return the stored initialization and post-check result.

The completed response includes a compact initialization summary: setup mode,
source count, missing-topic count, preferred team, response detail, humor, and
the shared and personal configuration locations.

Always show the core preference fields before confirmation:

- configuration scope;
- response detail;
- humor;
- preferred team.

Show team tone and Agent signatures as advanced fields. Let the user accept
recommended values, but never hide the resulting configuration summary.

Accept optional `host` capabilities on `start`, retain them in serialized
First Run state, and return the Matrix on every response. Use a form only when
the caller explicitly requests it or the host reports `guided-form`; otherwise
fall back to stepwise conversation. An omitted host produces `unknown`
capability statuses rather than optimistic assumptions.

## Safety

Keep every operation except the final successful `confirm` read-only. If
project sources change after preview, return a refreshed preview and require
confirmation again. If another process creates the project manifest, stop and
route to inspection instead of overwriting it.

For user-scoped project preferences, persist only differences from project
defaults in `.zipzap/state/preferences.json`. For user scope without a project,
or for session scope, return the validated configuration for the host to apply.
Do not pretend the CLI persisted host-owned state.
