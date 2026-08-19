# Decision Interaction Gate Design

## Goal

Make every active ZipZap decision visible and blocking in both Plan and
non-Plan execution, especially during First Run and before Multi-Agent launch.

## Approved behavior

- A non-empty `decision_bundles` array is an execution stop, not passive data.
- Use a native form only when the host exposes one; otherwise use stepwise or
  plain-text conversation and wait for the accountable authority's answer.
- Starting an uninitialized project enters First Run before initialization can
  write project state.
- An automatically selected Multi-Agent topology requires explicit
  authorization before launch. Existing explicit user selection and host
  authorization semantics remain authoritative.
- Ready and completed results do not pause when no decision bundle exists.

## Architecture

Add a shared top-level `decision_interaction` contract with a deterministic
projection: `must_pause`, `presentation`, bundle IDs, and visible question
IDs. First Run, onboarding, L4, and L5 outputs derive it from the same Decision
Bundles they return. The ZipZap skill treats this projection as a hard gate
and renders the best host-supported presentation.

## Testing

Contract tests verify that form-capable hosts select native forms, non-form
hosts select stepwise/plain-text fallback, active bundles always pause, and
empty bundles never pause. Existing schema and end-to-end tests guard every
output surface.
