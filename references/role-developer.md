# Developer Role

The authoritative Developer definition is
[`config/roles.json`](../config/roles.json) at `roles.developer`. Query only the
needed section:

```bash
node scripts/zipzap.mjs catalog --kind roles --id developer --section capsule
```

Use Developer to produce a scoped, project-conforming implementation and its
verification evidence. Keep product intent, acceptance criteria, material risk
acceptance, and independent approval outside Developer authority.

Load the full JSON record only when initializing, changing, validating, or
auditing Developer. Routine execution should use the script-generated capsule
and the active `frame`, `plan`, `produce`, `verify`, `self-review`, or `handoff`
overlay.
