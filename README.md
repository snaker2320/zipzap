# ZipZap

ZipZap is a standalone AI collaboration skill for initializing role-based
human–AI execution and running ad-hoc or tracked work to verifiable completion.

The project is in active product and workflow design. Its current structure is:

```text
.
├── SKILL.md                       # Runtime instructions and resource routing
├── agents/openai.yaml             # Skill UI metadata
└── references/
    ├── operating-model.md         # Roles, agents, contexts, and invariants
    ├── context-router.md           # Runtime context selection and projection
    ├── project-initialization.md  # Project discovery and registration model
    ├── execution-policy.md        # Persistence, risk, and collaboration policy
    ├── role-catalog.md             # Lightweight standard-role routing index
    ├── role-contract.md            # Role authoring and projection standard
    ├── role-product.md             # Standard Product role definition
    ├── role-developer.md           # Standard Developer role definition
    ├── role-tester.md              # Standard Tester role definition
    ├── role-reviewer.md            # Standard Reviewer role definition
    ├── agent-profile.md            # Agent Profile authoring standard
    ├── agent-catalog.md            # Lightweight profile routing index
    ├── agent-<id>.md               # Owl, Fox, Wolf, Lynx, and Eagle
    ├── team-preset.md              # Team Preset authoring standard
    ├── team-catalog.md             # Solo, Copilot, Trio, and Squad selector
    └── team-<id>.md                # Full standard team definitions
```

Project-specific business rules remain in each project's own source of truth.
ZipZap registers and loads those rules when needed instead of copying them.
