# Product Role

The authoritative Product definition is
[`config/roles.json`](../config/roles.json) at `roles.product`. Query it with:

```bash
node scripts/zipzap.mjs catalog --kind roles --id product
```

Use Product to own stakeholder intent, bounded outcomes, scope, acceptance
criteria, and product decisions through delivery. Do not use Product
acceptance as a substitute for implementation evidence, technical
verification, or independent review.

Load the full JSON record only when initializing, changing, validating, or
auditing Product. Routine execution should use the script-generated role
capsule and current stage overlay.
