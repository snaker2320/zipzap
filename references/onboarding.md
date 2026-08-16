# Guided Onboarding

Load this reference when presenting, changing, or resetting ZipZap
collaboration preferences. Use `config/onboarding.json` as the question and
default catalog. Use `schemas/onboarding-input.schema.json` and
`schemas/onboarding-output.schema.json` as the interface.

## Presentation

Prefer a host-rendered form only when the Host Capability Matrix reports it:

```bash
node scripts/zipzap.mjs onboard --input onboarding-start.json
```

Send `presentation: form` to receive all page-ready fields. Send
`presentation: stepwise` to receive one `question` at a time. Both
presentations use the same state, validation, preview, and confirmation rules.
Do not require Plan mode.

Return the same canonical `decision_bundles` contract for both presentations.
A form uses one atomic bundle containing all visible questions. Stepwise
conversation uses an incremental bundle containing the next question while
preserving state revision. The preview returns a confirmation bundle before
any preference write.

Inspect `decision_interaction` before advancing the state machine. Every
configuration or confirmation bundle sets `must_pause` to true. A completed or
blocked response with no bundle uses `presentation: none` and does not request
an answer.

When First Run chooses presentation automatically, use `guided-form` when
available and `stepwise` otherwise. Do not ask users to decide between these
presentation mechanisms.

Supported operations are:

- `start`: load defaults or current values;
- `answer`: answer the next question in a stepwise flow;
- `submit`: submit form values;
- `confirm`: apply an already previewed state;
- `reset`: preview removal of stored overrides before confirmation.

Pass the returned `state` unchanged with `expected_revision` for the next
operation. Treat it as untrusted input and let the adapter validate it.

## Configuration

The core choices are response detail, humor, and preferred team. Scope may be
`session`, `user`, or `project`. Team tone and signatures are advanced choices;
agent aliases remain an optional direct personalization field.

Treat `preferred_preset` as a preference. `auto` means no explicit runtime
selection. Risk, gates, assurance, and independence can select a stronger
topology.

Apply precedence as:

```text
request override > project preference > user preference > ZipZap default
```

Apply governance after preference resolution. Never let a preference weaken
authority, project rules, gates, evidence, or independence.

## Preview and Storage

Never write during `start`, `answer`, `submit`, or `reset`. Require
`preview-ready` followed by `confirm`.

When First Run embeds onboarding, let its final confirmation apply the
validated configuration together with project source registration. Do not
call project-scoped onboarding confirmation separately and create an
intermediate manifest.

- Store project scope in `.zipzap/project.json`.
- Return user scope to `host-user-state`; the host must apply it.
- Return session scope to `session-state`; the host must apply it.

Project confirmation uses the manifest revision as an optimistic concurrency
check. Preserve sources, extensions, enabled roles, enabled presets, and local
Task persistence while changing preferences. A reset removes preference
overrides rather than deleting project-owned sources or governance.
