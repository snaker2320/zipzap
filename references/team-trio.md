# Trio Team Preset

The authoritative Trio definition is
[`config/teams.json`](../config/teams.json) at `teams.trio`.

Trio binds Owl to coordination and Product, Wolf to Developer, and Eagle to
Tester and Reviewer. It separates testing and review from development but does
not separate Reviewer from Tester.

Query `node scripts/zipzap.mjs catalog --kind teams --id trio` for design or
audit. Logical members may execute sequentially while retaining separate
contexts and handoffs. Upgrade to Squad when testing and review must be
mutually independent or Product must be separate from coordination.
