# Rule Health and Document Routing Design

**Date:** 2026-08-19
**Status:** Approved in conversation; awaiting written-spec review
**Scope:** Rule health diagnosis, adaptive project registration, document
routing, business-document guidance, and project-owned maintenance state.

## Context

ZipZap already discovers project documents, registers source locators in
`.zipzap/project.json`, resolves sources by topic and selector, detects missing
or stale registered sources, and composes minimal Runtime Projections. It does
not yet provide a user-invoked rule health diagnosis, persistent suppression of
acknowledged advice, a document destination resolver, or guidance for turning
an external PRD into compact business and development documentation.

The feature must preserve ZipZap's position as the governance, context,
evidence, and decision control plane. External systems continue to own issues,
source code, CI/CD, production operation, and scheduled triggers. Project
documents remain the authoritative sources; ZipZap stores routing and
maintenance metadata, not copied rule content.

## Goals

1. Adapt to existing project rules without moving or rewriting them during
   initialization.
2. Let a user explicitly diagnose structural and semantic rule smells with a
   visible cost boundary.
3. Offer evidence-backed migration advice without applying it until the user
   approves.
4. Persist ignored advice so unchanged evidence does not produce repeated
   prompts.
5. Route newly authored documents to a unique, project-appropriate location
   before writing.
6. Give agents one compact development-design entry point and load only the
   referenced business headings needed for the current Work.
7. Maintain registered source metadata when ZipZap is authorized to create,
   edit, move, or delete governed documents.

## Non-goals

- Background, scheduled, file-watcher, or Work-triggered health scans.
- Automatic migration, deletion, rewriting, or normalization of existing
  project documents.
- Copying project rules or external PRDs into ZipZap state.
- Replacing product management, issue tracking, CI/CD, deployment, or runtime
  observability systems.
- Requiring ZipZap-specific Markdown anchors or frontmatter.
- Treating generated semantic conclusions as approval or authoritative
  business truth.

## Product Model

People continue to see only **Initialize**, **Work**, and **Complete**:

- **Initialize** discovers and maps sources and document conventions, previews
  configuration, and writes one confirmed project manifest. It does not run a
  rule health diagnosis.
- **Work** can explicitly diagnose project rules, disposition a diagnosis,
  create a routed document, or perform ordinary engineering work with minimal
  source projections.
- **Complete** assesses the requested outcome and applicable evidence. It does
  not turn an advisory rule diagnosis into a completion gate.

The internal implementation exposes deterministic `rule-health` and
`document-route` functions behind the existing L5 boundary. These are not new
user-facing lifecycle phases.

## Design Principles

1. **Preserve before standardizing.** Existing project structure takes
   precedence over ZipZap defaults when it is coherent.
2. **One authoritative source.** The manifest stores locators, metadata,
   relations, versions, and routing conditions, never substantive rules.
3. **Explicit diagnostic cost.** Rule health runs only after a user asks for
   it and declares a scan depth.
4. **One execution entry point.** A development Work starts from one active
   design document and expands to exact referenced headings only when needed.
5. **Current state plus delta.** Business capability documents describe
   confirmed current business facts; development designs describe one proposed
   or active change.
6. **Evidence before advice.** Every semantic Finding cites source locators,
   source versions, and evidence ranges or headings.
7. **Silence is scoped.** Ignoring a Finding suppresses only the same problem
   fingerprint against the same evidence versions.

## Recommended Project Documentation

For a new project, ZipZap recommends logical destinations but creates a
directory only when an authorized document write first needs it:

```text
docs/
├── index.md
├── business/
│   ├── index.md
│   ├── shared.md
│   └── <business-capability>.md
├── design/
│   ├── active/
│   │   └── <demand-id>-<name>.md
│   ├── integrations/
│   └── archive/
├── architecture/
│   ├── overview.md
│   ├── components/
│   └── decisions/
├── standards/
├── operations/
├── governance/
└── archive/
```

`docs/product/` is optional. It is recommended only when a project owns product
vision, roadmap, or original product requirements in the repository. An
external PRD is registered as an external source and is not copied locally.

Existing projects may continue to use `specs/`, `rfcs/`, `docs/adr/`,
`doc/design/`, or another coherent convention. Initialization maps those
locations to semantic document kinds. It proposes migration only for an
ambiguous, conflicting, or materially fragmented structure.

## Business Documentation Model

### Vertical capability documents

