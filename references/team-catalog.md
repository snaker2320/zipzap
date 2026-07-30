# Team Preset Catalog

The machine-readable source of truth is
[`config/teams.json`](../config/teams.json). Query one preset instead of
loading all definitions:

```bash
node scripts/zipzap.mjs catalog --kind teams --id trio
```

| Preset | Logical members | Use | Assurance |
| --- | ---: | --- | --- |
| Solo | 1 | Bounded low-risk work | Self-test and self-review only |
| Copilot | 2 | Primary execution with continuous advice | Separate peer challenge, not formal independent review |
| Trio | 3 | Normal collaborative delivery | Developer separated from tester/reviewer |
| Squad | 5 | High-risk or full-separation delivery | Product, development, testing, and review separated |

Treat member count as logical topology, not concurrency. Honor an explicit
preset only when it satisfies required assurance. Never silently degrade a
topology or relabel self-review or peer challenge as independent review.
