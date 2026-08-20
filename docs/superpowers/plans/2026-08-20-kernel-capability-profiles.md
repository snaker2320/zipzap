# Kernel Capability Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor ZipZap into a single-package modular Kernel that derives, persists, matches, and precisely projects project-owned capability profiles.

**Architecture:** Keep the existing `risk_normalization -> evaluateKernel -> compose` execution path and insert explicit Module Catalog, ExecutionSpec, Capability Profile, Capability Matcher, and Loop Controller contracts. Initialize writes Manifest v2 and confirmed profiles; Work hydrates project context from the Manifest, selects matching profiles, and assembles only their facts and authoritative source references.

**Tech Stack:** Node.js ESM, built-in `node:fs`, `node:path`, `node:crypto`, JSON Schema Draft 2020-12, `node:test`, no runtime packages.

**Spec:** `docs/superpowers/specs/2026-08-20-kernel-capability-profiles-design.md`

## Global Constraints

- Expose only Initialize, Work, and Complete.
- Keep Product, Developer, Tester, and Reviewer authority semantics fixed.
- Ship one ZipZap package; do not add a plugin marketplace, installer, external module loader, or dependency solver.
- Store project profiles under `.zipzap/capabilities/`; store only facts, selectors, provenance, and fingerprints, never copied rule prose.
- Require preview and confirmation before shared writes; Work may rebuild stale context ephemerally but never write profiles.
- Keep Rule Doctor explicitly invoked.
- Use Manifest, L5, and Kernel machine contract version 2 without a legacy execution path.
- Use Java only as local fixture evidence; do not ship generic Java rules.
- Install no runtime packages.

---

### Task 1: Module Catalog and Loop Controller

**Files:**
- Create: `config/modules.json`
- Create: `schemas/module-catalog.schema.json`
- Create: `scripts/lib/module-catalog.mjs`
- Create: `scripts/lib/loop-controller.mjs`
- Modify: `scripts/zipzap.mjs:378-512`
- Modify: `scripts/zipzap.mjs:2271-2290`
- Test: `tests/module-catalog.test.mjs`
- Test: `tests/loop-controller.test.mjs`

**Interfaces:**
- Produces: `loadModuleCatalog(rootDir) -> { schema_version, modules, by_kind }`
- Produces: `validateModuleCatalog(catalog) -> catalog`
- Produces: `selectReconciliationAction(eventType, eventActions) -> action`
- Consumes: existing role definitions and runtime policy JSON through locators declared in `config/modules.json`.

- [ ] **Step 1: Write failing Module Catalog tests**

```js
import { loadModuleCatalog, validateModuleCatalog } from "../scripts/lib/module-catalog.mjs";

test("loads roles and runtime policy through declared module locators", () => {
  const catalog = loadModuleCatalog();
  assert.equal(catalog.modules["role:developer"].kind, "role");
  assert.equal(catalog.modules["role:developer"].value.purpose.length > 0, true);
  assert.equal(catalog.modules["policy:runtime"].kind, "policy");
});

test("rejects authority-bearing capability modules", () => {
  assert.throws(() => validateModuleCatalog({
    schema_version: 1,
    modules: {
      "capability:unsafe": { kind: "capability", value: { authority: { may: ["approve"] } } }
    }
  }), /capability.*authority/i);
});
```

- [ ] **Step 2: Run tests and verify missing modules fail**

Run: `node --test tests/module-catalog.test.mjs`

Expected: FAIL because `module-catalog.mjs` does not exist.

- [ ] **Step 3: Add the catalog schema, manifest, and loader**

Use `config/modules.json` entries shaped as:

```json
{
  "schema_version": 1,
  "modules": {
    "role:developer": {
      "kind": "role",
      "source": "config/roles.json",
      "pointer": ["roles", "developer"]
    },
    "policy:runtime": {
      "kind": "policy",
      "source": "config/runtime-policy.json",
      "pointer": []
    },
    "context-provider:project-sources": {
      "kind": "context-provider",
      "value": { "id": "project-sources", "mode": "registered-locators" }
    }
  }
}
```

