# Kernel and Project Capability Profiles Design

**Date:** 2026-08-20

**Status:** Approved in conversation; awaiting written-spec review

**Scope:** Single-package Kernel modularization, project capability profiling,
precise runtime context selection, and explicit profile maintenance.

## Context

ZipZap already has a working Kernel prototype: L5 maps Initialize, Work, and
Complete into risk normalization, preset resolution, team binding, source
routing, Runtime Projection composition, decisions, continuation, and
reconciliation. The implementation still loads roles, teams, policies, and
other catalogs directly from fixed `config/*.json` paths, while project
`extensions` are metadata without a runtime loader.

The required extensibility is not a plugin marketplace. It is the ability to
adapt generic role constraints to a concrete project's technology and custom
rules, then load only the applicable context. A Java project may require a
specific Java version, build tool, framework, verification command, directory
scope, and local engineering rules. Those requirements must come from that
project's authoritative sources, not from a globally installed or copied
project Skill.

This design evolves the current Kernel rather than replacing it. It depends on
the rule-health and document-routing work at the base of
`codex/kernel-capability-profiles`, but keeps the new architecture on its own
branch.

## Product and Ownership Boundary

People continue to see only:

- **Initialize**: discover, preview, and explicitly configure project context;
- **Work**: select and execute the next accountable action;
- **Complete**: inspect evidence, gates, limitations, and completion claims.

ZipZap owns engineering-work governance, context selection, evidence,
decisions, and state transitions. External systems continue to own issue
tracking, source code, CI/CD, production operation, and scheduled triggers.

Project files and external registered sources remain authoritative. ZipZap may
store structured facts, selectors, provenance, and source fingerprints, but it
must not copy substantive project rules into installed Skill content or a
capability profile.

## Goals

1. Separate Kernel orchestration from role, policy, capability, and context
   module content inside one ZipZap distribution.
2. Derive Git-shareable Project Capability Profiles from authoritative project
   configuration and rules after an explicit preview and confirmation.
3. Select capabilities automatically during Work using the current Role,
   Stage, action, component, target files, and risk.
4. Load only the generic modules, project facts, and exact authoritative source
   ranges required for the current action.
5. Invalidate stale profiles and Runtime Projections without silently writing
   project state.
6. Keep the architecture small enough to verify without a marketplace,
   dependency resolver, graph framework, or runtime package installation.

## Non-goals

- A plugin marketplace, installer, package resolver, or external plugin
  lifecycle.
- Independently installed or upgraded Role plugins.
- Automatically generated Host-level `SKILL.md` files per project.
- Global Java, Spring, Maven, frontend, database, or security rules that
  override project evidence.
- Background project scans, scheduled refreshes, or file watchers.
- Automatic Rule Doctor execution during Initialize or Work.
- Automatic persistence when a profile or source becomes stale.
- Backward compatibility with the current project-manifest or internal machine
  contract versions.
- A graph framework, workflow engine, or general-purpose retry DSL.

## Chosen Approach

Use a **single-package modular Kernel**. ZipZap remains one installed Skill or
distribution, but its internals communicate through explicit contracts:

```text
Initialize / Work / Complete
            |
       Host Adapter
            |
      Kernel Orchestrator
       |-- Risk and Gate Evaluator
       |-- Execution Planner
       |-- Module Catalog
       |    |-- Roles
       |    |-- Capabilities
       |    |-- Policies
       |    `-- Context Providers
       |-- Capability Profiler
       |-- Capability Matcher
       |-- Source Resolver
       |-- Context Assembler
       `-- Loop and State Controller
```

The current `evaluateKernel` path becomes the orchestrating entry point behind
these modules. The change is an extraction and contract clarification, not a
second Kernel or a rewrite of the public lifecycle.

## Stable Role Semantics

Product, Developer, Tester, and Reviewer remain the four accountable Role
semantics enforced by the Kernel. Their authority, prohibitions, evidence
boundaries, and independence rules are not project-replaceable.

Their detailed definitions, capsules, and Stage overlays move behind the
Module Catalog so the Kernel does not hard-code role content. Agent Profiles
remain execution configurations rather than roles. Technology specialization
belongs to a capability profile:

```text
Java implementation = Developer Role + project java-development capability
Java verification   = Tester Role + project java-development capability
Java review         = Reviewer Role + project java-development capability
```

## Module Catalog

The Module Catalog is an in-process registry, not a plugin registry. It returns
validated built-in Module Definitions by stable ID and revision. Supported
module kinds are:

