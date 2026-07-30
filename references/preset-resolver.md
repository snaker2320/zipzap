# Preset Resolver

The resolver compares required assurance with
[`config/teams.json`](../config/teams.json), using gate and risk mappings from
[`config/runtime-policy.json`](../config/runtime-policy.json).

Use this diagnostic view only when auditing L4:

```bash
node scripts/zipzap.mjs resolve --input kernel-request.json
```

Resolution records distinguish:

- `requested`: explicit user selection, if any;
- `effective`: topology authorized for binding;
- `recommended`: stronger or feasible topology awaiting a decision;
- `status`: `selected`, `decision-required`, `capacity-gap`, or `blocked`.

Honor a sufficient explicit selection. Without one, choose the least costly
registered preset satisfying assurance. If an explicit preset is insufficient,
leave `effective` null and recommend a valid topology; do not create an
executable binding. Keep logical topology separate from host concurrency.
