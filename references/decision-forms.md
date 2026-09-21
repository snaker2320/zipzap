# Decision forms

The CLI projects an atomic decision bundle; it does not directly call a host tool. The executing Skill must inspect current tool callability.

When `request_user_input` is callable, use native-form pages with at most three questions. Retain answers outside project files until all pages are complete. When unavailable, use stepwise text and preserve the same atomic boundary. No write or destructive operation may begin on partial answers.

Ask only for unresolved user decisions that materially change scope, authority, or outcome. Do not ask the user to select Solo/Copilot/Trio/Squad or any Agent topology. Owner assignment, due independent checks, Handoff acceptance and explicit stage advancement are Host runtime responsibilities derived from the action and Gate.
