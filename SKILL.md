---
name: zipzap
description: Govern bounded project delivery with routed standards, evidence gates, feedback, and Git handoffs. Use for project standards, controlled implementation or review, recurring defects, and delivery recovery; do not use as a project tracker.
---

# ZipZap

ZipZap decides which project rules, evidence and boundaries apply. The Host executes actions and enforces permissions. Git stores durable delivery facts; temporary Loop state stays in the user cache, isolated by repository, worktree and loop ID.

## Route before acting

The bundled CLI entrypoint is `scripts/zipzap.mjs`, relative to this `SKILL.md`. Resolve it inside the installed Skill and keep the target project as the working directory; do not require project `AGENTS.md` to repeat its location.

Read `AGENTS.md`, then route standards:

```sh
node <resolved-skill-root>/scripts/zipzap.mjs standards --action route --input <request.yml> --compact
```

`--input` is a JSON/YAML file path. Route by the active action, affected paths and risk, adding semantic selectors when needed. Load selected standards in full on first use. In the same intact context, reuse unchanged files by their returned SHA-256; reroute when scope changes and reload changed or lost context. An uncertain route requires the foundation standard and only the missing decision, not speculative rule changes.

Read the reference for the active operation only:

- Work, evidence, Owner/check execution, Feedback or Maintenance: `references/gates-and-loops.md`.
- Build and development/test Deploy: `references/delivery.md`.
- Git transfer, history consolidation or recovery: `references/git-handoff.md`.
- Standards initialization or restructuring: `references/standards.md`.
- Real unresolved user decisions: `references/decision-forms.md`.
- Installation, upgrade, rollback or release: `references/lifecycle.md`.

## Choose the smallest delivery boundary

Pure questions need no Loop. A bounded result without a controlled stage handoff uses Direct Work (`result_ref`). Staged Work declares `stage`, `completion_stage` and a Git-bound artifact covering the governed result. It may start and end at Design. An implementation plan is an input to Implement, not a reason to restart the intent-planning stage.

Advance only within the user's authorized scope. The Host supplies `next_stage` when a planned transition is ready; this does not require asking the user at every stage. Use `loop --brief --compact` for normal decisions and omit `--brief` for full evidence. Set `handoff_required: true` only when a Git transfer or durable continuation is actually needed.

## Keep execution and governance distinct

Internal edit/build/test/fix cycles stay inside the action. Work, Feedback and Maintenance are conditional branches, not a mandatory chain. Runtime stage `maintain` handles operational work; the Maintenance Loop handles reviewed standards changes. An unrelated improvement proposal does not block delivery. A necessary proposal sets `blocks_work: true` and preserves the original Work boundary in `resume`.

Entry checks protect scope and authorization. Exit checks protect the submitted result; missing future evidence is pending, not proof of failure. Never claim completion while `claims_completion: false`. Use existing authorization when it covers the action. Do not bypass blocked entry checks, open high-risk issues, or review of a required standards change.

Every Work has one `execution.owner`. Direct Work adds no execution roles. Gate-required independent checks bind only check IDs to real secondary Agent IDs; status, actor and evidence remain in the Gate. A check Agent does not become an Owner. It must differ from the Owner and artifact authors, and independent review must differ from independent testing when required.

The Host orchestrates Agent creation, liveness and messages; do not create a manager Agent. Staged Work keeps the same Owner unless an accepted `execution.handoff` transfers ownership at an explicit stage boundary. Missing capability, identity, check binding or handoff acknowledgement blocks the boundary instead of simulating independence. Runtime `maintain` is an operational stage, not a Maintainer role.

Read Host multi-Agent capability from the profile recorded during installation or upgrade. Use `execution.multi_agent` only for a Work-specific policy override; do not probe the Host on every Loop call. Derive compact progress from Owner, checks and the current Handoff, showing only stage, status, Owner, next stage and blocker. Use the full output when execution evidence is needed; normal `--brief` output retains this progress snapshot without repeating execution details.

## Preserve evidence and intent

Read accepted inputs before producing their dependents. Bind declared Git inputs and acceptance expectations to fresh evidence; changing either invalidates old bindings. Do not weaken acceptance to make a check pass. Record the decision behind an acceptance change and reverify the affected behavior.

A Gate result is a decision, not a command interceptor. Hosts or CI can consume `gate --enforce` immediately before the guarded boundary; permissions still belong to the Host. Local Git and `file:` references are checked locally, while opaque Host references remain attestations. Never claim a command, independent review, deployment or publication happened merely because an input says `passed`.

Initialize standards preview-first. Discovery is read-only. Propose the narrowest reviewed revision for repeated problems; never automatically rewrite standards or `AGENTS.md`. Keep external publication and production authorization separate from local delivery.