Business documentation is grouped by cohesive business capability, not split
horizontally into domain-model, process, and rule directories. One capability
document contains the knowledge an agent commonly needs together:

```markdown
# <Business Capability>

## Business boundary
## Actors
## Core concepts
## States and transitions
## Main flow
## Exceptional flows
## Business rules
## Invariants
## Authorization and ownership
## Relationships to other capabilities
## Sources and last confirmation
```

Examples include `quotation.md`, `credit-limit.md`, `position.md`, and
`close-position.md`. A capability is split only when the resulting parts have
independent boundaries and change for independent reasons. `shared.md` contains
only facts genuinely shared by at least two capabilities.

### Development design as the execution entry point

One active development design is the primary entry point for one Demand or
bounded change:

```text
docs/design/active/<demand-id>-<name>.md
```

It uses this structure:

```markdown
# <Demand ID> <Design Name>

## Status and ownership
## PRD and other sources
## Current behavior
## Business understanding for this change
## Business delta
## Scope and non-scope
## Unresolved business questions
## Referenced business capabilities and headings
## Target behavior
## Affected components
## Data and state changes
## Interfaces and events
## Failure, recovery, and idempotency
## Verification approach
## Implementation state
```

The design references source IDs and exact headings. It does not copy stable
business rules. A normal Runtime Projection initially contains the design,
zero to three referenced business sources, matching engineering rules, and
current Work state. The Context Router reads heading ranges rather than whole
large documents when practical. Exceeding the source budget produces a visible
limitation or scope decision, not a silent broad scan.

### Business documentation landing process

1. Register the external PRD or other source with locator, authority, owner
   when known, and an observed version when available.
2. Extract proposed actors, states, flows, rules, exceptions, and acceptance
   conditions with source evidence.
3. Match the proposal to an existing business capability or justify a new
   capability boundary.
4. Present a delta: current confirmed fact, requested change, proposed document
   update, and unresolved questions.
5. Keep ambiguity in explicit unresolved questions. The agent must not invent
   missing business decisions.
6. Require Product authority to confirm the business interpretation before it
   becomes current business documentation.
7. Update the capability document and then create or update one active
   development design that references exact business headings.
8. Developer, Tester, and Reviewer work from that design and its bounded source
   references.
9. At completion, reconcile implementation, capability documentation, and
   design state. Archive the design only after it is no longer an active
   execution source.

## Manifest Extensions

The existing manifest remains valid. New fields are optional and do not change
the meaning of existing fields.

### Source provenance and relations

Each source may optionally include:

```json
{
  "relations": {
    "derived_from": ["external-prd-123"],
    "references": ["business-close-position"],
    "supersedes": []
  },
  "document_kind": "business-capability",
  "status": "active"
}
```

Supported initial `document_kind` values are:

- `business-capability`
- `development-design`
- `integration-design`
- `architecture-overview`
- `architecture-decision`
- `engineering-standard`
- `operations-guide`
- `governance-policy`
- `external-requirement`
- `project-reference`

Supported initial `status` values are `draft`, `active`, `superseded`, and
`archived`. These are routing metadata, not completion or approval claims.

### Document routing

The optional manifest section is:

```json
{
  "document_routing": {
    "strategy": "preserve-existing",
    "on_ambiguity": "decision-required",
    "on_mismatch": "approval-required",
    "routes": [
      {
        "id": "business-capability",
        "document_kinds": ["business-capability"],
        "target": "docs/business",
        "filename_pattern": "<capability>.md",
        "priority": 100
      },
      {
        "id": "development-design",
        "document_kinds": ["development-design"],
        "target": "docs/design/active",
        "filename_pattern": "<demand-id>-<slug>.md",
        "priority": 100
      }
    ]
  }
}
```

Initialization records an existing coherent route before adding a ZipZap
default. It never fabricates an owner, authority, or source relationship that
the project does not establish.

## Document Route Resolution

The resolver accepts document kind, topics, related source IDs, component,
stage, intended filename inputs, and an optional user-specified target. It uses
this precedence:

1. A target explicitly stated by the user for the current request.
2. An explicit project route in `.zipzap/project.json`.
3. A coherent route inferred and confirmed during initialization.
4. The ZipZap default for a new or unmapped project.
5. `decision-required` when multiple highest-precedence routes remain.

A unique route returns `ready` with the target path and required registry
change. A missing target directory is created lazily as part of the already
authorized document write. A non-standard user target is a one-time exception
unless the user explicitly asks to update the project default. A conflicting
or ambiguous target pauses before any filesystem mutation.

