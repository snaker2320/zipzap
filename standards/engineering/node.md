---
priority: 10
applies_to:
  paths:
    - scripts/**
    - tests/**
    - package.json
---
# Node engineering standard

- Use Node.js 20 or newer and ESM modules.
- Use two-space indentation, semicolons, double quotes, and explicit `node:` imports.
- Keep CLI errors structured and stable.
- Use the bundled `yaml` dependency only at build/source time; installed artifacts must not run `npm install`.
- Accept JSON or YML input and emit JSON for machine consumers.
