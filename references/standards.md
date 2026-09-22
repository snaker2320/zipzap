# Project standards and document assistance

Project-owned Markdown and entry instructions remain authoritative and directly usable without ZipZap. Discovery and routing are read-only standalone capabilities; neither starts a Loop. Metadata, a particular directory layout, installation and a committed index are not prerequisites for following project rules.

## Discover existing sources

Read the project's `AGENTS.md` and its referenced rules. By default, discovery inspects existing `standards/`, `conventions/` and `docs/standards/` without moving anything. Subdirectories may use any names. Conventional `standards/` category names remain recognized for compatibility.

For another layout, pass `project.standards` as an array of existing project-relative Markdown files or directories. This replaces default source selection for that request. Obtain these paths from project instructions; do not infer authority from every document link or create a second project manifest. Missing sources produce diagnostics, not an instruction to invent rules. Paths must stay inside the project; directory traversal does not follow nested symlinks.

`discover` returns the inspected `sources`, file digests and read-only diagnostics. `route` additionally returns `selected` rules, `matched_by`, `related_documents` and coverage. Results cover only inspected sources and direct references; a missing match never establishes that the project has no constraints. Read the project entry directly when routing cannot resolve the task.

## Optional matching metadata

Optional YAML frontmatter may contain `id`, `summary`, `priority`, `applies_to`, `high_risk` and `authority`. Other project documentation metadata is preserved and ignored by routing. Malformed YAML is diagnosed while the file remains available for direct reading.

Applicability dimensions are `actions`, `domains`, `artifacts`, `paths` and `risks`. Values within one dimension are alternatives; dimensions combine. The request uses singular `action` and `risk`. Unscoped files remain selected for compatibility; read their actual conditions before deciding applicability. Metadata can improve precision but is not required for a valid project rule.

Load selected rules in full on first use. Reuse unchanged content by its SHA-256 in intact context. Reroute when scope changes; do not reread every rule at every internal edit. Diagnostics may identify duplicate IDs, missing sources, unclear applicability, thin content or excessive examples, but never authorize automatic rule changes.

## Related documents

`related_documents` contains reference candidates, separate from selected standards. Sources are the selected rule files and document entry files (`AGENTS.md` and `docs/index.md` when present, or the explicit `project.documents` array). Document sources must be Markdown files.

Lookup follows one hop of explicit local Markdown links, link definitions and backtick Markdown paths. Markdown links resolve relative to their source; root-relative links and backtick paths resolve from the project root. Link fragments are ignored. Fenced examples, remote links and links outside the project are not fetched. Missing and invalid local references produce diagnostics.

Each candidate reports `referenced_by` and the relationship. A reference is not proof of applicability or authority. Read relevant candidates as needed; this is not exhaustive semantic search, recursive knowledge indexing or a new rules database.

## Optional initialization and migration

Installation is separate from initialization. Installer `--standards auto` only discovers existing rules; it creates no entry or standards tree. Request `configure`, `reorganize` or `rebuild` explicitly when initialization is wanted.

Initialization uses preview then apply with the same inputs and exact `preview_fingerprint`. Existing rules default to `keep`, including `conventions/`, `docs/standards/` and explicitly supplied sources. Only an explicit `reorganize` proposes moving conventional legacy directories; only an explicit `rebuild` replaces `standards/`, with backup. These choices are not required to use the Skill.

When there are no known rules, requested `configure` may propose a small `standards/` scaffold. A newly generated `AGENTS.md` points to project-owned rules and states optional assistance; it does not require ZipZap. Existing `AGENTS.md` is kept unchanged. The preview includes a digest-bound `bootstrap_suggestion` with line-level replacements for recognized old mandatory ZipZap clauses. Review these separately and preserve project-specific instructions and required checks; initialization apply never rewrites the existing entry.

When optional assistance is unavailable or removed, continue ordinary work from project instructions. If a project-required check cannot run, block that delivery boundary and report missing evidence. Do not use optional installation as a reason to bypass an active Gate.
