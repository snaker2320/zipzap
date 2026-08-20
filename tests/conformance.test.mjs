import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  assessHost,
  buildHostCapabilityMatrix,
  evaluateKernel,
  loadCatalogs,
  resolveDocumentRoute
} from "../scripts/zipzap.mjs";

const catalogs = loadCatalogs();
const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const VECTOR_DIR = path.join(TEST_DIR, "conformance");

function hostCapabilities(overrides = {}) {
  return {
    schema_version: 1,
    host_id: "test-host",
    surface: "test",
    capabilities: ["json-read"],
    limits: {
      concurrency_limit: 2,
      distinct_context_limit: 5
    },
    runtimes: [],
    tools: [],
    interfaces: {
      l5: [1],
      kernel: [1]
    },
    ...overrides
  };
}

for (const fileName of fs.readdirSync(VECTOR_DIR).sort()) {
  if (!fileName.endsWith(".json")) continue;
  const vector = JSON.parse(
    fs.readFileSync(path.join(VECTOR_DIR, fileName), "utf8")
  );
  test(`kernel conformance: ${vector.id}`, () => {
    const result = evaluateKernel(vector.request, catalogs);
    assert.equal(result.status, vector.expected.status);
    assert.equal(result.assurance.mode, vector.expected.assurance_mode);
    if (vector.expected.participant === null) {
      assert.equal(result.next_action, null);
      return;
    }
    assert.equal(
      result.next_action.participant.profile,
      vector.expected.participant.profile
    );
    assert.equal(
      result.next_action.participant.role ??
        result.next_action.participant.function,
      vector.expected.participant.assignment
    );
  });
}

test("selects the native adapter when the host exposes native execution", () => {
  const result = assessHost(
    hostCapabilities({
      capabilities: [
        "native-skill-execution",
        "json-read"
      ]
    }),
    "execute",
    null,
    catalogs
  );
  assert.equal(result.compatible, true);
  assert.equal(result.selected_adapter, "codex-native");
  assert.equal(result.fallback_used, false);
  assert.equal(result.governance_preserved, true);
  assert.equal(result.capability_matrix.assessed, true);
  assert.equal(
    result.capability_matrix.entries.find(
      (entry) => entry.id === "node-acceleration"
    ).status,
    "unavailable"
  );
});

test("selects the optional script accelerator only when Node is available", () => {
  const result = assessHost(
    hostCapabilities({
      capabilities: [
        "script-execution",
        "json-read"
      ],
      runtimes: ["node"]
    }),
    "execute",
    null,
    catalogs
  );
  assert.equal(result.compatible, true);
  assert.equal(result.selected_adapter, "script-accelerator");
  assert.equal(result.fallback_used, true);
  assert.equal(
    result.capability_matrix.entries.find(
      (entry) => entry.id === "node-acceleration"
    ).status,
    "available"
  );
});

test("reports optional Host capabilities and fallbacks explicitly", () => {
  const result = assessHost(
    hostCapabilities({
      capabilities: [
        "json-read",
        "guided-form",
        "token-usage-reporting",
        "goal-budgeting",
        "project-read",
        "project-write"
      ],
      limits: {
        concurrency_limit: 2,
        distinct_context_limit: 5,
        multi_agent_authorization: "unknown"
      }
    }),
    "execute",
    null,
    catalogs
  );
  const statuses = Object.fromEntries(
    result.capability_matrix.entries.map((entry) => [
      entry.id,
      entry.status
    ])
  );
  assert.deepEqual(statuses, {
    "multi-agent": "authorization-required",
    "guided-form": "available",
    "exact-token-telemetry": "available",
    "goal-budgeting": "available",
    "node-acceleration": "unavailable",
    "project-state": "available"
  });
});

test("keeps unknown Host capabilities safe and actionable", () => {
  const matrix = buildHostCapabilityMatrix();
  assert.equal(matrix.assessed, false);
  assert.equal(matrix.entries.length, 6);
  assert.ok(matrix.entries.every((entry) => entry.status === "unknown"));
  assert.ok(
    matrix.entries.every(
      (entry) => typeof entry.fallback === "string" && entry.fallback.length > 0
    )
  );
});

test("keeps direct JSON compatible without Node", () => {
  const result = assessHost(
    hostCapabilities(),
    "execute",
    null,
    catalogs
  );
  assert.equal(result.compatible, true);
  assert.equal(result.selected_adapter, "direct-json");
  assert.equal(result.fallback_used, true);
  assert.equal(result.governance_preserved, true);
  assert.equal(
    result.limitations.some((item) => item.includes("Node accelerator")),
    true
  );
});

test("projects route ambiguity as an active no-write decision gate", (context) => {
  const projectRoot = fs.mkdtempSync(path.join(TEST_DIR, "route-gate-"));
  context.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  const result = resolveDocumentRoute({
    schema_version: 1,
    project: { locator: projectRoot },
    manifest: {
      schema_version: 1,
      project_id: "example",
      sources: [],
      document_routing: {
        routes: [
          {
            id: "design-a",
            document_kinds: ["development-design"],
            target: "docs/design-a",
            priority: 100
          },
          {
            id: "design-b",
            document_kinds: ["development-design"],
            target: "docs/design-b",
            priority: 100
          }
        ]
      }
    },
    document: {
      document_kind: "development-design",
      filename: "DEM-1.md"
    }
  });

  assert.equal(result.status, "decision-required");
  assert.equal(result.decisions_required[0].id, "document-route-ambiguous");
  assert.equal(result.registry_change, null);
  assert.equal(fs.existsSync(path.join(projectRoot, "docs")), false);
});

test("rejects project configuration when project write is unavailable", () => {
  const result = assessHost(
    hostCapabilities({
      capabilities: [
        "json-read",
        "project-read"
      ]
    }),
    "initialize",
    "configure",
    catalogs
  );
  assert.equal(result.compatible, false);
  assert.equal(result.governance_preserved, false);
  assert.equal(result.missing_capabilities.includes("project-write"), true);
});

test("accepts either session or project state for resume", () => {
  const result = assessHost(
    hostCapabilities({
      capabilities: [
        "json-read",
        "project-state"
      ]
    }),
    "resume",
    null,
    catalogs
  );
  assert.equal(result.compatible, true);
  assert.deepEqual(result.missing_capabilities, []);
});

test("L6 schemas and compatibility policy are registered", () => {
  assert.equal(
    catalogs.schemas.hostCapabilities.title,
    "ZipZap L6 Host Capabilities"
  );
  assert.equal(
    catalogs.schemas.conformanceResult.title,
    "ZipZap L6 Conformance Result"
  );
  assert.deepEqual(catalogs.compatibility.adapter_order, [
    "codex-native",
    "script-accelerator",
    "direct-json"
  ]);
  assert.equal(
    Object.values(catalogs.compatibility.policies).every(Boolean),
    true
  );
});
