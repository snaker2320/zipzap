# ZipZap project standard

ZipZap is a Node.js ESM Skill packaged as a self-contained `dist/skill` directory. Machine-authoritative built-ins live in `config/*.yml`; public input contracts live in `schemas/*.schema.yml`; CLI output is JSON.

This repository's project-specific authority remains in `standards/`, directly accessible through `AGENTS.md` without installing ZipZap. Build and test commands belong to `package.json`. No project manifest or committed ZipZap runtime state is required.

ZipZap provides optional standards and document assistance. Gate, Work/Feedback/Maintenance and Git Handoff apply to governed delivery when requested or required by project policy. Installing or removing the Skill must not rewrite project instructions, relocate rules or waive required delivery checks.

Keep implementation changes bounded and preserve truthful distinctions between implementation, focused checks, full verification, review, publication, and production readiness.
