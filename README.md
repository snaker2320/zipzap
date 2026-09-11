# ZipZap

ZipZap is a Git-native collaboration Skill for AI-assisted development. It routes project standards, applies risk-proportionate gates, runs bounded feedback loops, and transfers multi-commit work through structured Git checkpoints. It does not maintain Tasks or committed project runtime state.

## Model

```text
AGENTS.md bootstrap
        ↓
standards/ whole-file routing
        ↓
Work | Feedback | Maintenance Loop
        ↓
Plan → Design → Build → Test → Deploy → Maintain
        ↖             feedback             ↙
        ↓
built-in Gate
        ↓
Git Checkpoint (base..HEAD + trailers)
```

Project standards use five fixed categories: `foundation`, `engineering`, `quality`, `delivery`, and `governance`. Normal paths need no configuration. Exceptional selection uses YAML frontmatter. Gate and loop algorithms remain inside the installed Skill.

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

CLI inputs may be JSON or YML. Machine output remains JSON.

## Project Build and Deploy

`delivery plan` discovers candidate project commands but requires an explicit mapping before work can
proceed. `delivery assess` validates evidence after the Agent executes those commands through the Host.
ZipZap never executes command text from the input.

The fixed semantic slots cover Build, artifact verification, precheck, non-production deployment,
readiness probe, Smoke, diagnosis, and rollback. Projects keep their actual commands and scripts as the
source of truth under project standards. Existing commands are preferred; add a script only for
multi-step, repeated, safety-critical, polling, or rollback behavior. Production deployment is not
supported by this contract.

The Work Loop carries the current SDLC stage and next stage. Deploy consumes the existing delivery
assessment rather than creating a parallel workflow. Failed checks enter Feedback at an explicit
return stage; correction, re-verification, and closure return to Work. Repeated standards problems may
enter Maintenance only after the underlying problem item is closed and the proposal is human-reviewed.
Each Work stage advances with a Git-bound artifact; Build additionally binds its artifact SHA-256.

Work starts in Solo without prompting when the Gate needs no second context or independent assurance.
If the Gate requires Copilot, Trio, or Squad, ZipZap pauses once for a human choice among compatible
modes. The recommended option carries a `[推荐]` prefix and every option keeps its reason in the same
label. The choice is reused across the current Work, Feedback, and Maintenance flow unless scope, risk,
or Gate requirements materially change.

## Initialization

Initialization is preview-first and confirmation-bound. `configure` creates only relevant starter assets, `reorganize` classifies an existing `conventions/` or `docs/standards/` tree, and `rebuild` creates a new signal-based structure with recoverable backups for overwritten standards. If `standards/` already exists, default configuration skips restructuring.

No `zipzap.yml` or `.zipzap/project.json` is generated. Ephemeral loop state is stored under the user cache with repository/worktree isolation. `.zipzap/` is obsolete and ignored.

## Handoff

The final effective commit carries:

```text
ZipZap-Handoff: 1
ZipZap-Base: <full commit SHA>
ZipZap-Status: complete
ZipZap-Summary: <summary>
ZipZap-Verify: npm test => passed
ZipZap-Issue: medium | <remaining problem>
ZipZap-Standard: standards/delivery/git.md
```

Rich problem items use compact versioned fields in the same `ZipZap-Issue` trailer. Their fingerprint,
lifecycle state, return stage, and re-verification evidence survive handoff; checkpoint is derived from
the containing commit SHA. The legacy severity/title form remains supported. The receiver reconstructs all commits and changed files from
`base..HEAD`. If later commits are added, regenerate and amend the final commit metadata.

## Development and release

```sh
npm test
npm run validate
npm run build
npm run test:dist
git diff --check
```

Only `dist/skill` is installable. The bundle contains one CLI and a bundled YAML parser; it requires no runtime package installation. `npm run release:bundle` prepares deterministic GitHub Release assets from a clean, tagged revision and does not push or publish.
