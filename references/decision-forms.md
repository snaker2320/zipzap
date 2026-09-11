# Decision forms

The CLI projects an atomic decision bundle into pages. It does not directly call a host tool. The executing Skill must inspect current tool callability.

When `request_user_input` is callable, use `native-form` pages with at most three questions; prefer two or three. Retain answers outside project files until all pages are complete. When unavailable, use the exact `stepwise-text` fallback and preserve the same atomic boundary. No write or destructive operation may begin on partial answers.

For collaboration mode selection, use the Gate-projected option labels verbatim. The label itself
contains the mode and reason; do not add a separate rationale. Prefix only the recommended label with
`[推荐]`. If Solo is the default, do not create a decision form.
