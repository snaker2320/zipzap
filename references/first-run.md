# First Run

Load this reference when guiding a newly installed ZipZap Skill through its
first project initialization. Use `schemas/first-run-input.schema.json` and
`schemas/first-run-output.schema.json` as the machine contract.

## Boundary

Treat First Run as a presentation and orchestration adapter above L5. Do not
add a fifth L5 operation. Keep direct `initialize` and `onboard` calls
available for automation and later reconfiguration.

Use First Run only when `.zipzap/project.json` does not exist. Route an
initialized project to `onboard` for preference changes or `initialize` with
`refresh` for source reconciliation.

## Sequence

Run:

1. `start` to discover project sources without writing and return the
   discovery preview, Host Capability Matrix, and either a form or the first
   question.
2. `submit` for a page form, or repeat `answer` for stepwise presentation.
3. Present one combined preview containing discovered source routing,
   coverage, all selected preferences, project storage, and warnings.
4. `confirm` the exact state revision and discovery fingerprint.
5. Configure project sources and project-scoped preferences in one project
   manifest write.
6. Return the stored initialization and post-check result.

Expose preference collection and final confirmation through
`decision_bundles`. Keep the legacy `form` or `question` projection for
compatible hosts, but treat the bundle as the authoritative rendering input.

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

For user- or session-scoped preferences, initialize project sources once and
return the validated preference configuration for the host to apply. Do not
pretend the CLI persisted host-owned state.