Resolve sources inside the ZipZap root, walk the declared pointer, clone the
value, validate stable IDs and kinds, and reject authority fields on capability
or context-provider values.

- [ ] **Step 4: Route existing catalog loading through Module Catalog**

Change `loadCatalogs()` so `roles` and `runtimePolicy` are reconstructed from
the Module Catalog instead of hard-coded role and policy paths. Add
`moduleCatalog` to the returned catalogs and validate it in `validateCatalogs`.

- [ ] **Step 5: Write and implement Loop Controller tests**

```js
test("selects deterministic reconciliation actions", () => {
  assert.equal(selectReconciliationAction("role-transitioned", {
    "role-transitioned": "rebuild-projection"
  }), "rebuild-projection");
  assert.throws(() => selectReconciliationAction("unknown", {}), /unsupported event/i);
});
```

Replace the direct `runtimePolicy.event_actions[event.type]` access in
`compose()` with `selectReconciliationAction`.

- [ ] **Step 6: Run focused and catalog regression tests**

Run: `node --test tests/module-catalog.test.mjs tests/loop-controller.test.mjs tests/zipzap.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add config/modules.json schemas/module-catalog.schema.json scripts/lib/module-catalog.mjs scripts/lib/loop-controller.mjs scripts/zipzap.mjs tests/module-catalog.test.mjs tests/loop-controller.test.mjs
git commit -m "refactor(kernel): add module catalog and loop controller"
```

### Task 2: Capability Profile Contract, Loading, and Matching

**Files:**
- Create: `schemas/capability-profile.schema.json`
- Create: `scripts/lib/capability-profiles.mjs`
- Create: `tests/capability-profiles.test.mjs`
- Modify: `scripts/zipzap.mjs:398-510`

**Interfaces:**
- Produces: `validateCapabilityProfile(profile, options?) -> profile`
- Produces: `loadCapabilityProfiles(projectRoot, registrations) -> profile[]`
- Produces: `matchCapabilityProfiles(profiles, query) -> { selected, rejected }`
- Produces: `assessCapabilityProfile(profile, projectRoot, sourcesById) -> { status, changes }`

- [ ] **Step 1: Write failing validation and containment tests**

```js
test("accepts a provenanced project capability", () => {
  const profile = validateCapabilityProfile(javaProfile());
  assert.equal(profile.id, "java-development");
});

test("rejects copied prose, hooks, and escaping locators", () => {
  assert.throws(() => validateCapabilityProfile({
    ...javaProfile(),
    instructions: "Always use Java 17"
  }), /unknown capability profile field/i);
  assert.throws(() => loadCapabilityProfiles(root, [
    { id: "java-development", locator: "../java.json", enabled: true }
  ]), /escapes project root/i);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test tests/capability-profiles.test.mjs`

Expected: FAIL because the profile module does not exist.

- [ ] **Step 3: Implement the schema and validator**

The schema requires `schema_version`, `id`, `revision`, `status`, `facts`,
`selectors`, `source_refs`, and `profile_digest`. Fact values accept only JSON
scalars; facts require `source_id`, evidence, and `sha256:` digest. Selectors
support roles, stages, actions, components, and file patterns.

- [ ] **Step 4: Implement safe profile loading and digest verification**

Resolve registration locators under the project root, reject duplicate IDs,
disabled profiles, missing files, invalid JSON, schema mismatches, and profile
ID mismatches. Recompute the canonical digest excluding `profile_digest`.

- [ ] **Step 5: Implement deterministic profile matching**

```js
const result = matchCapabilityProfiles([profile], {
  explicit: [],
  role: "developer",
  stage: "produce",
  action: "implement",
  components: ["backend"],
  files: ["src/main/java/App.java"]
});
assert.deepEqual(result.selected.map((item) => item.id), ["java-development"]);
```

Require all non-empty scalar selector groups to match; file patterns and
components are any-match groups. Explicit capability IDs add a candidate but
do not bypass the profile's enabled state.

- [ ] **Step 6: Implement source-fingerprint staleness assessment**

