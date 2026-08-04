# Compact Output Template

Use `config/output-templates.json`, `schemas/run-receipt-input.schema.json`, and
the `receipt` command when rendering user-visible collaboration status. The
template receives structured facts and emits at most six primary lines,
including the header.

## Primary Fields

Render, in order:

1. `ZipZap · <team> · <active perspective>`;
2. result and truthful completion label, when available;
3. tests, Review, and open Finding count, when available;
4. actual/planned Context count, rounds, and handoffs only for multi-context or
   handed-off work;
5. resource consumption;
6. next action, only when one exists.

Do not render the full roster, schedule waves, routing reasons, Projection
revisions, internal discussion, or full Handoff payload in normal output.
Diagnostic mode may expose them separately.

## Planned and Actual

The selected topology is a plan. Report actual Contexts only from Host-confirmed
execution facts. When the Host cannot report them, display `actual unavailable`;
never turn logical bindings into proof that Agents ran.

## Consumption

Prefer exact Host Token telemetry. Otherwise emit a clearly labeled qualitative
estimate:

- low: one bounded Context and one ordinary pass;
- medium: two or three Contexts, a correction pass, or moderate source/tool
  volume;
- high: four or more Contexts, three or more rounds, or large source/tool
  volume.

The receipt may describe the band relative to a bounded Solo run. It is a
planning signal, not billing data, exact telemetry, or a persisted performance
measurement. Persistent Task usage records remain exact or unavailable.

## Discussion and Handoffs

Default to structured Findings, corrections, rechecks, and Handoff summaries,
not visible Agent transcripts. Allow one correction round by default and at
most two without user authorization. Stop when gates are satisfied, no new
material Finding appears, a limit is reached, or an accountable decision is
needed.
