# Runtime Composition

L4 exposes one machine interface:

```text
evaluate(Kernel Request) -> Kernel Response
```

The authoritative contracts are
[`schemas/runtime-input.schema.json`](../schemas/runtime-input.schema.json) and
[`schemas/runtime-output.schema.json`](../schemas/runtime-output.schema.json).

```bash
node scripts/zipzap.mjs evaluate --input kernel-request.json
```

The Kernel Request contains resolved work facts, caller preferences, governance
requirements, host capability, optional continuation state, and an optional
runtime event. The Kernel Response contains only status, next action,
assurance, required decisions, continuation revisions, and an optional
diagnostic reference.

L4 internally runs Preset Resolver → Binding Planner → Context Router and uses
Projection Reconciler when state changes. Keep Preset Resolution, Team Binding,
Runtime Projection, Projection Manifest, and Reconciliation Result behind the
Kernel boundary.

`compose`, `resolve`, `bind`, `project`, and `reconcile` are diagnostic views
over the same Kernel Request. L5 must call only `evaluate`.

The optional script uses Node built-ins only. When it is unavailable, Codex may
apply the same JSON contracts and catalogs directly; the interface does not
change.
