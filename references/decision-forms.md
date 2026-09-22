# Decision forms

The CLI projects an atomic decision bundle; it does not directly call a host tool. The executing Skill must inspect current tool callability and invoke the selected tool to display the form. Listing questions or returning `native-form` alone does not display a form.

Report `host.request_user_input` and/or `host.request_user_input_async` with `callable` and optional `max_questions` to `decision-pages`. Omitted capabilities are unavailable. Callability means permitted for this question in the current session and mode, not merely listed or available during installation. Recheck when the mode changes; do not persist form availability in the installation profile or switch to Plan mode just to ask a question.

Use the returned `tool`: prefer callable `request_user_input`, then callable `request_user_input_async`, otherwise stepwise text (`tool: null`). Both native tools use `presentation: native-form`. Each page has at most three questions and respects a smaller Host limit, even when `page_size` requests more. Existing synchronous-only inputs remain supported.

Adapt each page to the selected tool's current schema. For synchronous forms, supply question IDs, short headers, question text and supported option objects. For asynchronous forms, map question text to `title` and choices to string `options`; retain the page order and original IDs locally to associate replies. Put necessary context in the title and omit options for free-text questions where supported. Do not send CLI metadata or synchronous option objects to the asynchronous tool.

An asynchronous tool returns after posting the questions, before the user replies. Keep dependent actions pending until the actual answers arrive; a posted form, preselected option, timeout or empty response is not a decision or authorization. Unrelated work may continue. Retain answers outside project files until all required pages are complete, then apply the decision bundle together. Partial answers do not authorize dependent writes or destructive operations. If the Host permits an optional unanswered preference to use a default, state the assumption; never use a default to supply missing authorization. Text fallback preserves the same boundary.

Ask only for unresolved user decisions that materially change scope, authority, or outcome. Do not ask the user to select Solo/Copilot/Trio/Squad or any Agent topology. Owner assignment, due independent checks, Handoff acceptance and explicit stage advancement are Host runtime responsibilities derived from the action and Gate.