- `role`: complete contracts and minimal runtime capsules;
- `capability`: reusable workflow structure when genuinely project-neutral;
- `policy`: conditional governance selected by scope or risk;
- `context-provider`: deterministic sources of bounded context.

The first implementation has no external providers, installer, dependency
solver, or dynamic code execution. Existing fixed catalogs are reorganized
behind this interface as part of the new architecture; no compatibility
provider preserves their old loading contract.

A Module Definition declares metadata, selectors, a compact capsule, optional
reference locators, required inputs, and output obligations. It cannot grant
authority, downgrade governance, or execute commands.

## Project Capability Profile

### Storage

Confirmed profiles are Git-shareable project state:

```text
.zipzap/
|-- project.json
`-- capabilities/
    `-- <capability-id>.json
```

`project.json` registers each profile using a stable ID, project-relative
locator, and enabled state. The profile file is independently revisioned and
validated.

Machine-local derived state is Git-ignored and rebuildable:

```text
.zipzap/cache/capabilities/
.zipzap/cache/projections/
```

### Contract

A profile contains only bounded structured data:

```json
{
  "schema_version": 1,
  "id": "java-development",
  "revision": 1,
  "status": "active",
  "facts": [
    {
      "key": "java-version",
      "value": "17",
      "source_id": "maven-project",
      "evidence": "pom.xml:properties/maven.compiler.release",
      "source_digest": "sha256:..."
    }
  ],
  "selectors": {
    "roles": ["developer", "tester", "reviewer"],
    "actions": ["implement", "verify", "review"],
    "components": ["backend"],
    "file_patterns": ["**/*.java", "pom.xml"]
  },
  "source_refs": [
    {
      "source_id": "backend-standard",
      "section": "Java development"
    }
  ],
  "profile_digest": "sha256:..."
}
```

Fact values are limited to JSON strings, numbers, booleans, or null. The
contract preserves these semantics:

- every fact has provenance and a source fingerprint;
- selectors are declarative and project-root-contained;
- source references point to sources registered in `project.json`;
- rule prose is never copied into the profile;
- executable hooks and embedded scripts are forbidden;
- disabled profiles are never selected.

The MVP uses flat capability IDs. Frameworks, build tools, and versions are
facts inside the project profile. It does not introduce a hierarchy or
capability dependency graph.

## Project-derived, Not Generic Java Knowledge

`java-development` is a local test fixture and example profile used to prove
the end-to-end pipeline. It is not a production built-in that supplies generic
Java versions, framework advice, coding rules, or commands.

Local tests may use sample Maven or Gradle projects to demonstrate detection,
profile generation, matching, staleness, and context loading. In a real Java
project, every material constraint comes from that project's authoritative
configuration and registered rules. ZipZap may know how to locate common
evidence such as Maven or Gradle configuration, but it may not replace missing
project requirements with universal Java guidance.

The same rule applies to future technology profiles: detectors can locate and
structure evidence; the project owns the requirements.

## ExecutionSpec

Introduce a versioned internal `ExecutionSpec` derived from the L5 Work input,
risk normalization, project configuration, and current runtime state. It is
not a fourth user action and is not persistent by default.

It records:

- objective, scope, requested action, and affected components or files;
- Role, Stage, Control Function, and binding revision;
- selected module IDs and Project Capability Profile locators;
- source locators and exact ranges required for expansion;
- risk flags, Gate requirements, authority boundaries, and assurance;
- evidence requirements and context budgets;
- source, profile, binding, and projection revisions;
- unresolved selection or authority decisions.

The Kernel plans with `ExecutionSpec`; the Context Assembler consumes it. This
prevents routing, capability selection, and context loading from being
reconstructed independently in several functions.

## Initialize and Refresh Flow

Initialize and explicit Refresh perform:

```text
read-only project discovery
  -> candidate capability detection
  -> authoritative fact and source extraction
  -> profile preview with evidence and limitations
  -> one user confirmation
  -> atomic project-manifest and profile write
```

Discovery reuses established project structure and reads only likely authority
sources. It does not run semantic Rule Doctor analysis. Ambiguous facts,
conflicting authorities, an unavailable source, or a target outside the project
root prevents the write.

The confirmed write updates the new project Manifest and capability profiles
as one governed operation. A partial filesystem failure returns reconciliation
instructions and does not claim successful configuration.

## Work Selection and Context Assembly

### Capability activation

The Capability Matcher applies this order:

