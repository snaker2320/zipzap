# Rule Health and Document Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit rule-health diagnosis, version-bound ignore state, adaptive document routing, business-document guidance, and authorized source-registry maintenance without automatic scans or migrations.

**Architecture:** Keep the existing `scripts/zipzap.mjs` CLI and L5 boundary as the integration surface, while placing focused deterministic behavior in `scripts/lib/document-routing.mjs` and `scripts/lib/rule-health.mjs`. Extend the project manifest with optional routing and provenance metadata; keep semantic review as a bounded candidate-and-assessment protocol so the zero-dependency runner never pretends to perform model reasoning.

**Tech Stack:** Node.js ESM, built-in `node:test`, JSON Schema draft 2020-12, zero runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-19-rule-health-document-routing-design.md`

## Global Constraints

- Existing project files are never moved, rewritten, or deleted during initialization.
- Rule health runs only after an explicit user request.
- Project documents remain authoritative; ZipZap stores metadata and dispositions only.
- Existing manifests remain valid because every new manifest field is optional.
- Ambiguous document destinations pause before mutation.
- External PRDs are registered by locator and are not copied into the repository.
- No runtime package may be added.
- Implementation uses failing tests before production behavior.

---

### Task 1: Manifest provenance and document route resolution

**Files:**
- Create: `scripts/lib/document-routing.mjs`
- Create: `schemas/document-route-input.schema.json`
- Create: `schemas/document-route-output.schema.json`
- Create: `examples/zipzap/document-route.json`
- Create: `tests/document-routing.test.mjs`
- Modify: `schemas/project-manifest.schema.json`
- Modify: `scripts/zipzap.mjs`
- Modify: `tests/source-resolution.test.mjs`

**Interfaces:**
- Produces: `inferDocumentKind(locator) -> string`.
- Produces: `defaultDocumentRoutes() -> Route[]`.
- Produces: `resolveDocumentRoute(input) -> {schema_version, status, route, candidates, decisions_required, registry_change}`.
- Extends project sources with optional `document_kind`, `status`, and `relations`.
- Extends the manifest with optional `document_routing`.

- [ ] **Step 1: Write failing manifest compatibility tests**

Add tests proving an old manifest remains valid and this new source is accepted:

```js
{
  id: "business-close-position",
  locator: "docs/business/close-position.md",
  topics: ["domain-and-business"],
  document_kind: "business-capability",
  status: "active",
  relations: {
    derived_from: ["external-prd-123"],
    references: [],
    supersedes: []
  }
}
```

Also test a `document_routing.routes` entry for `development-design` targeting
`docs/design/active`.

- [ ] **Step 2: Run the manifest tests and verify RED**

Run: `node --test tests/source-resolution.test.mjs`

Expected: FAIL because `validateProjectManifest` rejects `document_kind`,
`status`, `relations`, and `document_routing` as unknown fields.

- [ ] **Step 3: Extend the schema and runtime manifest validation**

Add exact enums from the spec, validate relation IDs as project IDs, require
unique route IDs, require non-empty `document_kinds`, reject absolute or
project-escaping route targets, and preserve existing source objects unchanged
when optional fields are absent.

- [ ] **Step 4: Run the manifest tests and verify GREEN**

Run: `node --test tests/source-resolution.test.mjs`

Expected: PASS.

- [ ] **Step 5: Write failing route precedence tests**

Cover these real behaviors in `tests/document-routing.test.mjs`:

```js
assert.equal(resolveDocumentRoute(explicitUserTarget).route.target,
  "custom/design");
assert.equal(resolveDocumentRoute(projectRoute).route.target,
  "specs/active");
assert.equal(resolveDocumentRoute(existingConvention).route.target,
  "docs/rfcs");
assert.equal(resolveDocumentRoute(newProjectDefault).route.target,
  "docs/design/active");
