---
priority: 10
applies_to:
  actions:
    - implement
    - verify
    - review
---
# Testing standard

Tests use `node:test` and `node:assert/strict`. Contract, CLI, migration, and regression behavior require observable tests.

Before a completion claim, run `npm test`, `npm run validate`, `npm run build`, `npm run test:dist`, and `git diff --check`. Record failures and limitations separately from passing evidence.
