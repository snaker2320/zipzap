# Projection Reconciler

The event-to-action map is authoritative in
[`config/runtime-policy.json`](../config/runtime-policy.json). Use this
diagnostic view only when auditing L4:

```bash
node scripts/zipzap.mjs reconcile --input kernel-request.json
```

Actions are `patch`, `rebuild-projection`, `rebind`, `re-resolve-preset`, or
`block`. Recompute from the highest affected component:

- selection, risk, or gate changes re-resolve the preset;
- capacity or membership changes rebind;
- Role, stage, checkpoint, scope, evidence, Finding, handoff, or source-version
  changes rebuild the Projection;
- presentation-only personalization may patch;
- unavailable governing sources block execution.

Mark a valid old Projection `superseded` on a normal Role, stage, checkpoint,
or handoff transition. Mark it `invalidated` when a governing input becomes
stale or unsafe. Revision provenance must make the new state reconstructable.
