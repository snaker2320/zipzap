# Control Functions

The authoritative definitions are
[`config/control-functions.json`](../config/control-functions.json). Query one
without loading the whole catalog:

```bash
node scripts/zipzap.mjs catalog --kind control-functions --id advisor
```

`coordinator` keeps composition, sequencing, handoffs, dependencies, revisions,
and gates coherent. It does not absorb accountable Role decisions, approve
gates, or accept risk.

`advisor` provides a distinct second-context challenge at material checkpoints.
It may suggest alternatives, tests, evidence, or escalation, but it does not
gain authorship, approval, decision authority, or formal independent-review
status from advising.

Select a Role for accountable work or a Control Function for control-plane
work. Do not combine their authority implicitly in one Projection.
