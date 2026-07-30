# Team Preset Catalog

Load this lightweight catalog when selecting a standard team. Load one complete
team definition only when initializing, changing, validating, or auditing it.

| ID | Name | Members | Default use | Assurance |
| --- | --- | ---: | --- | --- |
| `solo` | Solo | 1 | Low-risk bounded work | Self-test and self-review only |
| `copilot` | Copilot | 2 | Everyday execution with continuous advice | Separate peer challenge, not formal independent review |
| `trio` | Trio | 3 | Normal collaborative delivery | Developer separated from tester/reviewer |
| `squad` | Squad | 5 | High-risk or complex delivery | Product, development, testing, and review separated |

## Default Selection

Choose Solo when work is reversible, well bounded, objectively verifiable, and
does not require independent judgment.

Choose Copilot when one primary Agent should perform the work while a second
named context challenges plans, detects omissions, suggests tests, and reviews
evidence at checkpoints. Do not use it to satisfy a formal independent test or
review gate.

Choose Trio by default for persisted or collaborative product-development work.
It balances context cost with independent assurance from the Developer.

Choose Squad when risk, breadth, specialization, or governance requires
separate product, development, testing, and review contexts.

## Selection Constraints

- Treat the member count as logical membership, not guaranteed concurrency.
- Honor the user's explicit preset when it satisfies required assurance.
- Recommend a stronger preset when required independence is unavailable.
- Use a human gate when authority or assurance cannot be supplied by agents.
- Never describe Solo self-review as independent.
- Treat Copilot advice as peer challenge, not independent approval.
- Do not describe Trio's Reviewer as separate from its Tester.
- Do not silently degrade a selected preset.
- Use the canonical personalization field names and enumerated values defined
  in `SKILL.md`; normalize user phrasing instead of creating synonymous keys.
