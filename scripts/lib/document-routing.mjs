import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_ROUTES = [
  ["business-capability", "docs/business", "<capability>.md"],
  ["development-design", "docs/design/active", "<demand-id>-<slug>.md"],
  ["integration-design", "docs/design/integrations", "<slug>.md"],
  ["architecture-overview", "docs/architecture", "overview.md"],
  ["architecture-decision", "docs/architecture/decisions", "<adr-id>.md"],
  ["engineering-standard", "docs/standards", "<topic>.md"],
  ["operations-guide", "docs/operations", "<slug>.md"],
  ["governance-policy", "docs/governance", "<slug>.md"],
  ["project-reference", "docs", "<slug>.md"]
].map(([documentKind, target, filenamePattern]) => ({
  id: `default-${documentKind}`,
  document_kinds: [documentKind],
  target,
  filename_pattern: filenamePattern,
  priority: 0,
  origin: "default"
}));

function normalizeRelative(value, label) {
  const normalized = value?.replaceAll("\\", "/").replace(/\/$/, "");
  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//.test(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`${label} escapes project root`);
  }
  return normalized;
}

function containedPath(projectRoot, relative, label) {
  const resolved = path.resolve(projectRoot, relative);
  const fromRoot = path.relative(projectRoot, resolved);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new Error(`${label} escapes project root`);
  }
  const realRoot = fs.realpathSync(projectRoot);
  let existingAncestor = resolved;
  while (existingAncestor !== path.dirname(existingAncestor)) {
    try {
      fs.lstatSync(existingAncestor);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      existingAncestor = path.dirname(existingAncestor);
    }
  }
  let realAncestor;
  try {
    realAncestor = fs.realpathSync(existingAncestor);
  } catch (error) {
    throw new Error(`${label} escapes project root through an unavailable symbolic link`, {
      cause: error
    });
  }
  const fromRealRoot = path.relative(realRoot, realAncestor);
  if (fromRealRoot.startsWith("..") || path.isAbsolute(fromRealRoot)) {
    throw new Error(`${label} escapes project root through a symbolic link`);
  }
  return resolved;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function contentVersion(content) {
  return digest(content);
}

function countOccurrences(content, needle) {
  if (!needle) return 0;
  return content.split(needle).length - 1;
}