Compare every fact digest to its registered source's current version. Return
`current`, `stale`, `missing-source`, or `invalid` without writing files.

- [ ] **Step 7: Load the schema in `loadCatalogs` and run focused tests**

Run: `node --test tests/capability-profiles.test.mjs tests/source-resolution.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add schemas/capability-profile.schema.json scripts/lib/capability-profiles.mjs scripts/zipzap.mjs tests/capability-profiles.test.mjs
git commit -m "feat(capability): validate and match project profiles"
```

### Task 3: Manifest v2 and Governed Profile Persistence

**Files:**
- Modify: `schemas/project-manifest.schema.json`
- Modify: `schemas/l5-input.schema.json`
- Modify: `schemas/l5-output.schema.json`
- Modify: `scripts/zipzap.mjs:1558-1805`
- Modify: `scripts/zipzap.mjs:4282-4610`
- Test: `tests/capability-initialization.test.mjs`
- Modify: `tests/source-resolution.test.mjs`
- Modify: `tests/first-run.test.mjs`

**Interfaces:**
- Produces: Manifest v2 field `capabilities: [{ id, locator, enabled }]`.
- Produces: Initialize preview fields `capability_profiles` and
  `capability_changes`.
- Consumes: `validateCapabilityProfile` and project source registrations.

- [ ] **Step 1: Write failing Manifest v2 and migration tests**

```js
test("rejects Manifest v1 with migration-required", () => {
  assert.throws(() => validateProjectManifest({
    schema_version: 1,
    project_id: "legacy",
    sources: []
  }), /migration-required/i);
});

test("registers confirmed capability profiles in Manifest v2", () => {
  const result = initializeProject(configureRequest(root));
  const stored = JSON.parse(readFileSync(join(root, ".zipzap/project.json")));
  assert.equal(stored.schema_version, 2);
  assert.deepEqual(stored.capabilities.map((item) => item.id), ["java-development"]);
});
```

- [ ] **Step 2: Run focused tests and verify version failures**

Run: `node --test tests/capability-initialization.test.mjs`

Expected: FAIL because Manifest v2 and profile writes are absent.

- [ ] **Step 3: Replace the project Manifest contract**

Set Manifest `schema_version` to 2, remove `extensions`, add required or empty
`capabilities`, and add a `$defs/capabilityRegistration` with `id`, `locator`,
and `enabled`. Export `validateProjectManifest` for focused tests. Return the
literal `migration-required` marker for version 1.

- [ ] **Step 4: Extend Initialize input and preview**

Accept optional `initialization.capability_profiles` in L5 input. Discover and
preview candidates but do not persist during `discover`. During `configure` or
`refresh`, validate requested/derived profiles before any write.

- [ ] **Step 5: Implement atomic profile and Manifest persistence**

Write validated profiles to temporary files under `.zipzap/capabilities/`,
then rename profiles and finally rename the Manifest. On failure, report exact
completed and pending targets with reconciliation instructions. Add cache
directories to `.zipzap/.gitignore`, not capability profiles.

- [ ] **Step 6: Update existing initialization fixtures to Manifest v2**

Mechanically update tests that represent current contracts to version 2 and
add `capabilities: []`. Keep a dedicated v1 rejection fixture; do not add a
dual-read branch.

- [ ] **Step 7: Run initialization and source tests**