## Explicit Rule Health Diagnosis

### Trigger and depth

Rule health never runs automatically. A user explicitly requests one of:

- `quick`: deterministic checks only;
- `standard`: deterministic checks plus bounded semantic review of candidates;
- `deep`: a larger, explicitly disclosed semantic file and evidence budget.

Initialization discovery, source refresh, ordinary Work, and source version
changes do not trigger diagnosis. They may update or report deterministic
source availability as part of their existing responsibilities.

### Deterministic checks

- missing, unavailable, or version-mismatched registered sources;
- duplicate IDs, locators, topics, or observations;
- invalid selectors and selectors that reference unsupported catalog values;
- missing owner, authority, scope, or precedence metadata;
- missing role-topic coverage;
- a registered source moved or removed;
- a routed document outside its confirmed target;
- one source assigned many unrelated topics;
- large or broadly scoped instruction files as semantic-review candidates.

A universal rule or missing owner may be intentional. Deterministic checks
therefore distinguish invalid configuration from an advisory candidate.

### Semantic checks

- semantically duplicate rules with different wording;
- contradictory requirements or unclear precedence;
- mixed responsibilities and low document cohesion;
- rules inconsistent with evidenced current project structure;
- missing applicability or retirement conditions;
- a likely superseded rule;
- a design that duplicates stable business rules rather than referencing them;
- a design that requires too many unrelated business sources;
- whole-document references where precise headings are available;
- an archived design still used as current authority.

Semantic conclusions are advisory and require cited evidence. Unsupported
inferences are returned as limitations or unresolved owner decisions.

### Finding shape

Each Finding contains:

```json
{
  "fingerprint": "sha256:<digest>",
  "category": "semantic-duplicate",
  "severity": "medium",
  "confidence": "high",
  "source_refs": [
    {
      "source_id": "business-close-position",
      "locator": "docs/business/close-position.md",
      "version": "sha256:<digest>",
      "heading": "Business rules"
    }
  ],
  "evidence": [],
  "impact": "The runtime may receive conflicting instructions.",
  "recommendation": "Keep one rule and replace the duplicate with a link.",
  "migration_proposal": null,
  "disposition": "open"
}
```

Severity is `blocker`, `high`, `medium`, `low`, or `advisory`. Confidence is
`high`, `medium`, or `low`. Rule Doctor remains advisory; normal Work may block
only when an applicable authoritative source or gate is actually absent.

The fingerprint is deterministic over category, canonical affected source
IDs, normalized evidence identity, and the source versions used for the
Finding. Presentation wording is excluded.

## Ignore and Restore

An explicit ignore writes one project-owned record:

```text
.zipzap/rule-health/ignores/<fingerprint>.json
```

The record contains fingerprint, category, source IDs and versions, actor,
timestamp, optional reason, and the ZipZap version. `blocker` and `high`
Findings recommend but do not require a reason.

Normal diagnosis output omits matching ignored Findings and reports only an
ignored count. A user can include ignored Findings, restore one, or list all
ignore records. A source version change does not trigger a scan. At the next
explicit diagnosis the changed versions produce a different fingerprint; the
old ignore no longer suppresses a materially changed Finding. If evidence and
versions are unchanged, the Finding remains silent.

Diagnosis is read-only by default and does not persist a full report. Ignore
and restore are explicit project writes. A full result is written under
`.zipzap/reports/` only when the user explicitly asks to retain it.

## Migration Advice

A migration proposal contains current path, proposed path, reason, affected
links and registration entries, expected file mutations, risks, and the impact
of retaining the current structure. Its dispositions are `accept`, `ignore`,
and `later`.

- `accept` authorizes a separately previewed move, reference repair, and
  manifest update;
- `ignore` creates the version-bound ignore record;
- `later` makes no project mutation and may be shown by a later explicit
  diagnosis.

No diagnosis operation applies a migration.

## Maintenance Transactions

When an authorized Work creates or changes governed documents, ZipZap includes
document and manifest changes in one preview. After successful file mutation:

- a new governed document is registered with its locator, kind, topics,
  selectors, relations, and version;
- an edited registered source receives a new content hash;
- an approved move updates its locator and repairs only in-scope references;
- an approved deletion removes registration only after reporting reference
  risks;
- manifest revision increments;
- no unrelated project files are scanned or changed.

