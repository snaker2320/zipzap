import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../.."
);
const MODULE_KINDS = new Set([
  "role",
  "capability",
  "policy",
  "context-provider"
]);
const MODULE_ID_PATTERN =
  /^(role|capability|policy|context-provider):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROTECTED_KINDS = new Set(["capability", "context-provider"]);

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function hasAuthorityField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasAuthorityField);
  return Object.entries(value).some(
    ([key, child]) => key === "authority" || hasAuthorityField(child)
  );
}

function resolveSource(rootDir, locator) {
  const resolvedRoot = path.resolve(rootDir);
  const resolved = path.resolve(resolvedRoot, locator);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`module source escapes ZipZap root: ${locator}`);
  }
  return resolved;
}

function readPointer(value, pointer, moduleId) {
  let current = value;
  for (const segment of pointer) {
    if (
      !current ||
      typeof current !== "object" ||
      !Object.hasOwn(current, segment)
    ) {
      throw new Error(`module ${moduleId} pointer is missing segment ${segment}`);
    }
    current = current[segment];
  }
  return current;
}

export function validateModuleCatalog(catalog) {
  assertObject(catalog, "module catalog");
  if (catalog.schema_version !== 1) {
    throw new Error("module catalog schema_version must be 1");
  }
  assertObject(catalog.modules, "module catalog modules");

  for (const [moduleId, definition] of Object.entries(catalog.modules)) {
    assertObject(definition, `module ${moduleId}`);
    if (!MODULE_ID_PATTERN.test(moduleId)) {
      throw new Error(`invalid module id: ${moduleId}`);
    }
    if (!MODULE_KINDS.has(definition.kind)) {
      throw new Error(`unsupported module kind: ${definition.kind}`);
    }
    if (!moduleId.startsWith(`${definition.kind}:`)) {
      throw new Error(`module id ${moduleId} does not match kind ${definition.kind}`);
    }
    const hasSource = typeof definition.source === "string";
    const hasValue = definition.value != null;
    if (hasSource === hasValue) {
      throw new Error(`module ${moduleId} must declare exactly one source or value`);
    }
    if (hasSource && !Array.isArray(definition.pointer)) {
      throw new Error(`module ${moduleId} source requires a pointer array`);
    }
    if (hasValue) assertObject(definition.value, `module ${moduleId} value`);
    if (
      PROTECTED_KINDS.has(definition.kind) &&
      hasAuthorityField(definition.value)
    ) {
      throw new Error(`${definition.kind} module cannot declare authority`);
    }
  }
  return catalog;
}

export function loadModuleCatalog(rootDir = DEFAULT_ROOT) {
  const raw = JSON.parse(
    fs.readFileSync(path.join(rootDir, "config/modules.json"), "utf8")
  );
  validateModuleCatalog(raw);

  const modules = {};
  const byKind = Object.fromEntries([...MODULE_KINDS].map((kind) => [kind, []]));
  for (const [moduleId, definition] of Object.entries(raw.modules)) {
    const value = definition.source
      ? readPointer(
          JSON.parse(
            fs.readFileSync(resolveSource(rootDir, definition.source), "utf8")
          ),
          definition.pointer,
          moduleId
        )
      : definition.value;
    if (
      PROTECTED_KINDS.has(definition.kind) &&
      hasAuthorityField(value)
    ) {
      throw new Error(`${definition.kind} module cannot declare authority`);
    }
    modules[moduleId] = {
      kind: definition.kind,
      value: structuredClone(value),
      ...(definition.source
        ? { source: definition.source, pointer: [...definition.pointer] }
        : {})
    };
    byKind[definition.kind].push(moduleId);
  }

  return {
    schema_version: raw.schema_version,
    definitions: structuredClone(raw.modules),
    modules,
    by_kind: byKind
  };
}
