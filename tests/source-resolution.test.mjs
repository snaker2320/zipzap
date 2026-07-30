import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  initializeProject,
  loadCatalogs,
  resolveSources
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();

function manifest(overrides = {}) {
  return {
    schema_version: 1,
    project_id: "example",
    sources: [
      {
        id: "repository-instructions",
        locator: "AGENTS.md",
        kind: "instructions",
        format: "markdown",
        loading: "host-managed",
        topics: ["repository-instructions"],
        priority: 100,
        version: "sha256:instructions"
      },
      {
        id: "development-standard",
        locator: "docs/standards/development.md",
        kind: "standard",
        format: "markdown",
        loading: "on-demand",
        topics: ["coding", "testing"],
        selectors: {
          roles: ["developer", "tester"]
        },
        version: "sha256:development"
      }
    ],
    persistence: {
      adapter: "local-json",
      locator: ".zipzap/tasks"
    },
    ...overrides
  };
}

test("resolves host-preloaded instructions without loading them twice", () => {
  const result = resolveSources({
    schema_version: 1,
    manifest: manifest(),
    query: {
      topics: ["repository-instructions", "coding"],
      selectors: {
        roles: ["developer"]
      }
    },
    observations: [
      {
        source_id: "repository-instructions",
        availability: "available",
        preloaded: true,
        version: "sha256:instructions"
      }
    ]
  });

  assert.equal(result.status, "ready");
  assert.equal(result.matches.length, 2);
  assert.equal(
    result.matches.find(
      (source) => source.source_id === "repository-instructions"
    ).load_required,
    false
  );
  assert.deepEqual(
    result.coverage.map((item) => item.status),
    ["host-preloaded", "covered"]
  );
});

test("makes missing-source policy explicit", () => {
  const input = {
    schema_version: 1,
    manifest: manifest(),
    query: {
      topics: ["legal-and-compliance"],
      on_missing: "allow-with-limitation"
    }
  };
  const allowed = resolveSources(input);
  assert.equal(allowed.status, "ready");
  assert.deepEqual(allowed.limitations, [
    "legal-and-compliance: missing"
  ]);

  input.query.on_missing = "block";
  assert.equal(resolveSources(input).status, "blocked");
});

test("marks a changed registered source as stale", () => {
  const result = resolveSources({
    schema_version: 1,
    manifest: manifest(),
    query: {
      topics: ["coding"],
      selectors: {
        roles: ["developer"]
      }
    },
    observations: [
      {
        source_id: "development-standard",
        availability: "available",
        version: "sha256:changed"
      }
    ]
  });
  assert.equal(result.status, "decision-required");
  assert.equal(result.coverage[0].status, "stale");
  assert.equal(result.matches[0].load_required, false);
});

test("discovers sources read-only and reports role coverage", (context) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-discover-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, "docs", "standards"), {
    recursive: true
  });
  fs.writeFileSync(
    path.join(projectRoot, "AGENTS.md"),
    "# Project instructions\n"
  );
  fs.writeFileSync(
    path.join(projectRoot, "docs", "standards", "development.md"),
    "# Development standard\n"
  );

  const result = initializeProject(
    {
      schema_version: 1,
      operation: "initialize",
      project: {
        id: "example",
        locator: projectRoot
      },
      initialization: {
        action: "discover",
        persistence: "project",
        enabled_roles: ["developer"]
      }
    },
    catalogs
  );

  assert.equal(result.status, "completed");
  assert.equal(result.initialization.persistence, "session");
  assert.equal(result.initialization.write_performed, false);
  assert.equal(result.initialization.sources.length, 2);
  assert.deepEqual(
    result.initialization.coverage[0].covered_topics.sort(),
    ["coding", "repository-instructions"]
  );
  assert.equal(
    fs.existsSync(path.join(projectRoot, ".zipzap", "project.json")),
    false
  );
});

test("configures local source registry and local Task storage", (context) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-configure-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, "docs", "standards"), {
    recursive: true
  });
  fs.writeFileSync(
    path.join(projectRoot, "docs", "standards", "development.md"),
    "# Development standard\n"
  );

  const result = initializeProject(
    {
      schema_version: 1,
      operation: "initialize",
      project: {
        id: "example",
        locator: projectRoot
      },
      initialization: {
        action: "configure",
        persistence: "project",
        enabled_roles: ["developer"],
        preferences: {
          preferred_preset: "auto",
          personalization: {
            response_detail: "balanced",
            humor: "light"
          }
        },
        sources: [
          {
            id: "development-standard",
            locator: "docs/standards/development.md",
            kind: "standard",
            format: "markdown",
            loading: "on-demand",
            topics: ["coding", "testing"]
          }
        ]
      }
    },
    catalogs
  );

  assert.equal(result.status, "completed");
  assert.equal(result.initialization.write_performed, true);
  const stored = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".zipzap", "project.json"), "utf8")
  );
  assert.equal(stored.persistence.adapter, "local-json");
  assert.equal(stored.persistence.locator, ".zipzap/tasks");
  assert.equal(stored.revision, 1);
  assert.equal(stored.collaboration.preferred_preset, "auto");
  assert.equal(
    stored.collaboration.personalization.response_detail,
    "balanced"
  );
  assert.equal(stored.sources[0].locator, "docs/standards/development.md");
  assert.equal(
    fs.existsSync(path.join(projectRoot, ".zipzap", "tasks")),
    true
  );
  for (const directory of ["events", "reviews", "reports"]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, ".zipzap", directory)),
      true
    );
  }
  assert.equal(
    fs.existsSync(
      path.join(projectRoot, ".zipzap", "standards", "development.md")
    ),
    false
  );
});

test("refreshes hashes without copying source content", (context) => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-refresh-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  const sourcePath = path.join(projectRoot, "docs", "security.md");
  fs.writeFileSync(sourcePath, "# Security\nFirst version.\n");

  const configureRequest = {
    schema_version: 1,
    operation: "initialize",
    project: {
      id: "example",
      locator: projectRoot
    },
    initialization: {
      action: "configure",
      persistence: "project",
      sources: [
        {
          id: "security-standard",
          locator: "docs/security.md",
          kind: "standard",
          format: "markdown",
          loading: "on-demand",
          topics: ["security"]
        }
      ]
    }
  };
  const configured = initializeProject(configureRequest, catalogs);
  const firstVersion = configured.initialization.sources[0].version;

  fs.writeFileSync(sourcePath, "# Security\nSecond version.\n");
  const refreshed = initializeProject(
    {
      ...configureRequest,
      initialization: {
        action: "refresh",
        persistence: "project"
      }
    },
    catalogs
  );

  assert.equal(refreshed.status, "completed");
  assert.equal(refreshed.initialization.sources[0].status, "stale");
  assert.notEqual(
    refreshed.initialization.sources[0].version,
    firstVersion
  );
});

test("registers source-resolution schemas and local Task policy", () => {
  assert.equal(
    catalogs.schemas.sourceResolutionInput.title,
    "ZipZap Source Resolution Input"
  );
  assert.equal(
    catalogs.schemas.sourceResolutionOutput.title,
    "ZipZap Source Resolution Output"
  );
  assert.equal(catalogs.taskPolicy.local_store.adapter, "local-json");
  assert.equal(catalogs.taskPolicy.local_store.locator, ".zipzap/tasks");
});
