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
- package paths, hashes, required files, interfaces, and a self-contained
  bundled artifact that needs no install-time package resolution;
- catalog and schema integrity;
- byte-for-byte preservation of a supplied project manifest snapshot;
- current project-manifest compatibility;
- registered source availability and staleness;
- presence of visible core onboarding preferences.

Treat missing project configuration as a First Run route, missing preferences
as an onboarding route, and changed sources as a refresh route. These routes
are follow-up actions, not reasons to mutate project state during Skill
installation.

## Source and artifact boundary

Repository development uses the locked npm dependencies declared in
`package.json`. Build with `npm run build`; only `dist/skill` is a Skill package.
Local installation, upgrade, verification, release inventory, and publication
must operate on that directory. The two installed entry points remain
`node scripts/zipzap.mjs` and `node scripts/task.mjs`, relative to the installed
Skill root. Do not copy repository source scripts or `node_modules` into an
installation, and do not run `npm install` there.

Do not commit `dist/` or publish ZipZap to the npm registry. Build a release
bundle only from a clean, committed Git revision whose matching `v<version>`
tag points to `HEAD`, using `npm run release:bundle`. Publish the generated
Skill archive, release manifest, and `SHA256SUMS` as GitHub Release assets for
that tag. Treat GitHub as the distribution channel only; the release manifest
remains the authority for the installed package inventory.

The `0.1.1-beta.5` release advertises L5 and Kernel interface version 2. When
upgrading from `0.1.1-beta.4`, preserve the existing Manifest byte-for-byte,
then route Manifest v1 projects to Initialize discovery, preview, and confirmed
reinitialization. There is no in-place conversion or dual-read execution path.

## Rollback

Require a recoverable Skill backup, a registered older release, compatible
host behavior, and preserved project-owned state. Never roll back by deleting
or replacing `.zipzap/`.
