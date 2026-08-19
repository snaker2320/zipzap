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
  return resolved;
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
