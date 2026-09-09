import fs from "node:fs";
import path from "node:path";

import Ajv2020 from "ajv/dist/2020.js";

import { readData, resolveDataFile } from "./data-files.mjs";

const registryCache = new Map();
const scopedRegistryCache = new Map();

export function loadSchemaDocuments(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  const schemaDir = path.join(resolvedRoot, "schemas");
  return fs
    .readdirSync(schemaDir)
    .filter((name) => /\.schema\.(?:json|ya?ml)$/.test(name))
    .sort()
    .map((name) => ({
      relativePath: `schemas/${name}`,
      schema: readData(path.join(schemaDir, name))
    }));
}

export function schemaRegistry(rootDir) {
  const resolvedRoot = path.resolve(rootDir);
  if (registryCache.has(resolvedRoot)) return registryCache.get(resolvedRoot);
  const documents = loadSchemaDocuments(resolvedRoot);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false
  });
  for (const document of documents) ajv.addSchema(document.schema);
  const registry = { ajv, documents };
  registryCache.set(resolvedRoot, registry);
  return registry;
}

function externalRefs(value, result = []) {
  if (!value || typeof value !== "object") return result;
  if (Array.isArray(value)) {
    for (const item of value) externalRefs(item, result);
    return result;
  }
  if (typeof value.$ref === "string" && value.$ref.startsWith(".")) {
    result.push(value.$ref.split("#", 1)[0]);
  }
  for (const child of Object.values(value)) externalRefs(child, result);
  return result;
}

function scopedSchemaRegistry(rootDir, relativePath) {
  const resolvedRoot = path.resolve(rootDir);
  const cacheKey = `${resolvedRoot}:${relativePath}`;
  if (scopedRegistryCache.has(cacheKey)) {
    return scopedRegistryCache.get(cacheKey);
  }
  const documents = new Map();
  const load = (candidatePath) => {
    const normalized = candidatePath.split(path.sep).join("/");
    if (documents.has(normalized)) return;
    const actualPath = resolveDataFile(resolvedRoot, normalized);
    const actualRelative = path.relative(resolvedRoot, actualPath).split(path.sep).join("/");
    const schema = readData(actualPath);
    documents.set(normalized, { relativePath: normalized, actualPath: actualRelative, schema });
    for (const reference of externalRefs(schema)) {
      load(path.join(path.dirname(normalized), reference));
    }
  };
  load(relativePath);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false
  });
  for (const document of documents.values()) ajv.addSchema(document.schema);
  const registry = { ajv, documents: [...documents.values()] };
  scopedRegistryCache.set(cacheKey, registry);
  return registry;
}

export function loadScopedSchemaDocuments(rootDir, relativePath) {
  return scopedSchemaRegistry(rootDir, relativePath).documents;
}

export function validateSchemaFile(rootDir, relativePath, value) {
  const registry = scopedSchemaRegistry(rootDir, relativePath);
  const document = registry.documents.find(
    (candidate) => candidate.relativePath === relativePath
  );
  if (!document) throw new Error(`schema is unavailable: ${relativePath}`);
  const validate = registry.ajv.getSchema(document.schema.$id);
  if (!validate) throw new Error(`schema could not be compiled: ${relativePath}`);
  const valid = validate(value);
  return {
    valid,
    errors: valid
      ? []
      : validate.errors.map((error) => ({
          path: error.instancePath || "/",
          keyword: error.keyword,
          message: error.message,
          params: error.params
        }))
  };
}

export function assertSchemaFile(rootDir, relativePath, value) {
  const result = validateSchemaFile(rootDir, relativePath, value);
  if (result.valid) return value;
  const first = result.errors[0];
  const error = new Error(
    `Input does not match ${relativePath} at ${first.path}: ${first.message}`
  );
  error.code = "schema-validation-failed";
  error.hint = `Run the command description to inspect required fields and conditional branches for ${relativePath}.`;
  error.details = result.errors;
  throw error;
}
