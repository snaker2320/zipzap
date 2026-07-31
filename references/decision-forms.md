# Decision Forms

Load this reference when emitting, rendering, answering, or changing a critical
decision. Use `schemas/decision-bundle.schema.json` as the shared machine
contract.

## Boundary

Use a Decision Bundle at a material checkpoint that needs a human or separately
authorized role. Plan mode may deepen discussion, but it never controls whether
structured choices are available. Non-Plan execution must expose the same
choices through a form, stepwise conversation, or numbered-text fallback.

Keep `decisions_required` as a compact compatibility summary. Treat
`decision_bundles` as the authoritative rendering contract. Return an empty
array when no decision is active.

## Composition

Put related questions in one bundle only when they:

- belong to one checkpoint and context revision;
- require the same authority;
- can be submitted together without partial execution.

Use `atomic` submission for coupled questions. Use `incremental` only for a
stateful adapter such as stepwise onboarding that performs no external or
project mutation while collecting answers. Split different authorities into
separate bundles.

Support `single-select`, `multi-select`, and `confirm`. For multi-select,
declare the minimum and optional maximum number of selections. Give every
option a stable ID, clear label, consequence-oriented description, and an
explicit recommendation flag. Do not recommend an option merely because it is
listed first.

## Interaction

Use structured decisions for initialization, collaboration authorization,
scope or trade-off choices, risk resolution, irreversible action, conflicting
exploration results, and acceptance. Do not turn routine reversible work into a
questionnaire.

After collecting answers, show a preview before any write, external effect, or
Multi-Agent launch when `preview_required` is true. Preserve the bundle ID,
question IDs, authority, and state revision across form, conversation, and text
renderers.
