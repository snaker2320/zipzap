# Repository Guidelines

## Project Structure & Module Organization

ZipZap is a Node.js ESM project using Commander, Ajv, and an esbuild release pipeline. `scripts/zipzap.mjs` is the main collaboration and lifecycle CLI; `scripts/task.mjs` handles local Task, Git, review, reporting, and progress streaming. Shared implementation modules belong in `scripts/lib/`. Machine-authoritative catalogs live in `config/`, while JSON contracts live in `schemas/`. Keep runnable payloads in `examples/`, semantic guidance in `references/`, longer designs and plans in `docs/`, and skill metadata in `agents/`. Tests are under `tests/`, with reusable inputs in `tests/fixtures/`. Project-owned runtime state is stored under `.zipzap/`; do not mix it with installed-skill state. Only `dist/skill` is installable or publishable.

## Build, Test, and Development Commands

Run `npm ci` before source development. Source dependencies are locked and bundled; an installed Skill must not run `npm install`.

- `npm test` runs the complete test suite.
- `node --test tests/task-cli.test.mjs` runs one test file while iterating.
- `node scripts/zipzap.mjs validate --compact` validates catalogs, schemas, and lifecycle policy.
- `node scripts/zipzap.mjs --help` and `node scripts/task.mjs --help` list supported CLI operations.
- `npm run build` bundles both CLIs and copies the Skill payload to `dist/skill`.
- `npm run test:dist` verifies the installed-artifact interface.
- `npm run release:plan` builds `dist/skill` and generates its deterministic release inventory.
- `npm run release:bundle` runs every release gate from a clean Git worktree and creates GitHub Release assets under `dist/release/<version>/`.

## Coding Style & Naming Conventions

Use two-space indentation, semicolons, double quotes, and explicit `node:` imports in `.mjs` files. Follow existing naming: `camelCase` for functions and variables, `UPPER_SNAKE_CASE` for constants, and kebab-case for identifiers and filenames. JSON fields use snake_case where established by the schemas. No formatter or linter is configured, so match nearby code and keep diffs focused. Preserve structured CLI errors with stable codes, messages, hints, and help paths.

## Testing Guidelines

Tests use `node:test` and `node:assert/strict`; name files `*.test.mjs` and describe observable behavior in each `test(...)` title. Add contract, CLI, and regression coverage whenever changing `config/`, `schemas/`, or public commands. Update representative examples when payload shapes change. No numeric coverage threshold is enforced, but every change should pass the full suite and validation command.

## Commit & Pull Request Guidelines

Recent history uses concise, imperative Conventional Commit-style subjects such as `feat(kernel): ...`, `fix: ...`, `test: ...`, `docs: ...`, `refactor(...)`, and `chore(...)`. Keep commits single-purpose; add a `ZipZap-Task: <task-id>` trailer when associating tracked work. Pull requests should explain behavior and contract changes, link the relevant issue or Task, list verification commands and results, and call out schema or migration impact. Include screenshots only for visible UI or rendered-document changes.

Do not commit `dist/`. Build release assets only from a clean, committed source revision whose matching `v<version>` tag points to `HEAD`. Publish the generated archive, release manifest, and `SHA256SUMS` as GitHub Release assets; do not publish ZipZap to the npm registry.

## Agent-Specific Instructions

Treat `config/*.json` and `schemas/*.json` as authority. Use `SKILL.md` to route to only the references needed for the active decision. Do not claim tests, review, acceptance, or release readiness without recorded evidence.
