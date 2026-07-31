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
  assert.equal(
    result.initialization.sources.find(
      (source) => source.locator === "AGENTS.md"
    ).id,
    "repository-instructions"
  );
  assert.deepEqual(
    result.initialization.coverage[0].covered_topics.sort(),
    ["coding", "repository-instructions"]
  );
  assert.equal(
    fs.existsSync(path.join(projectRoot, ".zipzap", "project.json")),
    false
  );
});

test("keeps discovered Unicode source locators and generates unique stable IDs", (context) => {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "zipzap-unicode-discover-")
  );
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  fs.mkdirSync(path.join(projectRoot, "docs"), { recursive: true });
  const locators = [
    "docs/2026-07-16-需求.md",
    "docs/2026-07-16-缺陷.md",
    "docs/2026-07-16-技术债.md"
  ];
  const expectedIds = new Map([
    [locators[0], "source-docs-2026-07-16-d6c374ec1ba7"],
    [locators[1], "source-docs-2026-07-16-964b460965aa"],
    [locators[2], "source-docs-2026-07-16-cf841833689c"]
  ]);
  for (const locator of locators) {
    fs.writeFileSync(path.join(projectRoot, locator), `# ${locator}\n`);
  }
  const request = {
    schema_version: 1,
    operation: "initialize",
    project: {
      id: "example",
      locator: projectRoot
    },
    initialization: {
      action: "discover",
      persistence: "project"
    }
  };

  const first = initializeProject(request, catalogs);
  const second = initializeProject(request, catalogs);
  const firstSources = first.initialization.sources;
  const secondIdsByLocator = new Map(
    second.initialization.sources.map((source) => [source.locator, source.id])
  );

  assert.deepEqual(
    firstSources.map((source) => source.locator).sort(),
    [...locators].sort()
  );
  assert.equal(new Set(firstSources.map((source) => source.id)).size, 3);
  for (const source of firstSources) {
    assert.equal(source.id, expectedIds.get(source.locator));
    assert.equal(secondIdsByLocator.get(source.locator), source.id);
  }

  const configured = initializeProject(
    {
      ...request,
      initialization: {
        action: "configure",
        persistence: "project"
      }
    },
    catalogs
  );
  assert.equal(configured.status, "completed");
  const stored = JSON.parse(
    fs.readFileSync(path.join(projectRoot, ".zipzap", "project.json"), "utf8")
  );
  assert.deepEqual(
    stored.sources.map((source) => source.locator).sort(),
    [...locators].sort()
  );
  assert.equal(new Set(stored.sources.map((source) => source.id)).size, 3);
});

test("configures project source registry and project Task storage", (context) => {
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
  assert.equal(stored.sources[0].id, "development-standard");
  assert.equal(stored.sources[0].locator, "docs/standards/development.md");
  assert.equal(
    fs.existsSync(path.join(projectRoot, ".zipzap", "tasks")),
    true
  );
  for (const directory of ["events", "reviews", "feedback", "reports"]) {
    assert.equal(
      fs.existsSync(path.join(projectRoot, ".zipzap", directory)),
      true
    );
  }
  assert.match(
    fs.readFileSync(path.join(projectRoot, ".zipzap", ".gitignore"), "utf8"),
    /\/reports\//
  );
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
  assert.deepEqual(catalogs.taskPolicy.task_standard.creation_statuses, [
    "ready",
    "blocked"
  ]);
  assert.equal(
    catalogs.taskPolicy.local_store.event_format,
    "one-json-file-per-event"
  );
  assert.equal(
    catalogs.schemas.feedback.title,
    "ZipZap Feedback Record"
  );
});
