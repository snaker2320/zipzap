# Squad Team Preset

The authoritative Squad definition is
[`config/teams.json`](../config/teams.json) at `teams.squad`.

Squad binds Owl to coordination, Fox to Product, Wolf to Developer, Lynx to
Tester, and Eagle to Reviewer. It separates Product from coordination, testing
from development, and review from both development and testing.

Query `node scripts/zipzap.mjs catalog --kind teams --id squad` for design or
audit. Treat all five members as logical contexts and schedule them within host
concurrency. Do not merge slots when doing so breaks required assurance.
