# Standards governance and contextual routing

`standards/` is the only project-specific governance root. Its fixed categories are `foundation/`, `engineering/`, `quality/`, `delivery/`, and `governance/`. Directory names are configuration-free; optional YAML frontmatter may declare `id`, `summary`, `priority`, `applies_to`, `high_risk`, and `authority`.

## Govern standards without taking their authority

ZipZap owns the governance protocol, not project rules. A project standard should state durable boundaries, conditions, constraints, decisions, and expected outcomes. Concrete examples may clarify a rule but must not substitute for one; keep example-heavy material in reference documentation and load it only when needed.

The derived index is rebuilt from the current Markdown files and frontmatter for each discovery or route. It is not committed and does not become a second authority. `discover` reports read-only diagnostics for missing standards, duplicate IDs, unsupported or absent applicability, thin content, and example-heavy files. Diagnostics are maintenance proposals, never permission to rewrite, split, move, or delete a project rule automatically.

Use minimal applicability metadata when a standard is not universal:

- `actions`: the work intent, such as `design`, `implement`, `verify`, or `review`;
- `domains`: stable project-owned business or technical areas;
- `artifacts`: stable kinds of affected output, such as `design-document`, `backend-api`, or `database-schema`;
- `paths`: repository-relative glob patterns once affected files are known;
- `risks`: `low`, `medium`, or `high`.

Values within one dimension are alternatives; configured dimensions are combined. Route once from action, domain, artifact, and risk at entry, then route again with affected paths when they become known. Each selected standard reports `matched_by`. Unscoped non-foundation standards remain universally applicable for compatibility but produce a diagnostic. An explicitly requested domain or artifact with no scoped match also produces a diagnostic rather than inventing a rule.

This is an additive contract: existing `action`, `risk`, and `paths` inputs and existing unscoped behavior remain valid; `domains` and `artifacts` are optional. No project migration or committed index is required. Rolling back the extension means omitting the optional context and applicability fields; authoritative Markdown remains unchanged.

Run initialization in two calls. First use `action: preview`; show every `mkdir`, `move`, `write`, `replace-tree`, `keep`, collision, and the preview fingerprint. Only run `action: apply` with the same inputs and exact fingerprint after user confirmation. Existing `standards/` defaults to `keep`. When no standard tree exists but `conventions/` or `docs/standards/` does, default configuration becomes `reorganize`; nothing moves before confirmation. A full `rebuild` backs up the old standards tree in the user cache before replacement.

Scaffolding follows repository signals and creates only relevant files. `AGENTS.md` is created only when absent; otherwise consolidation remains a separate reviewed change.

When standards are missing, preview the minimum scaffold and identify the project decisions that still need an owner. When diagnostics find weak or conflicting material, propose the narrowest maintenance change: add applicability, extract a durable rule, move examples to references, split mixed concerns, merge duplicates, or retire obsolete material. Apply only a human-reviewed proposal through the normal preview and confirmation boundary.