Run: `node --test tests/capability-initialization.test.mjs tests/source-resolution.test.mjs tests/first-run.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 3**

```bash
git add schemas/project-manifest.schema.json schemas/l5-input.schema.json schemas/l5-output.schema.json scripts/zipzap.mjs tests/capability-initialization.test.mjs tests/source-resolution.test.mjs tests/first-run.test.mjs
git commit -m "feat(initialize): persist project capability profiles"
```

### Task 4: ExecutionSpec and Runtime Capability Projection

**Files:**
- Create: `schemas/execution-spec.schema.json`
- Create: `scripts/lib/execution-spec.mjs`
- Modify: `schemas/runtime-input.schema.json`
- Modify: `schemas/runtime-output.schema.json`
- Modify: `scripts/zipzap.mjs:2638-3125`
- Modify: `scripts/zipzap.mjs:5080-5310`
- Test: `tests/execution-spec.test.mjs`
- Modify: `tests/zipzap.test.mjs`
- Modify: `tests/risk-normalizer.test.mjs`

**Interfaces:**
- Produces: `buildExecutionSpec(input) -> ExecutionSpec`
- Produces: `hydrateProjectCapabilities(projectLocator) -> { manifest, profiles, assessments }`
- Adds: `runtime_projection.instructions.capability_profiles`.

- [ ] **Step 1: Write failing ExecutionSpec selection tests**

```js
test("builds a minimal Java execution spec from project evidence", () => {
  const spec = buildExecutionSpec({
    work: { objective: "change quote service", action: "implement", files: ["src/Quote.java"], components: ["backend"] },
    participant: { role: "developer", stage: "produce" },
    profiles: [javaProfile()],
    sources: sources()
  });
  assert.deepEqual(spec.capability_profile_ids, ["java-development"]);
  assert.deepEqual(spec.source_refs.map((item) => item.source_id), ["backend-standard", "maven-project"]);
});

test("does not load Java context for product framing", () => {
  const spec = buildExecutionSpec({ ...input(), participant: { role: "product", stage: "frame" } });
  assert.deepEqual(spec.capability_profile_ids, []);
});
```

- [ ] **Step 2: Run tests and verify missing contract failure**

Run: `node --test tests/execution-spec.test.mjs`

Expected: FAIL because `execution-spec.mjs` is absent.

- [ ] **Step 3: Implement the ExecutionSpec contract and builder**

Emit schema version 1, selected modules, selected profile IDs, facts, source
references, risk/Gate/evidence requirements, budget, and input revisions.
Deduplicate and sort IDs for deterministic digests.

- [ ] **Step 4: Hydrate project profiles for L5 execute/resume**

When the L5 request has `project.locator`, load Manifest v2 and profiles before
risk normalization. A Manifest v1 returns a structured `migration-required`
blocked response. Add current profiles to the Kernel governance input; do not
accept caller claims that replace disk evidence.

- [ ] **Step 5: Integrate ExecutionSpec before `compose`**

Build the spec in `evaluateKernelDetailed`, pass selected profile facts and
source references into runtime composition, and expose the spec only through
diagnostics. Add `capability_profiles` to the Runtime Projection instructions
and projection manifest.

- [ ] **Step 6: Implement stale ephemeral overlays**

For a stale selected profile, reread its registered sources, replace stale
facts only in the in-memory ExecutionSpec, invalidate the prior projection,
and include a `refresh-recommended` limitation. Missing or conflicting sources
return `blocked` or `decision-required`; never write the profile.

- [ ] **Step 7: Run execution and risk tests**

Run: `node --test tests/execution-spec.test.mjs tests/zipzap.test.mjs tests/risk-normalizer.test.mjs tests/l5-task.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add schemas/execution-spec.schema.json schemas/runtime-input.schema.json schemas/runtime-output.schema.json scripts/lib/execution-spec.mjs scripts/zipzap.mjs tests/execution-spec.test.mjs tests/zipzap.test.mjs tests/risk-normalizer.test.mjs tests/l5-task.test.mjs
git commit -m "feat(kernel): project capability execution specs"
```

### Task 5: Local Java Fixture Profiler

**Files:**
- Create: `scripts/lib/project-capability-profiler.mjs`
- Create: `tests/fixtures/capabilities/java-maven/pom.xml`
- Create: `tests/fixtures/capabilities/java-gradle/build.gradle`
- Create: `tests/project-capability-profiler.test.mjs`
- Modify: `scripts/zipzap.mjs:4282-4468`

**Interfaces:**
- Produces: `profileProjectCapabilities(projectRoot, sources) -> candidate[]`
- Candidates are preview-only until Initialize confirmation.

- [ ] **Step 1: Write failing local fixture tests**

```js
test("derives Java facts from a Maven fixture", () => {
  const [candidate] = profileProjectCapabilities(mavenFixture, sourcesFor(mavenFixture));
  assert.equal(candidate.id, "java-development");
  assert.deepEqual(facts(candidate), {
    "build-tool": "maven",
    "java-version": "17"
  });
  assert.equal(candidate.source_refs.every((item) => item.source_id), true);
});

