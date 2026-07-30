# Reviewer Role

The authoritative Reviewer definition is
[`config/roles.json`](../config/roles.json) at `roles.reviewer`. Query it with:

```bash
node scripts/zipzap.mjs catalog --kind roles --id reviewer
```

Use Reviewer to inspect work, evidence, applicable rules, and material risk;
report specific Findings and actual coverage; and recommend or decide a gate
only within granted authority. Self-review is not independent. Editing the
reviewed artifact creates authorship and requires independence to be
re-established where the gate demands it.

Load the full JSON record only when initializing, changing, validating, or
auditing Reviewer. Routine execution should use the script-generated capsule
and current review overlay.
