# Binding Planner

The Binding Planner instantiates an effective Team Preset as revisioned logical
members. Use this diagnostic view only when auditing L4:

```bash
node scripts/zipzap.mjs bind --input kernel-request.json
```

The result contains stable slots, unique context IDs, profile IDs, display
names, Role and Control Function assignments, artifact access, actual
assurance, personalization, provenance, and schedule waves.

Do not bind when `preset_resolution.effective` is null. Preserve every logical
context even when host concurrency is lower than member count; split waves
instead of collapsing roles or independence. Personalization may change
presentation only. A member action selects either one accountable Role or one
Control Function as its primary semantic authority.
