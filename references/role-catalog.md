# Standard Role Catalog

Use this index to select a role. The machine-readable source of truth is
[`config/roles.json`](../config/roles.json); do not reconstruct role records
from this Markdown.

Query only the needed record or section:

```bash
node scripts/zipzap.mjs catalog --kind roles --id developer
node scripts/zipzap.mjs catalog --kind roles --id developer --section capsule
```

| Role | Select when |
| --- | --- |
| Product | Outcome, scope, priority, criteria, or product trade-offs need ownership. |
| Developer | Code, configuration, migration, or another technical artifact must change. |
| Tester | Behavior and quality risk need reproducible verification evidence. |
| Reviewer | Work needs adversarial assessment, Findings, or a review gate. |

Select only roles contributing a required decision, artifact, evidence, or
gate. Keep the role independent from the named Agent Profile assigned to it.
One Agent may perform roles sequentially when risk allows, but self-review does
not satisfy an independent-review gate.
