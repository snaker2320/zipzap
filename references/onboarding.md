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
`session`, `user`, or `project`; default to `user`. In a project, user scope is
a member-specific override stored in Git-ignored
`.zipzap/state/preferences.json`. Use
project scope only for an intentional shared team default. Team tone and
signatures are advanced choices; agent aliases remain an optional direct
personalization field.

Treat `preferred_preset` as a preference. `auto` means no explicit runtime
selection. Risk, gates, assurance, and independence can select a stronger
topology.

Apply precedence as:

```text
request override > user preference > project shared default > ZipZap default
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

- Store explicit project scope in `.zipzap/project.json` as a shared default.
- Store user scope in `.zipzap/state/preferences.json` when a project is
  present and keep that file ignored by Git. Without a project, return it to
  `host-user-state`.
- Return session scope to `session-state`; the host must apply it.

Project confirmation uses the manifest revision as an optimistic concurrency
check. Personal confirmation uses an independent local revision and must not
change the manifest revision or bytes. Store only personal differences from
the project default, not a second complete project configuration. Preserve
sources, extensions, enabled roles, enabled presets, and local Task persistence
while changing shared defaults. A reset removes only the selected scope's
overrides.
