# Installation, upgrade, and release

Build bundles the CLI and its YAML parser into `dist/skill`; installed copies have no `node_modules` and never install packages. Installation and project initialization are separate.

With `--project`, the default `--standards auto` performs read-only discovery. It does not scaffold or relocate rules or write `AGENTS.md`. Explicit initialization modes retain preview/fingerprint confirmation. Upgrades can use initialization preview to propose replacements for recognized mandatory ZipZap clauses; applying initialization preserves existing entries. Removing the Skill leaves project rules and records usable, but does not waive any project-required delivery check.

When installation or upgrade leaves a material user choice unresolved, use `decision-forms.md` and actually invoke the current Host's callable native form, including the asynchronous form outside Plan mode when available. Reuse explicit choices already supplied by the user; installation does not require a questionnaire when there is no missing decision. Form callability is checked in the current session, separately from the recorded multi-Agent profile.

Installation or upgrade records Host multi-Agent capability in `~/.cache/zipzap/host-capabilities.json` (or `--cache-root`) with an atomic replacement. The installer supplies `--host-multi-agent full|disabled|unavailable|unknown` and may record `--host-version`. `full` enables multi-Agent work by default. `disabled` records available stable identity and Handoff acknowledgement while leaving the default policy off, so a Work may explicitly opt in. `unavailable` and `unknown` fail conservatively when independent checks or ownership transfer need another Agent. If the option is omitted, preserve the existing profile; refresh it when Host capability or version changes.

The `0.1.x` to `0.2.x` upgrade removes Task, project manifests, local reviews, feedback stores, and handoff files. Run `legacy-cleanup` preview against the project, show exact files/count/bytes and its unrecoverable flag, collect confirmation, then apply with the same preview fingerprint. Do not preserve or translate `.zipzap/`; Git Checkpoint is the new durable handoff source.

Release readiness requires a clean committed source revision and a matching version tag. `release:bundle` runs tests, validation, build, dist verification, deterministic inventory comparison, and package creation; it neither pushes nor publishes.
