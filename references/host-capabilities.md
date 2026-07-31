# Host Capability Matrix

Load this reference when adapting ZipZap to a host or explaining unavailable
features. Use `schemas/host-capabilities.schema.json`,
`schemas/host-capability-matrix.schema.json`, and the `conform` command.

## Matrix

Report these user-relevant capabilities:

| Capability | Available when | Fallback |
| --- | --- | --- |
| Multi-Agent contexts | More than one distinct context is available and authorization is granted | Use Solo where sufficient or assign qualified humans to independent gates |
| Guided form | The host reports `guided-form` | Use stepwise conversation |
| Exact token telemetry | The host reports `token-usage-reporting` | Record telemetry as unavailable; never estimate |
| Goal budgeting | The host reports `goal-budgeting` | Keep an optional Task budget without creating a Goal |
| Node acceleration | Node and `script-execution` are available | Use direct JSON |
| Project state | The host reports `project-state`, or project read and write | Keep work ephemeral or request project access |

Use status values precisely:

- `available`: the host explicitly reports complete support;
- `authorization-required`: support exists but needs an accountable decision;
- `degraded`: partial support is usable, such as read-only project state;
- `unavailable`: the host was assessed and does not provide the capability;
- `unknown`: no authoritative host report was supplied.

Never mark a missing capability `degraded` merely because ZipZap has a
fallback. The status describes host support; `fallback` describes how ZipZap
preserves useful behavior. Never infer support from the product name,
operating system, model, or installed Skill.

## Presentation

Return the complete Matrix during First Run and conformance inspection. In the
default UI, summarize only statuses that affect the current action and keep
the full Matrix available as details. Keep each entry concise: status,
one-line consequence, and fallback. Do not turn unavailable optional
acceleration into a blocker when the direct contract preserves governance.

Use the Matrix to select presentation and telemetry behavior automatically.
Ask the user only when authorization is genuinely required, such as enabling
multiple Agent contexts.
