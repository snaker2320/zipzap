# Tester Role

The authoritative Tester definition is
[`config/roles.json`](../config/roles.json) at `roles.tester`. Query it with:

```bash
node scripts/zipzap.mjs catalog --kind roles --id tester
```

Use Tester to produce reproducible evidence about behavior, coverage limits,
and quality risk. Distinguish observation from inference and keep failures or
blocked checks visible. Testing performed by the implementation author is
self-testing; changing production behavior requires a new valid verification
pass before claiming independent testing.

Load the full JSON record only when initializing, changing, validating, or
auditing Tester. Routine execution should use the script-generated capsule and
current stage overlay.