test("does not invent a Java version when the project does not declare one", () => {
  assert.equal(facts(profileWithoutVersion)["java-version"], undefined);
});
```

- [ ] **Step 2: Run tests and verify profiler absence**

Run: `node --test tests/project-capability-profiler.test.mjs`

Expected: FAIL because the profiler does not exist.

- [ ] **Step 3: Implement bounded Maven and Gradle evidence extraction**

Use deterministic text extraction for declared Java version and build tool.
Record evidence locators and content digests. Do not infer versions from model
knowledge, install build tools, or emit coding instructions.

- [ ] **Step 4: Integrate candidates into Initialize preview**

Add derived candidates to discovery/configuration output. Configuration writes
only the exact confirmed profiles supplied after preview. Refresh compares
current candidates with registered profiles and proposes changes.

- [ ] **Step 5: Run profiler and initialization tests**

Run: `node --test tests/project-capability-profiler.test.mjs tests/capability-initialization.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add scripts/lib/project-capability-profiler.mjs tests/fixtures/capabilities tests/project-capability-profiler.test.mjs scripts/zipzap.mjs tests/capability-initialization.test.mjs
git commit -m "feat(capability): profile project Java evidence"
```

### Task 6: Explicit Capability Profile Rule Health

**Files:**
- Modify: `scripts/lib/rule-health.mjs`
- Modify: `schemas/rule-health-input.schema.json`
- Modify: `tests/rule-health.test.mjs`

**Interfaces:**
- Adds deterministic categories: `missing-capability-source`,
  `stale-capability-fact`, `invalid-capability-selector`,
  `never-matching-capability-selector`, `duplicate-capability-profile`,
  `overbroad-capability-selector`, `conflicting-capability-fact`,
  `missing-capability-module`, `capability-context-budget-exceeded`, and
  `copied-capability-rule`.

- [ ] **Step 1: Write failing capability smell tests**

```js
test("reports stale and overbroad capability profiles only on explicit diagnosis", () => {
  const result = diagnose(root, manifestV2(), {
    capability_profiles: [staleOverbroadProfile()]
  });
  assert.equal(result.findings.some((item) => item.category === "stale-capability-fact"), true);
  assert.equal(result.findings.some((item) => item.category === "overbroad-capability-selector"), true);
});