```text
explicit requested capability
  -> affected files and components
  -> confirmed profile selectors
  -> bounded file-pattern inference
```

An explicit request may select additional relevant context, but it cannot
suppress project rules, risk, Gates, or required evidence.

### Authority precedence

Content precedence is:

```text
authoritative project sources
  > provenanced project profile facts
  > project-neutral Module guidance
```

Two authoritative project sources are not silently ordered unless the project
Manifest declares authority or priority. Evidence of a material conflict
returns `decision-required`.

### Projection order

The Context Assembler composes:

```text
Kernel invariants
  + Role capsule
  + current Stage overlay
  + matching policy modules
  + selected capability metadata
  + project capability facts
  + exact matching authoritative source ranges
  + bounded Work, Finding, evidence, and Handoff state
  = Runtime Projection
```

A Java implementation Work loads the project Java profile and relevant source
ranges. A Product framing action or unrelated frontend change does not pay the
Java context cost. A Java verification action receives Tester obligations and
only the relevant Java and testing evidence.

## Staleness and Reconciliation

When a selected fact, profile, or source fingerprint differs from its current
authority:

1. invalidate the current Runtime Projection and matching local cache;
2. reread only the source ranges needed for the current Work;
3. build an ephemeral capability overlay and new Projection;
4. continue when the evidence is available, authoritative, and unambiguous;
5. inform the user that explicit Refresh is recommended;
6. never write the shared profile from Work.

Missing evidence blocks a required capability. Conflicting or ambiguous
evidence returns `decision-required`. A stale profile never authorizes a
consequential action merely because an older cache exists.

The Loop and State Controller extracts the current deterministic reconciliation
semantics into one module. It continues to select actions such as `no-op`,
`patch`, `rebuild-projection`, `rebind`, `re-resolve-preset`, and `block`.
There is no graph framework in this scope.

## Error and Decision Semantics

- An unavailable optional capability returns a disclosed limitation.
- A missing required profile, capability, or authoritative source returns
  `blocked`.
- Conflicting authorities or ambiguous capability selection returns
  `decision-required`.
- A stale but unambiguous authority permits only an ephemeral rebuild and an
  informational Refresh recommendation.
- An old contract version returns `migration-required`. A current-version
  profile that fails validation returns `refresh-required`. The Kernel does
  not fall back to unconstrained execution.
- A source or profile path that escapes the project root is rejected.
- An oversized context reports omitted inputs and blocks instead of silently
  truncating required context.
- A failed confirmed write reports the exact partial state and reconciliation
  action.
- Loading a capability is not evidence that implementation, testing, Review,
  acceptance, or completion occurred.

## Declarative Security Boundary

Capability Profiles cannot contain executable hooks, commands to run
automatically, credentials, inline code, or runtime package dependencies.
Profiles may describe candidate verification commands with provenance, but
executing a command remains a separate Host action subject to normal scope,
risk, authorization, and Gate evaluation.

Module content cannot add Role authority or weaken Kernel invariants. The Host
adapter supplies available tools and capabilities; a profile cannot assert
that a tool, runtime, approval, or independent context exists.

## Rule Doctor Integration

Rule Doctor remains explicitly user-invoked. Its deterministic structural
checks gain capability-profile findings for:

- missing or stale sources and fingerprints;
- invalid, overbroad, contradictory, or never-matching selectors;
- duplicate capability IDs or overlapping duplicate profiles;
- facts that conflict with current authoritative configuration;
- references to missing Module Definitions or project sources;
- copied rule prose that appears to create a second source of truth;
- profiles that require more context than their declared budget permits.

Semantic inspection remains bounded by the existing explicit scan mode and
source budget. Existing ignore behavior suppresses only the same Finding
fingerprint against unchanged evidence.

Work does not invoke Rule Doctor automatically.

## Deliberate Contract Break and Migration

This architecture does not preserve backward compatibility with the current
project Manifest or internal L5/Kernel machine schemas.

- Replace the current project Manifest with `schema_version: 2`, which
  registers capability profile locators directly.
- Remove the unused legacy `extensions` abstraction instead of turning it into
  a plugin loader.
- Replace fixed-catalog loading contracts with Module Catalog contracts rather
  than adding a dual-read compatibility Provider.
- Replace the current L5 and Kernel machine schemas with `schema_version: 2`
  and update their examples without a legacy execution path. Capability
  Profile and ExecutionSpec are new contracts and begin at `schema_version: 1`.