function atomicWrite(locator, content) {
  const temporary = `${locator}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, content);
    fs.renameSync(temporary, locator);
  } catch (error) {
    try {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
    } catch {
      // Preserve the original write error; reconciliation reports the target.
    }
    throw error;
  }
}

function projectContext(input, label = "document maintenance") {
  if (input?.schema_version !== 1) {
    throw new Error(`${label} schema_version must be 1`);
  }
  const projectRoot = path.resolve(input.project?.locator ?? "");
  if (!input.project?.locator || !fs.existsSync(projectRoot)) {
    throw new Error(`${label} requires an available project locator`);
  }
  if (!input.manifest || !Array.isArray(input.manifest.sources)) {
    throw new Error(`${label} requires manifest.sources`);
  }
  if (!Number.isInteger(input.manifest.revision) || input.manifest.revision < 1) {
    throw new Error(`${label} requires a positive manifest revision`);
  }
  return { projectRoot, manifest: structuredClone(input.manifest) };
}

function localSource(projectRoot, manifest, sourceId, expectedVersion) {
  const source = manifest.sources.find((candidate) => candidate.id === sourceId);
  if (!source) throw new Error(`unknown governed source: ${sourceId}`);
  if (source.loading === "external-resource" || source.format === "external") {
    throw new Error(`governed source is not a local document: ${sourceId}`);
  }
  if (typeof expectedVersion !== "string" || expectedVersion !== source.version) {
    throw new Error(`current source version is required for ${sourceId}`);
  }
  const locator = normalizeRelative(source.locator, "source locator");
  const absolute = containedPath(projectRoot, locator, "source locator");
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
    throw new Error(`governed source is unavailable: ${sourceId}`);
  }
  const content = fs.readFileSync(absolute, "utf8");
  const actualVersion = contentVersion(content);
  if (actualVersion !== expectedVersion) {
    throw new Error(`source version mismatch for ${sourceId}`);
  }
  return { source, locator, absolute, content, actualVersion };
}

function inboundRelations(manifest, sourceId) {
  const inbound = [];
  for (const source of manifest.sources) {
    for (const relation of ["derived_from", "references", "supersedes"]) {
      if (source.relations?.[relation]?.includes(sourceId)) {
        inbound.push({ source_id: source.id, relation });
      }
    }
  }
  return inbound.sort(
    (left, right) =>
      left.source_id.localeCompare(right.source_id) ||
      left.relation.localeCompare(right.relation)
  );
}

function maintenanceFingerprint(preview) {
  const copy = structuredClone(preview);
  delete copy.preview_fingerprint;
  return digest(canonical(copy));
}

function finalizePreview(preview) {
  return {
    ...preview,
    preview_fingerprint: maintenanceFingerprint(preview)
  };
}

function matches(route, document) {
  if (!route.document_kinds?.includes(document.document_kind)) return false;
  if (!route.topics?.length) return true;
  const topics = document.topics ?? [];
  return route.topics.some((topic) => topics.includes(topic));
}

function ranked(routes, origin, document) {
  return routes
    .filter((route) => matches(route, document))
    .map((route) => ({ ...structuredClone(route), origin }))
    .sort(
      (left, right) =>
        (right.priority ?? 0) - (left.priority ?? 0) ||
        left.id.localeCompare(right.id)
    );
}

export function defaultDocumentRoutes() {
  return structuredClone(DEFAULT_ROUTES);
}

export function inferDocumentKind(locator) {
  const normalized = locator.toLowerCase().replaceAll("\\", "/");
  if (/(^|\/)index\.md$/.test(normalized)) return "project-reference";
  if (/^docs\/business\/[^/]+\.md$/.test(normalized)) {
    return "business-capability";
  }
  if (/^docs\/design\/active\//.test(normalized)) {
    return "development-design";
  }
  if (/^docs\/design\/integrations\//.test(normalized)) {
    return "integration-design";
  }
  if (/^docs\/architecture\/decisions\//.test(normalized) || /(^|\/)adr(s)?\//.test(normalized)) {
    return "architecture-decision";
  }
  if (/^docs\/architecture\//.test(normalized)) {
    return "architecture-overview";
  }
  if (/^docs\/standards\//.test(normalized)) return "engineering-standard";
  if (/^docs\/operations\//.test(normalized)) return "operations-guide";
  if (/^docs\/governance\//.test(normalized)) return "governance-policy";
  return "project-reference";
}

export function inferDocumentRoutes(sources) {
  const targetsByKind = new Map();
  for (const source of sources ?? []) {
    if (
      source.format === "external" ||
      source.loading === "external-resource" ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(source.locator ?? "")
    ) {
      continue;
    }
    const documentKind =
      source.document_kind ?? inferDocumentKind(source.locator ?? "");
    if (documentKind === "project-reference") continue;
    const locator = normalizeRelative(source.locator, "source locator");
    const target = path.posix.dirname(locator);
    if (target === ".") continue;
    if (!targetsByKind.has(documentKind)) targetsByKind.set(documentKind, new Set());
    targetsByKind.get(documentKind).add(target);
  }
  return [...targetsByKind.entries()]
    .filter(([, targets]) => targets.size === 1)
    .map(([documentKind, targets]) => {
      const defaultRoute = DEFAULT_ROUTES.find((route) =>
        route.document_kinds.includes(documentKind)
      );
      return {
        id: `inferred-${documentKind}`,
        document_kinds: [documentKind],
        target: [...targets][0],
        ...(defaultRoute?.filename_pattern
          ? { filename_pattern: defaultRoute.filename_pattern }
          : {}),
        priority: 100,
        origin: "inferred"
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function resolveDocumentRoute(input) {
  if (input?.schema_version !== 1) {
    throw new Error("document route schema_version must be 1");
  }
  const projectRoot = path.resolve(input.project?.locator ?? "");
  if (!input.project?.locator || !fs.existsSync(projectRoot)) {
    throw new Error("document route requires an available project locator");
  }
  const document = input.document;
  if (!document?.document_kind || !document.filename) {
    throw new Error("document route requires document_kind and filename");
  }
  const filename = normalizeRelative(document.filename, "document filename");
  if (filename.includes("/")) {
    throw new Error("document filename must not include a directory");
  }

  let candidates;
  if (input.user_target) {
    candidates = [
      {
        id: "user-target",
        document_kinds: [document.document_kind],
        target: normalizeRelative(input.user_target, "document target"),
        priority: 0,
        origin: "user",
        one_time_exception: true
      }
    ];
  } else {
    const tiers = [
      ranked(input.manifest?.document_routing?.routes ?? [], "project", document),
      ranked(input.inferred_routes ?? [], "inferred", document),
      ranked(DEFAULT_ROUTES, "default", document)
    ];
    candidates = tiers.find((tier) => tier.length > 0) ?? [];
  }

  if (candidates.length === 0) {
    return {
      schema_version: 1,
      status: "decision-required",
      route: null,
      candidates: [],
      decisions_required: [
        {
          id: "document-route-missing",
          question: `Choose a destination for ${document.document_kind}.`
        }
      ],
      registry_change: null
    };
  }

  const highestPriority = candidates[0].priority ?? 0;
  const finalists = candidates.filter(
    (candidate) => (candidate.priority ?? 0) === highestPriority
  );
  const distinctTargets = new Set(finalists.map((candidate) => candidate.target));
  if (distinctTargets.size > 1) {
    return {
      schema_version: 1,
      status: "decision-required",
      route: null,
      candidates: finalists,
      decisions_required: [
        {
          id: "document-route-ambiguous",
          question: `Choose one destination for ${document.document_kind}.`,
          options: finalists.map((candidate) => candidate.id)
        }
      ],
      registry_change: null
    };
  }

  const selected = finalists[0];
  const target = normalizeRelative(selected.target, "document target");
  const targetPath = containedPath(projectRoot, target, "document target");
  const resolvedPath = `${target}/${filename}`;
  containedPath(projectRoot, resolvedPath, "document path");
  const directories = fs.existsSync(targetPath) ? [] : [target];
  const route = {
    ...selected,
    target,
    resolved_path: resolvedPath,
    one_time_exception: selected.origin === "user"
  };

  return {
    schema_version: 1,
    status: "ready",
    route,
    candidates: finalists,
    decisions_required: [],
    registry_change: {
      directories,
      update_default: false
    }
  };
}

export function planDocumentMaintenance(input) {
  const operation = input?.operation;
  if (!["create", "edit", "move", "delete"].includes(operation)) {
    throw new Error(`unsupported document maintenance operation: ${operation}`);
  }
  const { projectRoot, manifest } = projectContext(input);
  const base = {
    schema_version: 1,
    operation,
    status: "ready",
    file_mutations: [],
    directories: [],
    reference_repairs: [],
    inbound_relations: [],
    reference_risks: [],
    decisions_required: [],
    manifest_before_hash: digest(canonical(manifest)),
    manifest_change: {
      before_revision: manifest.revision,
      after_revision: manifest.revision + 1,
      source: null
    },
    manifest_after: null
  };

  if (operation === "create") {
    const proposed = structuredClone(input.source ?? {});
    if (!proposed.id || !proposed.document_kind || !Array.isArray(proposed.topics)) {
      throw new Error("create requires source id, document_kind, and topics");
    }
    if (manifest.sources.some((source) => source.id === proposed.id)) {
      throw new Error(`governed source already exists: ${proposed.id}`);
    }
    if (typeof input.document?.content !== "string") {
      throw new Error("create requires document.content");
    }
    const route = resolveDocumentRoute({
      schema_version: 1,
      project: input.project,
      manifest,
      document: {
        document_kind: proposed.document_kind,
        filename: input.document?.filename,
        topics: proposed.topics,
        related_source_ids: proposed.relations?.references ?? []
      },
      ...(input.user_target ? { user_target: input.user_target } : {}),
      inferred_routes: input.inferred_routes ?? []
    });
    if (route.status !== "ready") {
      return finalizePreview({
        ...base,
        status: "decision-required",
        decisions_required: route.decisions_required
      });
    }
    const locator = normalizeRelative(route.route.resolved_path, "document path");
    const absolute = containedPath(projectRoot, locator, "document path");
    if (fs.existsSync(absolute)) {
      throw new Error(`create target already exists: ${locator}`);
    }
    const registered = {
      ...proposed,
      locator,
      version: contentVersion(input.document.content)
    };
    const next = structuredClone(manifest);
    next.revision += 1;
    next.sources.push(registered);
    base.directories = route.registry_change.directories;
    base.file_mutations.push({
      action: "create",
      locator,
      content_version: registered.version
    });
    base.manifest_change.source = structuredClone(registered);
    base.manifest_after = next;
    return finalizePreview(base);
  }

  const current = localSource(
    projectRoot,
    manifest,
    input.source_id,
    input.expected_version
  );
  const next = structuredClone(manifest);
  next.revision += 1;
  const nextSource = next.sources.find((source) => source.id === input.source_id);

  if (operation === "edit") {
    if (typeof input.content !== "string") {
      throw new Error("edit requires content");
    }
    nextSource.version = contentVersion(input.content);
    base.file_mutations.push({
      action: "edit",
      locator: current.locator,
      before_version: current.actualVersion,
      content_version: nextSource.version
    });
    base.manifest_change.source = structuredClone(nextSource);
  }

  if (operation === "move") {
    const target = normalizeRelative(input.target_locator, "move target");
    const targetAbsolute = containedPath(projectRoot, target, "move target");
    if (target === current.locator) throw new Error("move target must differ from source locator");
    if (fs.existsSync(targetAbsolute)) throw new Error(`move target already exists: ${target}`);
    const targetDirectory = path.posix.dirname(target);
    if (!fs.existsSync(path.dirname(targetAbsolute))) base.directories.push(targetDirectory);
    nextSource.locator = target;
    nextSource.version = current.actualVersion;
    base.file_mutations.push({
      action: "move",
      from: current.locator,
      locator: target,
      content_version: current.actualVersion
    });
    const declared = input.reference_repairs ?? [];
    if (!Array.isArray(declared)) throw new Error("reference_repairs must be an array");
    for (const repair of declared) {
      const related = manifest.sources.find((source) => source.id === repair.source_id);
      if (!related) throw new Error(`unknown reference repair source: ${repair.source_id}`);
      const relatedLocator = normalizeRelative(related.locator, "reference source locator");
      const relatedAbsolute = containedPath(projectRoot, relatedLocator, "reference source locator");
      const content = fs.readFileSync(relatedAbsolute, "utf8");
      if (related.version && contentVersion(content) !== related.version) {
        throw new Error(`source version mismatch for ${repair.source_id}`);
      }
      const occurrences = countOccurrences(content, repair.from);
      if (!repair.from || typeof repair.to !== "string" || occurrences !== repair.expected_count) {
        throw new Error(`reference repair count mismatch for ${repair.source_id}`);
      }
      const updated = content.replaceAll(repair.from, repair.to);
      const updatedVersion = contentVersion(updated);
      const nextRelated = next.sources.find((source) => source.id === repair.source_id);
      nextRelated.version = updatedVersion;
      base.reference_repairs.push({
        source_id: repair.source_id,
        locator: relatedLocator,
        from: repair.from,
        to: repair.to,
        expected_count: repair.expected_count,
        before_version: contentVersion(content),
        after_version: updatedVersion
      });
      base.file_mutations.push({
        action: "edit-reference",
        locator: relatedLocator,
        content_version: updatedVersion
      });
    }
    const repairedIds = new Set(base.reference_repairs.map((repair) => repair.source_id));
    base.inbound_relations = inboundRelations(manifest, input.source_id);
    base.reference_risks = base.inbound_relations
      .filter((relation) => !repairedIds.has(relation.source_id))
      .map((relation) => ({
        ...relation,
        risk: "registered relation was not included in declared reference repairs"
      }));
    base.manifest_change.source = structuredClone(nextSource);
  }

  if (operation === "delete") {
    base.status = "approval-required";
    base.inbound_relations = inboundRelations(manifest, input.source_id);
    base.reference_risks = base.inbound_relations.map((relation) => ({
      ...relation,
      risk: "deleting the source removes its registry relation but cannot repair undeclared document links"
    }));
    base.decisions_required.push({
      id: "governed-document-delete",
      authority: "caller",
      question: `Approve deletion of ${input.source_id} after reviewing inbound relations.`
    });
    base.file_mutations.push({
      action: "delete",
      locator: current.locator,
      before_version: current.actualVersion
    });
    next.sources = next.sources
      .filter((source) => source.id !== input.source_id)
      .map((source) => {
        if (!source.relations) return source;
        for (const relation of ["derived_from", "references", "supersedes"]) {
          if (source.relations[relation]) {
            source.relations[relation] = source.relations[relation].filter(
              (sourceId) => sourceId !== input.source_id
            );
          }
        }
        return source;
      });
    base.manifest_change.source = null;
  }

  base.manifest_after = next;
  return finalizePreview(base);
}

export function applyDocumentMaintenance(input) {
  const confirmation = input?.confirmation;
  if (!confirmation?.approved || !confirmation.preview_fingerprint) {
    throw new Error("document maintenance requires an approved preview fingerprint");
  }
  const preview = planDocumentMaintenance(input);
  if (preview.status === "decision-required") {
    throw new Error("document route decision is required before maintenance");
  }
  if (confirmation.preview_fingerprint !== preview.preview_fingerprint) {
    throw new Error("document maintenance preview fingerprint is stale or invalid");
  }
  if (input.operation === "delete" && confirmation.delete_approved !== true) {
    throw new Error("explicit delete approval is required");
  }
  const { projectRoot } = projectContext(input);
  const manifestLocator = normalizeRelative(
    input.manifest_locator ?? ".zipzap/project.json",
    "manifest locator"
  );
  const manifestPath = containedPath(projectRoot, manifestLocator, "manifest locator");
  if (!fs.existsSync(manifestPath) || !fs.statSync(manifestPath).isFile()) {
    throw new Error(`project manifest is unavailable: ${manifestLocator}`);
  }
  const storedManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (digest(canonical(storedManifest)) !== preview.manifest_before_hash) {
    throw new Error("project manifest changed after the maintenance preview");
  }

  let documentChanged = false;
  try {
    for (const directory of preview.directories) {
      fs.mkdirSync(containedPath(projectRoot, directory, "document directory"), {
        recursive: true
      });
    }
    if (input.operation === "create") {
      const target = containedPath(
        projectRoot,
        preview.file_mutations[0].locator,
        "document path"
      );
      atomicWrite(target, input.document.content);
      documentChanged = true;
    } else if (input.operation === "edit") {
      const target = containedPath(
        projectRoot,
        preview.file_mutations[0].locator,
        "document path"
      );
      atomicWrite(target, input.content);
      documentChanged = true;
    } else if (input.operation === "move") {
      for (const repair of preview.reference_repairs) {
        const target = containedPath(projectRoot, repair.locator, "reference source locator");
        const currentContent = fs.readFileSync(target, "utf8");
        if (
          contentVersion(currentContent) !== repair.before_version ||
          countOccurrences(currentContent, repair.from) !== repair.expected_count
        ) {
          throw new Error(`reference source changed after preview: ${repair.source_id}`);
        }
        atomicWrite(target, currentContent.replaceAll(repair.from, repair.to));
        documentChanged = true;
      }
      const mutation = preview.file_mutations[0];
      fs.renameSync(
        containedPath(projectRoot, mutation.from, "move source"),
        containedPath(projectRoot, mutation.locator, "move target")
      );
      documentChanged = true;
    } else if (input.operation === "delete") {
      fs.unlinkSync(
        containedPath(projectRoot, preview.file_mutations[0].locator, "delete target")
      );
      documentChanged = true;
    }
  } catch (error) {
    return {
      schema_version: 1,
      status: "blocked",
      operation: input.operation,
      preview_fingerprint: preview.preview_fingerprint,
      document_state: documentChanged ? "partially-changed" : "unchanged",
      registry_state: "unchanged",
      error: error.message,
      reconciliation_steps: [
        "Inspect the listed file mutations and compare them with the confirmed preview.",
        "Restore or complete only the confirmed document changes, then generate a new preview."
      ]
    };
  }

  try {
    atomicWrite(manifestPath, `${JSON.stringify(preview.manifest_after, null, 2)}\n`);
  } catch (error) {
    return {
      schema_version: 1,
      status: "blocked",
      operation: input.operation,
      preview_fingerprint: preview.preview_fingerprint,
      document_state: documentChanged ? "changed" : "unchanged",
      registry_state: "unchanged",
      error: error.message,
      reconciliation_steps: [
        `The governed document operation '${input.operation}' was applied but ${manifestLocator} was not updated.`,
        "Restore the document change or retry registration from a newly generated preview before claiming completion."
      ]
    };
  }

  return {
    schema_version: 1,
    status: "completed",
    operation: input.operation,
    preview_fingerprint: preview.preview_fingerprint,
    document_state: "changed",
    registry_state: "updated",
    manifest_revision: preview.manifest_after.revision,
    reconciliation_steps: []
  };
}
