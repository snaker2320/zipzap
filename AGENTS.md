# Agent bootstrap

- Use the installed ZipZap Skill for collaboration routing, gates, loops, feedback, and Git Handoff.
- When developing this ZipZap source checkout and no installed Skill is discoverable, use this repository's `SKILL.md` and `scripts/zipzap.mjs` as the development fallback; do not copy this exception into generated project bootstraps.
- Project standards under `standards/` are authoritative for project-specific work.
- Route by the active action, changed paths, and risk; load every selected standards file in full.
- Do not bypass a blocking gate or claim unrecorded verification.
- When routing is uncertain, load `standards/foundation/project.md` and ask only for the missing decision.
- Repeated feedback may propose a merge into an existing standard. A repeated bootstrap gap may propose a minimal reviewed revision here; never append blindly or auto-edit this file.
