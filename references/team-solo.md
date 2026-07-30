# Solo Team Preset

The authoritative Solo definition is
[`config/teams.json`](../config/teams.json) at `teams.solo`.

Solo uses one stable named context and explicit sequential role transitions.
It provides product framing, implementation, self-testing, and self-review; it
does not provide independent testing, independent review, or multi-context
challenge.

Query `node scripts/zipzap.mjs catalog --kind teams --id solo` for design or
audit. Use the resolver for runtime selection and upgrade when independent
assurance becomes required.
