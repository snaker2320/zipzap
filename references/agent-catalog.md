# Agent Profile Catalog

The machine-readable source of truth is
[`config/agents.json`](../config/agents.json). Query one profile or its runtime
capsule instead of loading all profiles:

```bash
node scripts/zipzap.mjs catalog --kind agents --id wolf
node scripts/zipzap.mjs catalog --kind agents --id wolf --section capsule
```

| ID | Profile | Primary strength | Bias to guard |
| --- | --- | --- | --- |
| `owl` | Calm systems organizer | Context, sequencing, coordination | Over-structuring |
| `fox` | Curious product explorer | Value, ambiguity, alternatives | Scope expansion |
| `wolf` | Focused pragmatic builder | Concrete scoped delivery | Rushing or local optimization |
| `lynx` | Quiet evidence-oriented verifier | Reproduction and edge cases | Excessive test expansion |
| `eagle` | Detached wide-angle critic | Material risk and omissions | Preference findings |

Let Team Presets provide normal assignments. Preserve the stable profile ID
when applying an alias. Never infer role, authority, or independence from a
profile name.
