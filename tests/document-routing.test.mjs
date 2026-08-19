import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  inferDocumentKind,
  resolveDocumentRoute
} from "../scripts/lib/document-routing.mjs";
import { loadCatalogs } from "../scripts/zipzap.mjs";

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-route-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function manifest(routes = []) {
  return {
    schema_version: 1,
    project_id: "example",
    sources: [],
    document_routing: {
      strategy: "preserve-existing",
      on_ambiguity: "decision-required",
      on_mismatch: "approval-required",
      routes
    }
  };
}

function request(projectRoot, overrides = {}) {
  return {
    schema_version: 1,
    project: { locator: projectRoot },
    manifest: manifest(),
    document: {
      document_kind: "development-design",
      filename: "DEM-123-close-position.md"
    },
    inferred_routes: [],
    ...overrides
  };
}

test("uses an explicit user target as a one-time route exception", (context) => {
  const result = resolveDocumentRoute(
    request(project(context), { user_target: "custom/design" })
  );

  assert.equal(result.status, "ready");
  assert.equal(result.route.target, "custom/design");
  assert.equal(result.route.origin, "user");
  assert.equal(result.route.one_time_exception, true);
  assert.equal(result.registry_change.update_default, false);
});

test("prefers a project route over inferred and default routes", (context) => {
  const root = project(context);
  const result = resolveDocumentRoute(
    request(root, {
      manifest: manifest([
        {
          id: "project-design",
          document_kinds: ["development-design"],
          target: "specs/active",
          priority: 20
        }
      ]),
      inferred_routes: [
        {
          id: "inferred-design",
          document_kinds: ["development-design"],
          target: "docs/rfcs",
          priority: 100
        }
      ]
    })
  );

  assert.equal(result.route.target, "specs/active");
  assert.equal(result.route.origin, "project");
});

test("uses a coherent inferred convention before the default", (context) => {
  const result = resolveDocumentRoute(
    request(project(context), {
      inferred_routes: [
        {
          id: "inferred-design",
          document_kinds: ["development-design"],
          target: "docs/rfcs",
          priority: 10
        }
      ]
    })
  );

  assert.equal(result.route.target, "docs/rfcs");
  assert.equal(result.route.origin, "inferred");
});

test("uses a lazy ZipZap default without creating its directory", (context) => {
  const root = project(context);
  const result = resolveDocumentRoute(request(root));

  assert.equal(result.route.target, "docs/design/active");
  assert.equal(result.route.origin, "default");
  assert.equal(
    result.route.resolved_path,
    "docs/design/active/DEM-123-close-position.md"
  );
  assert.deepEqual(result.registry_change.directories, ["docs/design/active"]);
  assert.equal(fs.existsSync(path.join(root, "docs", "design", "active")), false);
});

test("pauses when equally ranked project routes remain ambiguous", (context) => {
  const root = project(context);
  const result = resolveDocumentRoute(
    request(root, {
      manifest: manifest([
        {
          id: "design-a",
          document_kinds: ["development-design"],
          target: "docs/design-a",
          priority: 10
        },
        {
          id: "design-b",
          document_kinds: ["development-design"],
          target: "docs/design-b",
          priority: 10
        }
      ])
    })
  );

  assert.equal(result.status, "decision-required");
  assert.equal(result.route, null);
  assert.deepEqual(result.candidates.map((item) => item.id), [
    "design-a",
    "design-b"
  ]);
  assert.equal(result.decisions_required.length, 1);
});

test("rejects a target that escapes the project root", (context) => {
  assert.throws(
    () =>
      resolveDocumentRoute(
        request(project(context), { user_target: "../../outside" })
      ),
    /escapes project root/
  );
});

test("infers compact document kinds from established paths", () => {
  assert.equal(
    inferDocumentKind("docs/business/close-position.md"),
    "business-capability"
  );
  assert.equal(
    inferDocumentKind("docs/architecture/decisions/ADR-001.md"),
    "architecture-decision"
  );
  assert.equal(inferDocumentKind("docs/random.md"), "project-reference");
});

test("exposes document routing through schemas, help, example, and execution", (context) => {
  const root = project(context);
  const help = execFileSync(
    process.execPath,
    ["scripts/zipzap.mjs", "document-route", "--help"],
    { encoding: "utf8" }
  );
  assert.match(help, /schemas\/document-route-input\.schema\.json/);

  const example = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/zipzap.mjs", "document-route", "--example", "--compact"],
      { encoding: "utf8" }
    )
  );
  example.project.locator = root;
  const output = JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/zipzap.mjs", "document-route", "--compact"],
      { encoding: "utf8", input: JSON.stringify(example) }
    )
  );

  assert.equal(output.status, "ready");
  assert.equal(output.route.target, "docs/design/active");
  const catalogs = loadCatalogs();
  assert.equal(
    catalogs.schemas.documentRouteInput.title,
    "ZipZap Document Route Input"
  );
  assert.equal(
    catalogs.schemas.documentRouteOutput.title,
    "ZipZap Document Route Output"
  );
});
