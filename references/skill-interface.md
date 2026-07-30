# L5 Skill Interface

L5 is ZipZap's only stable public machine interface. Its authoritative
contracts are
[`schemas/l5-input.schema.json`](../schemas/l5-input.schema.json) and
[`schemas/l5-output.schema.json`](../schemas/l5-output.schema.json).

## Operations

- `initialize`: discover, configure, or refresh project collaboration sources.
- `execute`: begin ephemeral or persistent work.
- `resume`: continue from a durable context reference.
- `inspect`: query configuration, work, evidence, gates, or catalogs.

Expose one logical `invoke(request) -> response` entry point. Treat persistence
as an execution preference, not a separate operation.

The optional runner accepts
`schemas/l5-adapter-input.schema.json`, which wraps the public request with
host-owned context. Keep that wrapper internal; it does not expand caller
authority.

For `initialize`, require an explicit action:

- `discover`: inspect without writing;
- `configure`: create or update durable project registration;
- `refresh`: reconcile an existing registration with current sources.

Keep initialization persistence separate from work persistence. Use `session`
for ephemeral registration or `project` for a durable project manifest.
Keep `discover` read-only. Let `configure` write `.zipzap/project.json` and
initialize `.zipzap/tasks/` only when project persistence is requested. Let
`refresh` recheck availability and content hashes without copying source
content.

Treat guided onboarding as a presentation adapter for `initialize`, not a
fifth L5 operation. A page or conversation may collect preferences through
the onboarding state machine, then pass its confirmed `configuration` as
`initialization.preferences`. Direct callers may provide the same object
without running the guide.

Keep page rendering, stepwise questioning, and host user-state writes outside
the stable L5 interface. Keep preference validation, project-manifest storage,
and governance boundaries identical across presentations.

Use `source-resolve` after initialization to match Role, stage, action,
component, and risk selectors. Treat missing-source behavior as explicit
policy. Treat Host-preloaded instructions as already available and do not
duplicate them in the runtime context.

## Ownership Boundary

Let the caller supply intent, objective, scope, constraints, acceptance
criteria, collaboration preferences, and a continuation reference.

Let L5 derive risk signals, required gates, effective topology, current
participant, and the minimal execution view. Let the host adapter supply
available tools, concurrency, and Agent capabilities.

Do not accept caller assertions that approval, independence, risk acceptance,
or a required gate has already been obtained without authoritative evidence.

## Risk Normalization

Before L4 evaluation, assess all signals in
`config/risk-taxonomy.json`. Let AI return only present and unknown signal IDs
with evidence references; require the evaluated-signal list to cover the whole
taxonomy. Absence is the remainder after complete evaluation, not omission.

Validate evidence references and aggregate registered effects
deterministically into risk flags, gates, evidence requirements, approvals,
and persistence requirements. Do not allow the assessment to emit a team,
risk level, assurance claim, or policy effect directly.

Return `decision-required` without a Kernel Request while any material signal
is unknown. Otherwise construct the Kernel Request and let L4 select the
lightest sufficient topology. Preserve an explicit team selection only as
`preferences.team_preset`; L4 must reject it when insufficient.

The machine contracts are:

- `schemas/risk-assessment-input.schema.json`;
- `schemas/risk-assessment-output.schema.json`;
- `schemas/risk-normalization-input.schema.json`;
- `schemas/risk-normalization-output.schema.json`.

## Result Semantics

Return malformed requests with `ok: false` and a structured error. Return
workflow conditions with `ok: true` and one of:

- `ready`: the next participant action is executable;
- `decision-required`: authorized input is required;
- `blocked`: a capability, source, authority, or required condition is absent;
- `completed`: required outcomes, evidence, and gates are satisfied.

Return only the next execution view by default. Keep Preset Resolution,
Binding, Projection revisions, reconciliation actions, implementation adapter,
and runtime paths behind an optional diagnostic reference.

## Adapter Boundary

For `execute`, enrich caller-owned facts with host and governance context, then
call the single L4 `evaluate` interface. For `resume`, resolve continuation
state and call the same interface. Keep `initialize` and `inspect` inside L5;
they do not require runtime composition.

Treat `schemas/runtime-input.schema.json` and
`schemas/runtime-output.schema.json` as the complete L5–L4 contract. Do not
require Markdown to translate between layers. Permit a Codex-native
implementation, optional script accelerator, or direct AI-to-JSON execution,
but require identical Kernel Request and Response shapes.
