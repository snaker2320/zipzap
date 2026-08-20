import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyDocumentMaintenance,
  planDocumentMaintenance
} from "../scripts/lib/document-routing.mjs";
import { loadCatalogs } from "../scripts/zipzap.mjs";

function project(context) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-maintenance-"));
  context.after(() => {
    const stateDirectory = path.join(root, ".zipzap");
    if (fs.existsSync(stateDirectory)) fs.chmodSync(stateDirectory, 0o755);
    fs.rmSync(root, { recursive: true, force: true });
  });
  return root;
}

function sha256(content) {
  return `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
}

function manifest(sources = [], routes = []) {
  return {
    schema_version: 1,
    project_id: "example",
    revision: 3,
    sources,
    document_routing: {
      strategy: "preserve-existing",
      on_ambiguity: "decision-required",
      on_mismatch: "approval-required",
      routes
    }
  };
}

function source(overrides = {}) {
  return {
    id: "business-quotation",
    locator: "docs/business/quotation.md",
    topics: ["domain-and-business"],
    document_kind: "business-capability",
    status: "active",
    version: null,
    relations: { derived_from: [], references: [], supersedes: [] },
    ...overrides
  };
}

function writeManifest(root, value) {
  fs.mkdirSync(path.join(root, ".zipzap"), { recursive: true });
  fs.writeFileSync(
    path.join(root, ".zipzap", "project.json"),
    `${JSON.stringify(value, null, 2)}\n`
  );
}

function baseInput(root, value, overrides = {}) {
  return {
    schema_version: 1,
    operation: "create",
    project: { locator: root },
    manifest: value,
    manifest_locator: ".zipzap/project.json",
    ...overrides
  };
}

test("previews a routed create without mutating the project", (context) => {
  const root = project(context);
  const value = manifest([], [
    {
      id: "business",
      document_kinds: ["business-capability"],
      target: "knowledge/business",
      priority: 100
    }
  ]);
  const input = baseInput(root, value, {
    source: source(),
    document: {
      filename: "quotation.md",
      content: "# Quotation\n\n## Business boundary\n"
    }
  });

  const preview = planDocumentMaintenance(input);

  assert.equal(preview.status, "ready");
  assert.match(preview.preview_fingerprint, /^sha256:[a-f0-9]{64}$/);
  assert.equal(preview.file_mutations[0].action, "create");
  assert.equal(preview.file_mutations[0].locator, "knowledge/business/quotation.md");
  assert.deepEqual(preview.directories, ["knowledge/business"]);
  assert.equal(preview.manifest_change.before_revision, 3);
  assert.equal(preview.manifest_change.after_revision, 4);
  assert.equal(preview.manifest_change.source.locator, "knowledge/business/quotation.md");
  assert.match(preview.manifest_change.source.version, /^sha256:[a-f0-9]{64}$/);
  assert.equal(fs.existsSync(path.join(root, "knowledge")), false);

  const ambiguous = planDocumentMaintenance({
    ...input,
    manifest: manifest([], [
      {
        id: "business-a",
        document_kinds: ["business-capability"],
        target: "docs/business-a",
        priority: 100
      },
      {
        id: "business-b",
        document_kinds: ["business-capability"],
        target: "docs/business-b",
        priority: 100
      }
    ])
  });
  assert.equal(ambiguous.status, "decision-required");
  assert.equal(ambiguous.file_mutations.length, 0);
});

test("previews move repairs and delete inbound relations without writing", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "docs", "business"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "design", "active"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "business", "quotation.md"), "# Quotation\n");
  fs.writeFileSync(
    path.join(root, "docs", "design", "active", "DEM-1.md"),
    "See docs/business/quotation.md#business-rules\n"
  );
  const business = source({ version: sha256("# Quotation\n") });
  const design = source({
    id: "design-dem-1",
    locator: "docs/design/active/DEM-1.md",
    document_kind: "development-design",
    topics: ["requirements"],
    version: sha256("See docs/business/quotation.md#business-rules\n"),
    relations: {
      derived_from: [],
      references: ["business-quotation"],
      supersedes: []
    }
  });
  const value = manifest([business, design]);

  const move = planDocumentMaintenance(
    baseInput(root, value, {
      operation: "move",
      source_id: "business-quotation",
      expected_version: business.version,
      target_locator: "docs/business/quoting.md",
      reference_repairs: [
        {
          source_id: "design-dem-1",
          from: "docs/business/quotation.md",
          to: "docs/business/quoting.md",
          expected_count: 1
        }
      ]
    })
  );
  assert.equal(move.status, "ready");
  assert.equal(move.reference_repairs.length, 1);
  assert.equal(move.file_mutations[0].action, "move");
  assert.equal(
    fs.readFileSync(path.join(root, design.locator), "utf8"),
    "See docs/business/quotation.md#business-rules\n"
  );

  const deletion = planDocumentMaintenance(
    baseInput(root, value, {
      operation: "delete",
      source_id: "business-quotation",
      expected_version: business.version
    })
  );
  assert.equal(deletion.status, "approval-required");
  assert.deepEqual(deletion.inbound_relations, [
    {
      source_id: "design-dem-1",
      relation: "references"
    }
  ]);
  assert.equal(fs.existsSync(path.join(root, source().locator)), true);
});

test("applies authorized create and edit while refreshing manifest versions", (context) => {
  const root = project(context);
  const initial = manifest();
  writeManifest(root, initial);
  const createInput = baseInput(root, initial, {
    source: source(),
    document: { filename: "quotation.md", content: "# Quotation\n" }
  });
  const createPreview = planDocumentMaintenance(createInput);

  const created = applyDocumentMaintenance({
    ...createInput,
    confirmation: {
      approved: true,
      preview_fingerprint: createPreview.preview_fingerprint
    }
  });

  assert.equal(created.status, "completed");
  assert.equal(fs.readFileSync(path.join(root, source().locator), "utf8"), "# Quotation\n");
  const afterCreate = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap", "project.json"), "utf8")
  );
  assert.equal(afterCreate.revision, 4);
  assert.equal(afterCreate.sources[0].id, "business-quotation");
  assert.match(afterCreate.sources[0].version, /^sha256:[a-f0-9]{64}$/);

  const editInput = baseInput(root, afterCreate, {
    operation: "edit",
    source_id: "business-quotation",
    expected_version: afterCreate.sources[0].version,
    content: "# Quotation\n\n## Business rules\n- Price expires.\n"
  });
  const editPreview = planDocumentMaintenance(editInput);
  const edited = applyDocumentMaintenance({
    ...editInput,
    confirmation: {
      approved: true,
      preview_fingerprint: editPreview.preview_fingerprint
    }
  });
  assert.equal(edited.status, "completed");
  const afterEdit = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap", "project.json"), "utf8")
  );
  assert.equal(afterEdit.revision, 5);
  assert.notEqual(afterEdit.sources[0].version, afterCreate.sources[0].version);
});

test("moves only declared references and deletes only after explicit approval", (context) => {
  const root = project(context);
  fs.mkdirSync(path.join(root, "docs", "business"), { recursive: true });
  fs.mkdirSync(path.join(root, "docs", "design", "active"), { recursive: true });
  fs.writeFileSync(path.join(root, "docs", "business", "quotation.md"), "# Quotation\n");
  fs.writeFileSync(
    path.join(root, "docs", "design", "active", "DEM-1.md"),
    "See docs/business/quotation.md\n"
  );
  fs.writeFileSync(path.join(root, "unregistered.md"), "docs/business/quotation.md\n");
  const business = source({ version: sha256("# Quotation\n") });
  const design = source({
    id: "design-dem-1",
    locator: "docs/design/active/DEM-1.md",
    document_kind: "development-design",
    topics: ["requirements"],
    version: sha256("See docs/business/quotation.md\n"),
    relations: { derived_from: [], references: [business.id], supersedes: [] }
  });
  const initial = manifest([business, design]);
  writeManifest(root, initial);
  const moveInput = baseInput(root, initial, {
    operation: "move",
    source_id: business.id,
    expected_version: business.version,
    target_locator: "docs/business/quoting.md",
    reference_repairs: [
      {
        source_id: design.id,
        from: business.locator,
        to: "docs/business/quoting.md",
        expected_count: 1
      }
    ]
  });
  const movePreview = planDocumentMaintenance(moveInput);
  const moved = applyDocumentMaintenance({
    ...moveInput,
    confirmation: { approved: true, preview_fingerprint: movePreview.preview_fingerprint }
  });
  assert.equal(moved.status, "completed");
  assert.equal(fs.existsSync(path.join(root, business.locator)), false);
  assert.equal(fs.existsSync(path.join(root, "docs/business/quoting.md")), true);
  assert.match(
    fs.readFileSync(path.join(root, design.locator), "utf8"),
    /docs\/business\/quoting\.md/
  );
  assert.equal(
    fs.readFileSync(path.join(root, "unregistered.md"), "utf8"),
    "docs/business/quotation.md\n"
  );

  const afterMove = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap", "project.json"), "utf8")
  );
  const deleteInput = baseInput(root, afterMove, {
    operation: "delete",
    source_id: business.id,
    expected_version: afterMove.sources.find((item) => item.id === business.id).version
  });
  const deletePreview = planDocumentMaintenance(deleteInput);
  assert.throws(
    () =>
      applyDocumentMaintenance({
        ...deleteInput,
        confirmation: {
          approved: true,
          preview_fingerprint: deletePreview.preview_fingerprint
        }
      }),
    /delete approval/i
  );
  const deleted = applyDocumentMaintenance({
    ...deleteInput,
    confirmation: {
      approved: true,
      delete_approved: true,
      preview_fingerprint: deletePreview.preview_fingerprint
    }
  });
  assert.equal(deleted.status, "completed");
  const afterDelete = JSON.parse(
    fs.readFileSync(path.join(root, ".zipzap", "project.json"), "utf8")
  );
  assert.equal(afterDelete.sources.some((item) => item.id === business.id), false);
  assert.deepEqual(afterDelete.sources[0].relations.references, []);
});

test("rejects stale confirmation and reports registry reconciliation after partial failure", (context) => {
  const root = project(context);
  const initial = manifest();
  writeManifest(root, initial);
  const input = baseInput(root, initial, {
    source: source(),
    document: { filename: "quotation.md", content: "# Quotation\n" }
  });
  const preview = planDocumentMaintenance(input);

  assert.throws(
    () =>
      applyDocumentMaintenance({
        ...input,
        confirmation: { approved: true, preview_fingerprint: sha256("stale") }
      }),
    /preview fingerprint/i
  );

  fs.chmodSync(path.join(root, ".zipzap"), 0o555);
  context.after(() => {
    if (fs.existsSync(path.join(root, ".zipzap"))) {
      fs.chmodSync(path.join(root, ".zipzap"), 0o755);
    }
  });
  const result = applyDocumentMaintenance({
    ...input,
    confirmation: { approved: true, preview_fingerprint: preview.preview_fingerprint }
  });
  assert.equal(result.status, "blocked");
  assert.equal(result.document_state, "changed");
  assert.equal(result.registry_state, "unchanged");
  assert.ok(result.reconciliation_steps.length >= 2);
});

test("loads document maintenance schemas through the catalog", () => {
  const catalogs = loadCatalogs();
  assert.equal(
    catalogs.schemas.documentMaintenanceInput.title,
    "ZipZap Document Maintenance Input"
  );
  assert.equal(
    catalogs.schemas.documentMaintenanceOutput.title,
    "ZipZap Document Maintenance Output"
  );
});