- A project using the old Manifest receives `migration-required` and cannot
  execute under the new Kernel until the user runs Initialize again.
- Reinitialization discovers existing authoritative sources, previews the new
  Manifest and capability profiles, and writes them only after confirmation.
- No automatic in-place migration, legacy fallback, or ignored compatibility
  warning is provided.

The public names Initialize, Work, and Complete remain stable because they are
the product model, not a promise to accept old machine payloads.

## Testing Strategy

Implementation follows test-driven development. Tests cover:

1. Module Catalog validation, stable IDs, module kinds, and prohibited
   authority escalation.
2. The new Manifest, Capability Profile, ExecutionSpec, and Runtime Projection
   schemas.
3. Explicit rejection of old Manifest and old internal machine contract
   versions with `migration-required`.
4. Initialize discovery, preview, confirmation, atomic writes, and root
   containment.
5. Local Java fixture projects for Maven and Gradle fact extraction; these
   tests do not establish production Java rules.
6. Precise capability activation for Role, Stage, action, component, and file
   selectors, including negative non-Java cases.
7. Project authority precedence over project-neutral module guidance.
8. Missing, conflicting, invalid, disabled, and stale profiles and sources.
9. Ephemeral stale-profile rebuilding without shared-state mutation.
10. Context budgets, exact source-range selection, cache invalidation, and
    required-context overflow.
11. Explicit Rule Doctor capability-profile findings and unchanged-evidence
    suppression.
12. Public Initialize, Work, and Complete behavior and completion-claim
    boundaries.
13. Full `node --test` execution and `git diff --check` with no runtime package
    installation.

Backward-compatibility regression tests are intentionally removed or replaced
by rejection and reinitialization tests.

## Delivery Slices

### Slice 1: Modular Kernel contracts

- Extract Module Catalog and validated Module Definitions.
- Introduce ExecutionSpec.
- Route current orchestration through the new module boundaries.
- Extract deterministic Loop and State Controller behavior.

### Slice 2: Project Capability Profiles

- Introduce the new Manifest and Capability Profile schemas.
- Add profile registry, validation, path containment, and atomic persistence.
- Add Initialize and Refresh preview/confirmation behavior.
- Reject old machine contracts with an explicit reinitialization route.

### Slice 3: Matching and context assembly

- Add Capability Matcher selectors and precedence.
- Compose Project Capability facts and authoritative source ranges.
- Add revision tracking, cache invalidation, and ephemeral stale rebuilds.

### Slice 4: Local proof and health diagnostics

- Add local Maven and Gradle fixture profiles to prove the pipeline.
- Add negative context-loading and budget tests.
- Add explicit Rule Doctor profile checks.
- Update operator and project-initialization documentation.

Each slice must leave the new contract internally consistent and pass its
relevant tests. The implementation plan may refine file boundaries, but it may
not reintroduce a marketplace, generic Java authority, automatic writes, or
legacy compatibility.

## Acceptance Criteria

1. ZipZap ships as one modular package with no plugin marketplace or runtime
   dependency installer.
2. The Kernel selects validated Role, policy, capability, and context modules
   through a Module Catalog rather than hard-coded file paths.
3. Project Capability Profiles are Git-shareable, declarative, revisioned, and
   provenanced.
4. Initialize or Refresh writes profiles only after one explicit preview and
   confirmation.
5. Work automatically selects confirmed profiles without an ordinary prompt.
6. A relevant project Work loads only its matching capability facts and exact
   authoritative source ranges.
7. An unrelated Work does not pay the capability context cost.
8. Changed source evidence invalidates stale projections; Work may rebuild
   ephemerally but never writes the shared profile.
9. Conflicting or missing authoritative evidence pauses rather than silently
   falling back to generic guidance.
10. No capability profile copies substantive project rules or executes code.
11. Java is demonstrated only through local fixtures; production Java behavior
    is derived from the concrete project's evidence.
12. Rule Doctor reports capability-profile smells only when explicitly
    invoked.
13. Old Manifest and machine contract versions are rejected with an explicit
    reinitialization requirement; no compatibility path remains.
14. Public Initialize, Work, and Complete semantics and truthful claim
    boundaries remain intact.
15. The full test suite and whitespace validation pass without installing
    runtime packages.

## Production Boundary

This design establishes local contracts and expected behavior. It does not
claim implementation, tests, independent Review, user acceptance, production
readiness, or successful migration. Those claims require the implementation
plan, code evidence, verification, and applicable ZipZap gates.
