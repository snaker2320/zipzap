# Context Router

The Context Router generates one minimal Runtime Projection and its manifest
from a valid Team Binding. Use this diagnostic view only when auditing L4:

```bash
node scripts/zipzap.mjs project --input kernel-request.json
```

For accountable work, select one profile capsule, one Role capsule, and one
current stage overlay. For control-plane work, select one profile capsule and
one Control Function overlay at a valid checkpoint. Add only matching
project-rule locators, work and handoff state, evidence requirements, Findings,
authority boundaries, and assurance.

When the Work request names a project, hydrate Capability Profiles only from
Manifest v2 registrations under `.zipzap/capabilities/`. Build one
ExecutionSpec and match profiles against the current role, stage, requested
action, affected components, and affected files. Add only the selected
profiles' scalar facts and exact authoritative source references. Explicitly
requesting a capability may make it a candidate, but never bypasses disabled,
invalid, missing, or stale evidence.

The manifest records included modules, source versions, binding revision, and
unresolved items. It does not copy authoritative project rule content.

Rebuild when Role, stage, checkpoint, scope, risk, requested action, affected
components, Findings, handoff, or source version changes. Never let a stale
Projection authorize a consequential action.

If a selected profile's source fingerprint has changed, invalidate the prior
Projection. Work may reread registered evidence and build a bounded ephemeral
overlay, omit facts it cannot re-establish, and return a `refresh-recommended`
limitation. It must not write the profile or Manifest. Missing or conflicting
authoritative evidence blocks or requests a decision; Initialize Refresh owns
the later preview-confirm write.

Resolve `required_rule_topics` against `.zipzap/project.json` before loading
content. Use `source-resolve` to return only applicable locators. A
host-preloaded source remains governing evidence but is not loaded again.
Read a matching Markdown heading range when practical; loading an entire small
document remains valid. A section index is an optional accelerator, not an
authority source.

For source code or large text, locate before reading:

1. use host-native search or `rg --files` to narrow candidate files;
2. use a symbol, type, method, or exact keyword search to locate the relevant
   range;
3. read only that heading or line range;
4. expand incrementally only when the evidence is insufficient.

Treat truncated output as an incomplete read. Never infer that a symbol,
branch, Finding, or constraint is absent merely because a tool result was
truncated. Record the reason when a whole large file is genuinely required.

For a `design-diagnostic` projection, apply its execution budget as an initial
coverage boundary. Stop after the configured source-file limit, disclose
uninspected areas, and offer an expanded diagnostic. Do not load
Finding-specific implementation fragments, run tests, or persist output until
the user authorizes an upgraded scope.

For an explicit Rule Doctor Work, keep deterministic scanning separate from
semantic judgment. `quick` returns deterministic Findings only. `standard` and
`deep` return a bounded `semantic_review_request`; a Reviewer reads only its
selected sources and exact evidence ranges. The script validates the Reviewer's
source-bound assessment and creates stable Finding fingerprints, but it never
claims to perform semantic reasoning itself. Rule health is never triggered by
initialization, ordinary Work, source refresh, or file changes.