assert.equal(resolveDocumentRoute(ambiguous).status, "decision-required");
assert.throws(() => resolveDocumentRoute(escape), /escapes project root/);
```

Also assert that a missing directory appears in `registry_change.directories`
but is not created by the resolver.

- [ ] **Step 6: Run route tests and verify RED**

Run: `node --test tests/document-routing.test.mjs`

Expected: FAIL because the module and resolver do not exist.

- [ ] **Step 7: Implement the minimal route module and schemas**

Implement stable route sorting by precedence, then priority, then route ID.
Return one unique route as `ready`; return all tied candidates and one
destination decision as `decision-required`. Treat a user target as a one-time
exception and set `registry_change.update_default` to `false`.

- [ ] **Step 8: Integrate `document-route` into catalogs and CLI**

Load both schemas in `loadCatalogs`, re-export `resolveDocumentRoute`, add CLI
metadata and dispatch, and add a copyable example using a
`development-design` destination.

- [ ] **Step 9: Run focused and CLI tests**

Run: `node --test tests/document-routing.test.mjs tests/source-resolution.test.mjs tests/cli-ux.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit Task 1**

```bash
git add scripts/lib/document-routing.mjs scripts/zipzap.mjs schemas/project-manifest.schema.json schemas/document-route-input.schema.json schemas/document-route-output.schema.json examples/zipzap/document-route.json tests/document-routing.test.mjs tests/source-resolution.test.mjs tests/cli-ux.test.mjs
git commit -m "feat: resolve adaptive document routes"
```

### Task 2: Deterministic Rule Doctor and version-bound ignore state

**Files:**
- Create: `scripts/lib/rule-health.mjs`
- Create: `schemas/rule-health-input.schema.json`
- Create: `schemas/rule-health-output.schema.json`
- Create: `schemas/rule-health-ignore.schema.json`
- Create: `examples/zipzap/rule-health.json`
- Create: `tests/rule-health.test.mjs`
- Modify: `scripts/zipzap.mjs`
- Modify: `tests/cli-ux.test.mjs`

**Interfaces:**
- Produces: `diagnoseRuleHealth(input) -> RuleHealthResult`.
- Produces: `applyRuleHealthDisposition(input) -> DispositionResult`.
- Produces: `listIgnoredRuleFindings(input) -> IgnoreRecord[]`.
- Uses `.zipzap/rule-health/ignores/<fingerprint>.json` for shared ignores.

- [ ] **Step 1: Write failing deterministic Finding tests**

Create temporary projects and assert Findings for unavailable sources,
duplicate locators, missing owner/authority, invalid selector values, missing
role-topic coverage, route mismatch, overly broad instruction candidates, and
unrelated topic concentration. Assert initialization itself does not call the
doctor.

- [ ] **Step 2: Run Rule Doctor tests and verify RED**

Run: `node --test tests/rule-health.test.mjs`

Expected: FAIL because `diagnoseRuleHealth` does not exist.

- [ ] **Step 3: Implement deterministic diagnosis and stable fingerprints**

Fingerprint the canonical JSON of:

```js
{
  category,
  source_ids: [...sourceIds].sort(),
  evidence_ids: [...evidenceIds].sort(),
  source_versions: sortedVersionEntries
}
```

Use SHA-256 and exclude presentation text. Emit exact source locator and
version evidence. Treat missing metadata and broad scope as advisory; invalid
configuration remains an error or high-confidence structural Finding.

- [ ] **Step 4: Run deterministic tests and verify GREEN**

Run: `node --test tests/rule-health.test.mjs`

Expected: deterministic tests PASS.

- [ ] **Step 5: Write failing ignore, silence, and restore tests**

Verify:

1. ignoring writes exactly one record under `.zipzap/rule-health/ignores/`;
2. the next diagnosis omits the Finding and increments `ignored_count`;
3. unchanged evidence remains silent;
4. a source-version change yields a different fingerprint and visible Finding;
5. `include_ignored` returns the suppressed Finding;
6. restore removes the matching ignore record only after explicit operation.

- [ ] **Step 6: Run disposition tests and verify RED**

Run: `node --test --test-name-pattern="ignore|restore|version" tests/rule-health.test.mjs`

Expected: FAIL because disposition persistence is absent.

- [ ] **Step 7: Implement contained atomic ignore writes**

Validate the project root and fingerprint, create the ignore directory lazily,
write `<fingerprint>.json.tmp`, and atomically rename it. Store actor,
timestamp, optional reason, source IDs and versions, and ZipZap version. Restore
targets the exact resolved file and never accepts a path from the caller.

- [ ] **Step 8: Add rule-health schemas, example, catalogs, and CLI**

Support operations `diagnose`, `ignore`, `restore`, and `list-ignored` in one
discriminated input schema. Default depth to `quick`; default diagnosis to
read-only and `include_ignored` to false.

- [ ] **Step 9: Run focused and CLI tests**