Filesystem writes use project-root containment checks, temporary manifest
writes, and atomic rename as the existing initializer does. If the document
write succeeds but registry update cannot be committed, the operation returns
`blocked` with reconciliation instructions and must not claim maintenance
completion.

External human edits do not trigger background reconciliation. The user may
run Initialize refresh or a later explicit Rule Doctor.

## Internal Interfaces

The deterministic core provides:

```text
diagnoseRuleHealth(input) -> ruleHealthResult
resolveDocumentRoute(input) -> documentRouteResult
applyRuleHealthDisposition(input) -> dispositionResult
planDocumentMaintenance(input) -> maintenancePreview
```

The optional runner exposes command adapters:

```text
rule-health: diagnose | ignore | restore | list-ignored
document-route: resolve
```

L5 maps user intent to these capabilities through Initialize, Work, or
Complete. Diagnostic internals are visible only when the user requests them.

New schemas are required for rule health input/output, ignore records,
document-route input/output, and maintenance preview. The project manifest
schema gains only optional fields and remains backward compatible with
existing manifests.

## Error and Decision Handling

- Invalid configuration returns a structured error with a corrective hint.
- Missing evidence produces a limitation, not a semantic accusation.
- Ambiguous route resolution returns `decision-required` and performs no write.
- A target escaping the project root is rejected.
- An unavailable external PRD is reported; ZipZap does not substitute an
  unapproved source.
- A stale or changed source does not bypass an existing Work gate.
- Different authorities are represented as separate decision bundles.
- A failed ignore write leaves the Finding unsuppressed and reports the exact
  failure.

## Testing Strategy

Implementation follows test-driven development and adds:

1. **Schema tests** for new optional manifest fields and all new contracts.
2. **Deterministic rule-health unit tests** for every structural category,
   stable fingerprints, version-sensitive suppression, and unchanged evidence.
3. **Route unit tests** for precedence, existing-project preservation, default
   routes, user exceptions, ambiguity, lazy directory plans, and root escape.
4. **Initialization tests** proving discovery does not invoke semantic
   diagnosis and does not move files.
5. **Maintenance tests** for register, edit, approved move, approved delete,
   manifest revision, and partial-failure reconciliation.
6. **CLI tests** for `quick`, `standard`, `deep`, ignore, restore, retained
   reports, structured errors, and copyable examples.
7. **Conformance tests** proving user-facing Initialize/Work/Complete remain
   intact and decision gates pause before mutations.
8. **Regression tests** for existing manifests, source resolution, onboarding,
   first run, Runtime Projection composition, and lifecycle verification.

No runtime package may be added.

## Delivery Slices

The implementation can land in four independently testable slices:

1. Manifest provenance and document-route resolution, including initialization
   inference and defaults.
2. Deterministic `quick` Rule Doctor and ignore/restore state.
3. Bounded semantic candidate protocol for `standard` and `deep` modes.
4. Authorized document maintenance transactions and business-document
   guidance integrated into Work.

Each slice preserves old behavior when its optional inputs are absent.

## Acceptance Criteria

1. An existing project can initialize without moving or rewriting any document.
2. Initialization discovers and maps sources but never performs semantic rule
   health analysis.
3. A user who does not explicitly request Rule Doctor pays no health-analysis
   cost.
4. `quick` returns deterministic evidence-backed structural Findings.
5. `standard` and `deep` disclose and enforce their semantic source budgets.
6. Ignoring a Finding suppresses unchanged evidence across sessions and team
   members.
7. Changed source versions require the Finding to be reconsidered only during
   the next explicit diagnosis.
8. A unique document intent resolves to one destination; ambiguity pauses
   before writing.
9. A user-specified non-standard path is a one-time exception unless the user
   explicitly changes project routing.
10. New projects use lazy default destinations; existing coherent conventions
    are preserved.
11. Business knowledge is grouped by cohesive capability and one active
    development design is the Work entry point.
12. Runtime source expansion targets exact referenced headings and discloses
    budget limitations.
13. ZipZap-authored governed document changes keep source locators, relations,
    versions, and manifest revision consistent.
14. No migration or semantic rewrite occurs without explicit approval.
15. Existing manifests and current source-resolution behavior continue to pass
    regression tests.

## Production Boundary

This design defines local project behavior and contracts. It does not establish
production readiness, business acceptance, or independent review. Those claims
require implementation evidence, tests, and the applicable ZipZap gates.
