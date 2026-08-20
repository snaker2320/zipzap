# Business and Development Documentation

Load this reference only when creating or maintaining business-capability or
development-design documents. Keep external PRDs external and register their
locators as sources.

## Organize for one Work entry point

Group business knowledge vertically by cohesive capability. A capability file
keeps the concepts, states, flows, rules, exceptions, and ownership that
usually change and execute together. Do not split these into separate
domain-model, process, and rule trees unless they have independent boundaries
and independent reasons to change.

Use this lazy default for a new project:

```text
docs/
├── index.md
├── business/
│   ├── index.md
│   ├── shared.md
│   └── <business-capability>.md
└── design/
    ├── active/<demand-id>-<slug>.md
    ├── integrations/
    └── archive/
```

Preserve a coherent existing convention such as `specs/`, `rfcs/`, or
`doc/design/`. Propose migration only when the structure is ambiguous,
conflicting, or materially fragmented. Never move or rewrite a document from a
diagnosis alone.

One active development design is the execution entry point for one Demand or
bounded change. It carries the current delta, implementation scope, affected
components, verification approach, and state. It references stable business
facts instead of copying them.

## Write a capability document

Use the smallest set of headings that preserves the capability boundary:

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

Place a fact in `shared.md` only when at least two capabilities genuinely own
the same stable fact. Prefer a cross-reference when one capability owns it.
Split a large capability only when each resulting file has a cohesive boundary
and can change independently.

## Land understanding from a PRD

1. Register the external PRD with locator, authority, owner when known, and an
   observed version. Do not copy it into the repository.
2. Extract proposed actors, states, flows, rules, exceptions, and acceptance
   conditions with source evidence.
3. Match them to an existing capability or state why a new boundary is needed.
4. Present a delta containing current confirmed fact, requested change,
   proposed capability update, and unresolved questions.
5. Keep ambiguity under unresolved questions; never invent a business
   decision.
6. Obtain Product authority confirmation before proposed interpretation
   becomes current business documentation.
7. Update the capability document, then update the single active design.

## Write the active development design

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

Every business reference names a registered source ID and exact Markdown
heading. Start normal Work with this design, zero to three referenced business
sources, applicable engineering rules, and current Work state. Load heading
ranges rather than whole capability files when practical. If more sources are
needed, disclose the budget limit and narrow or explicitly expand scope.

## Maintain governed documents

Before writing, resolve one destination. A user-specified destination is a
one-time exception unless they explicitly update project routing. Ambiguity
pauses before any filesystem mutation; missing directories are created only
during an authorized write.

Create, edit, move, and delete through one read-only preview containing file
mutations, source metadata, relations, versions, reference risks, and manifest
revision. Apply only the caller-confirmed preview fingerprint. Moves repair
only declared in-scope references. Deletes require explicit approval after
showing inbound relations. Write the manifest last; if document and registry
state diverge, return `blocked` with reconciliation steps and make no
completion claim.

At completion, reconcile the implementation, affected capability headings,
and design state. Archive the design only when it is no longer an active
execution source.
