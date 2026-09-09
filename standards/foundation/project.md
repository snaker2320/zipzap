# ZipZap project standard

ZipZap is a Node.js ESM Skill packaged as a self-contained `dist/skill` directory. Machine-authoritative built-ins live in `config/*.yml`; public input contracts live in `schemas/*.schema.yml`; CLI output is JSON.

The installed Skill owns standards routing, built-in gates, Work/Feedback/Maintenance Loops, problem-item consolidation, and Git Checkpoint Handoff. Project-specific authority remains in `standards/`; no project manifest or committed ZipZap runtime state is allowed.

Keep implementation changes bounded and preserve truthful distinctions between implementation, focused checks, full verification, review, publication, and production readiness.
