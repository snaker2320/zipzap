# ZipZap

ZipZap is a Git-native collaboration Skill for AI-assisted development. It routes project standards, applies risk-proportionate Gates, runs bounded feedback loops, and transfers multi-commit work through structured Git checkpoints. It does not maintain Tasks or committed runtime state.

## Model

```text
AGENTS.md → standards routing → direct Work or bounded staged Work
                                      ↓
                      Plan → Design → Implement → Verify → Deploy → Maintain
                         explicit start and completion nodes; no implicit advance
                                      ↓
                           Gate → Feedback → Git Checkpoint
```

Direct Work has `result_ref` and no SDLC stage. Staged Work declares `stage` and `completion_stage`, so a Plan-and-Design request ends at Design. Pure questions that need no controlled delivery stay outside the Loop.

## Commands

```sh
npm ci
node scripts/zipzap.mjs validate --compact
node scripts/zipzap.mjs initialize --input examples/zipzap/initialize.yml --compact
node scripts/zipzap.mjs standards --action route --input examples/zipzap/standards-route.yml --compact
node scripts/zipzap.mjs gate --input examples/zipzap/gate.yml --compact
node scripts/zipzap.mjs loop --input examples/zipzap/loop.yml --compact
node scripts/zipzap.mjs delivery --action plan --input examples/zipzap/delivery.yml --compact
node scripts/zipzap.mjs issues --input examples/zipzap/issues.yml --compact
node scripts/zipzap.mjs handoff --action prepare --input examples/zipzap/handoff.yml --compact
```

CLI input may be JSON or YML. Machine output is JSON.

## Roles and acceptance

ZipZap schedules `product`, `developer`, `tester`, and `reviewer` as logical responsibilities. It has no Solo/Copilot/Trio/Squad modes and never asks the user to choose a collaboration topology. Loop output lazily activates only the next action's roles and reuses them by `loop_id + role`; role count does not imply Agent count.

An optional reusable acceptance contract covers positive, negative, boundary, and regression scenarios plus constraints. Each item has a stable ID, applicability, and expected behavior. Verification evidence maps to those IDs.

Internal edit/Build/test/fix iteration does not spend the bounded governance correction, but it cannot bypass entry Gates, open high-risk problem items, or unreviewed standards proposals. `evaluate` is observational; the single automatic correction applies only after a submitted exit Gate failure or failed Feedback re-verification.

## Project Build and Deploy

Delivery planning discovers candidate project commands but requires explicit mapping. Assessment validates evidence after the Agent executes confirmed commands through the Host. ZipZap never executes command text from input. Command slots such as `build.execute` are distinct from the workflow stage `implement`.

Deploy consumes the delivery assessment. Failed checks create problem items with `return_to`; Build and Smoke failures return to Implement, while deploy failures return to Deploy. Production is outside this contract.

## Handoff

The final effective commit carries a non-empty bounded `base..HEAD` range, status, summary, verification, issues, and standards. Structured `ZipZap-Issue` version 2 preserves the issue fingerprint, lifecycle state, `return_to` target, and verification evidence. Direct Work uses `return_to: direct`; legacy severity/title issues remain readable.

## Development and release

```sh
npm test
npm run validate
npm run build
npm run test:dist
git diff --check
```

Only `dist/skill` is installable. The bundle is self-contained. `npm run release:bundle` prepares deterministic assets from a clean tagged revision and does not push or publish.
