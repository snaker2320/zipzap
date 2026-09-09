# Standards initialization and routing

`standards/` is the only project-specific governance root. Its fixed categories are `foundation/`, `engineering/`, `quality/`, `delivery/`, and `governance/`. Directory names are configuration-free; optional YAML frontmatter may declare `id`, `summary`, `priority`, `applies_to`, `high_risk`, and `authority`.

Run initialization in two calls. First use `action: preview`; show every `mkdir`, `move`, `write`, `replace-tree`, `keep`, collision, and the preview fingerprint. Only run `action: apply` with the same inputs and exact fingerprint after user confirmation. Existing `standards/` defaults to `keep`. When no standard tree exists but `conventions/` or `docs/standards/` does, default configuration becomes `reorganize`; nothing moves before confirmation. A full `rebuild` backs up the old standards tree in the user cache before replacement.

Scaffolding follows repository signals and creates only relevant files. `AGENTS.md` is created only when absent; otherwise consolidation remains a separate reviewed change.
