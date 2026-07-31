# Lifecycle Checks

Load this reference when installing, upgrading, verifying, or rolling back
ZipZap. Use `config/lifecycle.json` and the lifecycle input and output schemas
as machine authority.

## Installation

Keep package installation separate from project initialization. Verify host
conformance and the target version, let the installer own mutation, then route
each new project to `first-run`.

## Upgrade

Use this sequence:

1. Build or obtain the expected target release manifest.
2. Run lifecycle operation `upgrade` with the installed version, target
   version, host conformance, and optional project locator.
3. Retain `project_check.manifest_sha256` for each inspected project.
4. Let the installer perform the authorized, recoverable Skill mutation.
5. Run lifecycle operation `verify-upgrade` with the expected release
   manifest and each retained `previous_project_manifest_sha256`.
6. Follow `next_actions` without silently changing project state.

The post-upgrade check validates:

- installed version and channel through release metadata;
- package paths, hashes, required files, interfaces, and zero dependencies;
- catalog and schema integrity;
- byte-for-byte preservation of a supplied project manifest snapshot;
- current project-manifest compatibility;
- registered source availability and staleness;
- presence of visible core onboarding preferences.

Treat missing project configuration as a First Run route, missing preferences
as an onboarding route, and changed sources as a refresh route. These routes
are follow-up actions, not reasons to mutate project state during Skill
installation.

## Rollback

Require a recoverable Skill backup, a registered older release, compatible
host behavior, and preserved project-owned state. Never roll back by deleting
or replacing `.zipzap/`.