test("reports profile references and budgets that cannot produce valid context", () => {
  const result = diagnose(root, manifestV2(), {
    capability_profiles: [profileWithMissingModuleAndOversizedContext()]
  });
  assert.equal(result.findings.some((item) => item.category === "missing-capability-module"), true);
  assert.equal(result.findings.some((item) => item.category === "capability-context-budget-exceeded"), true);
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `node --test tests/rule-health.test.mjs`

Expected: FAIL because capability findings are absent.

- [ ] **Step 3: Add deterministic checks and stable fingerprints**

Use profile/source IDs, evidence IDs, and current source digests in Finding
identity. Reuse existing ignore persistence so changed evidence reopens a
finding. Detect selector shapes that can never match the current Role, Stage,
action, component, and file-pattern vocabularies; compare duplicate facts
against current authoritative source values; validate referenced Module and
project-source IDs; and compare the profile's required source expansion with
its declared context budget. Treat possible copied prose as an advisory
structural candidate, not an authoritative semantic conclusion.

- [ ] **Step 4: Keep diagnosis explicit**

Do not call `diagnoseRuleHealth` from Initialize, Work, profile loading, or
ExecutionSpec. Add a regression assertion that ordinary Work produces no Rule
Doctor output or filesystem state.

- [ ] **Step 5: Run Rule Doctor tests**

Run: `node --test tests/rule-health.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit Task 6**

```bash
git add scripts/lib/rule-health.mjs schemas/rule-health-input.schema.json tests/rule-health.test.mjs
git commit -m "feat(rule-health): diagnose capability profiles"
```

### Task 7: Machine Contract v2, Examples, and Documentation

**Files:**
- Modify: `schemas/l5-adapter-input.schema.json`
- Modify: `schemas/l5-input.schema.json`
- Modify: `schemas/l5-output.schema.json`
- Modify: `schemas/runtime-input.schema.json`
- Modify: `schemas/runtime-output.schema.json`
- Modify: `config/compatibility.json`
- Modify: `scripts/zipzap.mjs`
- Modify: `examples/zipzap/*.json`
- Modify: `README.md`
- Modify: `SKILL.md`
- Modify: `references/context-router.md`
- Modify: `references/project-initialization.md`
- Test: `tests/conformance.test.mjs`
- Test: `tests/cli-ux.test.mjs`

**Interfaces:**
- L5 adapter, L5 request/response, Kernel request/response, and runtime
  request/response use `schema_version: 2`.
- Capability Profile and ExecutionSpec remain new version 1 contracts.

- [ ] **Step 1: Write failing v1 rejection and v2 conformance tests**

```js
test("rejects old L5 input without a compatibility path", () => {
  const response = invokeL5({ schema_version: 1, operation: "inspect" });
  assert.equal(response.ok, false);
  assert.match(response.error.message, /schema_version must be 2/i);
});
```

- [ ] **Step 2: Run conformance tests and verify current v1 acceptance fails the expectation**

Run: `node --test tests/conformance.test.mjs tests/cli-ux.test.mjs`

Expected: FAIL because current contracts use version 1.

- [ ] **Step 3: Update machine schemas and runtime constants to v2**

Change only the L5/Kernel/runtime boundary versions named above. Do not change
unrelated record versions such as Task events, Rule Doctor records, lifecycle
requests, or Host capability reports unless their schema directly embeds a
changed contract.

- [ ] **Step 4: Update examples and test fixtures mechanically**

Replace current machine-boundary fixtures with version 2. Preserve explicit
v1 rejection fixtures. Remove `extensions` examples and add capability
registrations where a project Manifest is present.

- [ ] **Step 5: Update user and maintainer documentation**

Document single-package modularity, profile storage, explicit Initialize and
Refresh writes, automatic Work matching, stale ephemeral rebuilds, explicit
Rule Doctor checks, local-only Java fixtures, and the deliberate reinitialize
requirement.

- [ ] **Step 6: Run contract and CLI tests**

Run: `node --test tests/conformance.test.mjs tests/cli-ux.test.mjs tests/lifecycle.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit Task 7**

```bash
git add schemas config/compatibility.json scripts/zipzap.mjs examples/zipzap README.md SKILL.md references tests/conformance.test.mjs tests/cli-ux.test.mjs tests/lifecycle.test.mjs
git commit -m "feat(kernel): adopt capability-aware v2 contracts"
```

### Task 8: Full Verification and Completion Evidence

**Files:**
- Modify only files required by failures attributable to Tasks 1-7.

**Interfaces:**
- Produces a clean branch with complete verification evidence.

- [ ] **Step 1: Validate catalogs and schemas through the CLI**

Run: `node scripts/zipzap.mjs validate --compact`

Expected: JSON with zero catalog/schema errors.

- [ ] **Step 2: Run the complete test suite**

Run: `node --test`

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run whitespace and repository-state checks**

Run: `git diff --check`

Expected: no output and exit 0.

Run: `git status --short --branch`

Expected: only intentional implementation changes before the final commit, or
a clean tree after all task commits.

- [ ] **Step 4: Inspect the branch diff against its base**

Run: `git diff --stat codex/rule-health-document-routing...HEAD`

Expected: only Kernel, capability-profile, schema, tests, examples, and
documentation changes described by this plan.

- [ ] **Step 5: Record any residual limitation truthfully**

The completion report must state that Java evidence is fixture-only, project
profiles remain authoritative, no marketplace exists, Rule Doctor is explicit,
and no production readiness or user acceptance is implied by passing tests.
