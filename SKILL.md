---
name: zipzap
description: Run Git-native AI development with routed project standards, built-in gates, bounded feedback loops, deduplicated problem items, and structured multi-commit handoffs. Use for standards initialization, governed implementation or review, recurring feedback, Git Handoff, and ZipZap lifecycle work; do not use as a project tracker.
---

# ZipZap

ZipZap is a collaboration control plane, not a project tracker. Do not create a ZipZap Task or project-local runtime database. Git records durable delivery and Handoff facts; ephemeral loop state belongs in the user cache, isolated by repository and worktree fingerprint.

## Route before acting

For project work, inspect `AGENTS.md` and route project standards with:

```sh
node scripts/zipzap.mjs standards --action route --input <request.yml> --compact
```

Load every selected standard in full. Normal paths under `standards/` need no routing configuration. YAML frontmatter is only for exceptional applicability, priority, risk, or authority metadata. If routing remains uncertain, load `standards/foundation/project.md` and ask only for the missing decision.

Read only the reference needed for the active operation:

- initialization or restructuring: `references/standards.md`;
- Work, Gate, acceptance, Feedback, or role scheduling: `references/gates-and-loops.md`;
- project Build or development/test Deploy: `references/delivery.md`;
- Git transfer or recovery: `references/git-handoff.md`;
- user decisions and native forms: `references/decision-forms.md`;
- install, upgrade, rollback, or release: `references/lifecycle.md`.

## Initialize standards

Initialization is preview-first. If valid standards already exist, default `configure` resolves to `keep`. Otherwise guide the user among `configure`, `reorganize`, and `rebuild`. Create only relevant assets, show exact operations and the fingerprint before applying, and never overwrite `AGENTS.md` automatically.

## Choose the smallest Work contract

Do not classify requests as business or non-business. Decide whether controlled stage handoffs are useful.

- Use direct Work for a bounded result that does not need staged delivery. Supply `result_ref`; omit `stage`, `completion_stage`, and `artifacts`.
- Use staged Work when artifacts must cross controlled stage boundaries. Declare the current `stage`, the explicit ending node `completion_stage`, and exactly one Git-bound artifact for each represented stage.
- Keep pure questions, conversation, and requests that need no governed delivery outside the Loop.

The stage vocabulary is `plan`, `design`, `implement`, `verify`, `deploy`, and `maintain`. A stage never advances implicitly. Supply `next_stage` only for an intentional transition. Reaching `completion_stage` completes Work, so a design-only request can end at Design without entering Implement or Verify.

## Run bounded Gates and loops

Use Work for delivery, Feedback for observed problem items, and Maintenance for reviewed standards improvements. The Gate derives requirements from current-action effects and risk. Project standards may define applicability, commands, high-risk areas, and authority, but may not redefine Gate semantics or bypass a failed Gate.

Scope and authorization are entry checks. Verification and independent review are exit checks. A passed check needs a source reference; staged exit evidence binds the current stage commit. Risk signals may raise but never lower declared risk.

Internal Agent iteration such as edit, Build, test, and fix stays inside the active action. It neither creates Feedback nor spends the governance correction allowance, but it cannot bypass an entry failure, an open high-risk problem item, or an unreviewed standards proposal. A resolved high-risk item may proceed to verification. `evaluate` observes without spending the allowance. After a submitted result fails an exit Gate, or a Feedback correction fails re-verification, allow one automatic model correction. Re-verification failure reopens resolved items. A second failure stops with evidence. High-risk submitted failure stops immediately. A deterministic rerun with identical input SHA-256 does not consume the allowance.

## Guide acceptance without overfitting

When acceptance needs to be explicit, record a reusable contract with stable IDs:

- positive, negative, boundary, and regression scenarios;
- each scenario's applicability, condition, action, and expected result;
- constraints or invariants and their applicability;
- verification evidence mapped back to acceptance IDs.

Every scenario type must be addressed, but `not-applicable` with a reason is valid. This is a design aid and exit-evidence contract, not a requirement to execute irrelevant tests. Applicable items need passing evidence before completion.

## Schedule roles, not team modes

There are no Solo, Copilot, Trio, Squad, team presets, or collaboration-selection prompts. Roles are logical responsibilities, not Agent counts. Multiple roles may be performed sequentially, by one context where independence is not required, or by distinct contexts when a Gate requires independence.

Follow `agents.activate_or_reuse`. Activate no execution roles while the entry Gate is blocked. Otherwise activate only roles needed for the next action and reuse by `loop_id + role`. `required_roles` expresses action-specific judgment: Design may request a developer for technical design or a tester for test design. Activate Product only when intent, scope, acceptance, or a product trade-off is ambiguous or explicitly assigned.

Reuse the same Tester assignment after test design for later Verify or Feedback work. Leaving a role idle does no work. Tester independence remains valid while it does not edit the artifact under test; if it does, re-establish valid verification. Pass `active_roles` when the Host needs the completion result to release every retained role. Agent IDs and thread state remain Host-owned and never enter project state or Git Handoff.

## Feedback and Maintenance

Call user-facing defects “问题项”; use `issues` in machine fields. Preserve stable `fingerprint`, `checkpoint`, `status`, `return_to`, and closure `verification_ref`. Staged Feedback also carries the original `completion_stage`. A staged issue returns to its named stage without losing the end node; a direct issue uses `return_to: direct` and resumes the same direct Work.

Group equivalent observations by fingerprint. Two independent Git Checkpoints may propose a standards improvement; high severity may propose one immediately. Do not create a feedback database, auto-edit `AGENTS.md`, or self-approve a proposal. Prefer merging or revising the narrowest existing standard.

## Build and deploy through project adapters

Use `delivery --action plan` to discover project-owned command candidates and validate an explicit mapping for Build and development/test Deploy. Discovery is guidance, never executable authority. The Agent executes confirmed commands through the Host; ZipZap does not execute command text from input.

Use `delivery --action assess` to validate artifact, command, target, readiness, Smoke, rollback, and authorization evidence. Delivery slots such as `build.execute` remain semantic commands, not workflow stages. Build or Smoke failures return to workflow stage `implement`; other deploy failures return to `deploy`. Production deployment is outside this contract.

## Handoff through Git

Use `base..HEAD` as the complete, non-empty multi-commit range. The final effective commit contains exactly one `ZipZap-Handoff`, `ZipZap-Base`, `ZipZap-Status`, and `ZipZap-Summary` trailer, plus repeatable verification, issue, and standard trailers as needed. Structured issue trailer version 2 preserves `return_to`, including `direct`; the legacy severity/title form remains readable.

Run `handoff --action prepare` before the final commit or amend. If another commit is added, regenerate and amend the new final commit. The receiver inspects commit availability, ancestry, changed files, evidence, remaining issues, and worktree state.

## Ask decisions through the host

Use native input forms only for real unresolved user decisions, in pages of at most three questions. Preserve one atomic decision bundle and do not mutate state from partial answers. When unavailable, use stepwise text. Role scheduling and stage transitions are Agent responsibilities and do not create topology-choice prompts.

## Lifecycle

Installed artifacts are bundled and must not run `npm install`. Upgrading from Task-based releases remains preview-first and fingerprint-confirmed before deleting obsolete `.zipzap/` state. Initialize project standards separately from package installation.

Never claim tests, review, acceptance, release readiness, push, or publication without recorded evidence.