Run: `node --test tests/rule-health.test.mjs tests/cli-ux.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit Task 2**

```bash
git add scripts/lib/rule-health.mjs scripts/zipzap.mjs schemas/rule-health-input.schema.json schemas/rule-health-output.schema.json schemas/rule-health-ignore.schema.json examples/zipzap/rule-health.json tests/rule-health.test.mjs tests/cli-ux.test.mjs
git commit -m "feat: diagnose and disposition rule health"
```

### Task 3: Bounded semantic candidate protocol

**Files:**
- Modify: `scripts/lib/rule-health.mjs`
- Modify: `schemas/rule-health-input.schema.json`
- Modify: `schemas/rule-health-output.schema.json`
- Modify: `examples/zipzap/rule-health.json`
- Modify: `tests/rule-health.test.mjs`
- Modify: `references/context-router.md`

**Interfaces:**
- Extends `diagnoseRuleHealth` with `depth: standard | deep`.
- Produces `semantic_review_request` with candidate categories, source refs,
  exact budget, and prohibited claims.
- Consumes optional `semantic_assessment.findings` and validates every cited
  source and evidence identity before merging.

- [ ] **Step 1: Write failing standard/deep candidate tests**

Assert `standard` limits candidates to 8 source files and `deep` to the
explicit caller budget up to 100. Verify candidates include large
instructions, unrelated-topic concentration, duplicate normalized headings,
designs with excessive references, whole-document references, and archived
design authority. Verify `quick` emits no semantic request.

- [ ] **Step 2: Run candidate tests and verify RED**

Run: `node --test --test-name-pattern="semantic|standard|deep|candidate" tests/rule-health.test.mjs`

Expected: FAIL because no semantic protocol exists.

- [ ] **Step 3: Implement candidate selection and disclosed budgets**

Sort candidates by deterministic severity, source priority, and source ID.
Return selected and omitted counts. The request tells a Reviewer to check only
the registered categories, cite evidence, and make advisory claims.

- [ ] **Step 4: Write failing semantic assessment validation tests**

Reject unknown source IDs, uncited Findings, unsupported categories, invalid
severity/confidence, and assessments exceeding the declared candidate set.
Accept a valid semantic duplicate and assign the same stable fingerprint logic
used by structural Findings.

- [ ] **Step 5: Run assessment tests and verify RED**

Run: `node --test --test-name-pattern="assessment" tests/rule-health.test.mjs`

Expected: FAIL because assessment validation is absent.

- [ ] **Step 6: Implement assessment validation and merge**

Keep the runner deterministic: it prepares candidates and validates supplied
Reviewer output; it never claims to perform semantic reasoning. Apply ignore
filtering only after semantic Findings receive stable fingerprints.

- [ ] **Step 7: Document Context Router behavior and run tests**

Run: `node --test tests/rule-health.test.mjs tests/source-resolution.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add scripts/lib/rule-health.mjs schemas/rule-health-input.schema.json schemas/rule-health-output.schema.json examples/zipzap/rule-health.json tests/rule-health.test.mjs references/context-router.md
git commit -m "feat: bound semantic rule review"
```

### Task 4: Authorized governed-document maintenance and business guidance

**Files:**
- Create: `schemas/document-maintenance-input.schema.json`
- Create: `schemas/document-maintenance-output.schema.json`
- Create: `tests/document-maintenance.test.mjs`
- Create: `references/business-documentation.md`
- Modify: `scripts/lib/document-routing.mjs`
- Modify: `scripts/zipzap.mjs`
- Modify: `references/project-initialization.md`
- Modify: `SKILL.md`
- Modify: `README.md`

**Interfaces:**
- Produces: `planDocumentMaintenance(input) -> MaintenancePreview`.
- Produces: `applyDocumentMaintenance(input) -> MaintenanceResult`.
- Supports `create`, `edit`, `move`, and `delete` for governed documents.

- [ ] **Step 1: Write failing maintenance preview tests**

Test that create previews one routed target, lazy directories, source metadata,
relations, version, and manifest revision. Test that ambiguous routes return
`decision-required`; move lists reference repairs; delete reports inbound
relations; no preview mutates files.

- [ ] **Step 2: Run preview tests and verify RED**

Run: `node --test tests/document-maintenance.test.mjs`

Expected: FAIL because maintenance functions do not exist.

- [ ] **Step 3: Implement maintenance planning**

Use the route resolver for create. Require current source version for edit,
move, and delete. Build a deterministic preview containing file mutations,
manifest before/after revisions, reference risks, and decisions. Reject paths
outside the project root.

- [ ] **Step 4: Write failing apply and partial-failure tests**

Verify authorized create registers the source, edit refreshes the hash, move
updates the locator and only declared in-scope references, delete removes the
source after explicit approval, and a registry failure returns `blocked` with
reconciliation instructions instead of a completion claim.

- [ ] **Step 5: Run apply tests and verify RED**

Run: `node --test --test-name-pattern="apply|create|edit|move|delete|failure" tests/document-maintenance.test.mjs`

Expected: FAIL because authorized apply is absent.

- [ ] **Step 6: Implement contained writes and atomic manifest update**

Create missing target directories only during apply. Write new or edited
content through a temporary file and rename. For move and delete, require the
caller-confirmed preview fingerprint so stale previews cannot mutate changed
sources. Write the manifest last through `.tmp` plus atomic rename. Return
`blocked` with exact reconciliation steps if document and registry state
diverge.

- [ ] **Step 7: Add schemas and expose internal adapters**

Load maintenance schemas in catalogs and expose functions for the Work adapter;
do not add a fourth public lifecycle action.

- [ ] **Step 8: Add concise business-document guidance**

Document vertical business capability files, the single active development
design entry point, the PRD-to-business-delta confirmation flow, exact-heading
references, archive rules, and token-budget guidance. Route `SKILL.md` to the
reference only when creating or maintaining business/design documentation.

- [ ] **Step 9: Run focused tests**

Run: `node --test tests/document-maintenance.test.mjs tests/document-routing.test.mjs tests/source-resolution.test.mjs`

Expected: PASS.

- [ ] **Step 10: Commit Task 4**

```bash
git add scripts/lib/document-routing.mjs scripts/zipzap.mjs schemas/document-maintenance-input.schema.json schemas/document-maintenance-output.schema.json tests/document-maintenance.test.mjs references/business-documentation.md references/project-initialization.md SKILL.md README.md
git commit -m "feat: maintain governed project documents"
```

### Task 5: Full conformance, release inventory, and documentation verification

**Files:**
- Modify: `tests/zipzap.test.mjs`
- Modify: `tests/conformance.test.mjs`
- Modify: `tests/lifecycle.test.mjs` only if release inventory assertions need
  new schema counts or required-file expectations.
- Modify: `README.md`

**Interfaces:**
- Verifies existing Initialize/Work/Complete and source-resolution contracts.
- Documents explicit commands without exposing new lifecycle concepts.

- [ ] **Step 1: Add failing catalog and conformance assertions**

Assert all new schemas load, old manifest required fields remain unchanged,
initialization does not invoke Rule Doctor, diagnostic writes require explicit
operations, and route ambiguity projects an active decision gate.

- [ ] **Step 2: Run conformance tests and verify RED**

Run: `node --test tests/zipzap.test.mjs tests/conformance.test.mjs tests/lifecycle.test.mjs`

Expected: FAIL on missing catalog or conformance integration assertions.

- [ ] **Step 3: Complete catalog, help, and README integration**

Ensure CLI help names explicit cost and read/write behavior, examples validate,
and README separates source discovery, Rule Doctor, routing, and authorized
maintenance.

- [ ] **Step 4: Run the entire test suite**

Run: `node --test tests/*.test.mjs`

Expected: all tests PASS with zero failures.

- [ ] **Step 5: Run release and whitespace verification**

Run: `node scripts/zipzap.mjs validate --compact`

Expected: JSON reports `"valid":true`.

Run: `git diff --check`

Expected: no output and exit code 0.

- [ ] **Step 6: Commit Task 5**

```bash
git add tests/zipzap.test.mjs tests/conformance.test.mjs tests/lifecycle.test.mjs README.md scripts/zipzap.mjs
git commit -m "test: verify rule health workflow"
```

## Plan Self-Review

- Every acceptance criterion in the spec is covered by Tasks 1–5.
- Manifest, route, Rule Doctor, semantic protocol, disposition, maintenance,
  documentation, CLI, conformance, and regression behavior have named tests.
- Public function names and result types are consistent across tasks.
- No step requires a third-party dependency, automatic scan, automatic
  migration, copied PRD, or unapproved semantic rewrite.
