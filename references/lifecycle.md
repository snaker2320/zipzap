# Installation, upgrade, and release

Build bundles the CLI and its YAML parser into `dist/skill`; installed copies have no `node_modules` and never install packages. Installation and project initialization are separate.

Installation or upgrade records Host multi-Agent capability in `~/.cache/zipzap/host-capabilities.json` (or `--cache-root`) with an atomic replacement. The installer supplies `--host-multi-agent full|disabled|unavailable|unknown` and may record `--host-version`. `full` enables multi-Agent work by default. `disabled` records available stable identity and Handoff acknowledgement while leaving the default policy off, so a Work may explicitly opt in. `unavailable` and `unknown` fail conservatively when independent checks or ownership transfer need another Agent. If the option is omitted, preserve the existing profile; refresh it when Host capability or version changes.

The `0.1.x` to `0.2.x` upgrade removes Task, project manifests, local reviews, feedback stores, and handoff files. Run `legacy-cleanup` preview against the project, show exact files/count/bytes and its unrecoverable flag, collect confirmation, then apply with the same preview fingerprint. Do not preserve or translate `.zipzap/`; Git Checkpoint is the new durable handoff source.

Release readiness requires a clean committed source revision and a matching version tag. `release:bundle` runs tests, validation, build, dist verification, deterministic inventory comparison, and package creation; it neither pushes nor publishes.
