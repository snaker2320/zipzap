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

Load each selected file in full. Standard locations under `standards/` need no routing configuration. YAML frontmatter is only for exceptional applicability, priority, risk, or authority metadata. If no rule matches, load `standards/foundation/project.md` when present and ask only for the missing decision.

Read only the ZipZap reference needed for the active operation:

- initialization or restructuring: `references/standards.md`;
- work, review, verification, or feedback: `references/gates-and-loops.md`;
- Git transfer or recovery: `references/git-handoff.md`;
- user decisions and native forms: `references/decision-forms.md`;
- package install, upgrade, rollback, or release: `references/lifecycle.md`.

## Initialize standards

Initialization is preview-first. If a valid `standards/` structure exists, default `configure` resolves to `keep` and skips restructuring. Otherwise guide the user among:

- `configure`: create only project-relevant starter assets;
- `reorganize`: classify existing `conventions/` or `docs/standards/` documents into the five standard categories;
- `rebuild`: generate a fresh relevant structure, backing up overwritten standards in the user cache.

The categories are `foundation`, `engineering`, `quality`, `delivery`, and `governance`. Do not mechanically create every possible file. Show the preview, unresolved collisions, exact writes/moves, and fingerprint before applying it. Never overwrite an existing `AGENTS.md` automatically.

## Run the bounded loop

Use one of three built-in loops:

- Work Loop for framing, producing, verifying, reviewing, and completing a delivery;
- Feedback Loop for turning observed problem items into bounded corrections or standards proposals;
- Maintenance Loop for checking and repairing standards quality.

All loops use the same Gate and Git Checkpoint rules. Token efficiency is the first optimization boundary: allow the initial attempt plus at most one automatic model correction. If the second model result fails, stop with evidence and escalate. A high-risk gate failure stops immediately. Cheap deterministic checks may rerun without spending the model-correction allowance.

Gate types and algorithms are built in. Project standards may define applicability, verification commands, high-risk areas, and human authority, but may not redefine gate semantics or bypass a failed gate.

## Consolidate feedback

Call user-facing review defects “问题项”; use `issues` in machine fields. Group equivalent observations by stable fingerprint. Two independent Git Checkpoints may propose a standards improvement; a high-risk problem item may propose one on first occurrence.

Do not create a feedback database or append-only history. Do not auto-edit `AGENTS.md`. Prefer merging or revising the narrowest existing standard and suppress duplicate prose. Only a repeated bootstrap-routing gap may propose a minimal, human-reviewed `AGENTS.md` revision. A proposal is never self-approval.

## Handoff through Git

Use `base..HEAD` as the complete multi-commit delivery range. The final effective commit must contain exactly one each of:

```text
ZipZap-Handoff: 1
ZipZap-Base: <full-commit-sha>
ZipZap-Status: complete|partial|blocked
ZipZap-Summary: <bounded summary>
```

Add repeatable `ZipZap-Verify`, `ZipZap-Issue`, and `ZipZap-Standard` trailers as needed. Run `handoff --action prepare` before the final commit or amend. If another commit is added later, regenerate and amend the new final commit. The receiver runs `handoff --action inspect` and validates commit availability, ancestry, full changed-file range, evidence, remaining issues, and worktree state.

## Ask decisions through the host

First detect whether `request_user_input` is callable in the current host and mode. When callable, use the native form in pages of two or three questions, never more than three. Preserve one atomic decision bundle: collect every page before mutating state. When the tool is unavailable, use the projected stepwise text fallback. Tool availability is host- and mode-specific; do not claim native form support from catalog metadata alone.

## Lifecycle

Installed artifacts are bundled and must not run `npm install`. Upgrading from the Task-based release is destructive: first preview every obsolete `.zipzap/` file, count, and byte size; show that the deletion is unrecoverable; require the exact current fingerprint; then delete it. Initialize `standards/` separately after package installation.

Never claim tests, review, acceptance, release readiness, push, or publication without recorded evidence.
