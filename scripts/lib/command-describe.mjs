import fs from "node:fs";
import path from "node:path";

import { loadSchemaDocuments } from "./schema-registry.mjs";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function typeOf(node) {
  if (node.const !== undefined) return typeof node.const;
  if (node.type) return Array.isArray(node.type) ? node.type.join("|") : node.type;
  if (node.enum) return "enum";
  if (node.oneOf) return "oneOf";
  if (node.anyOf) return "anyOf";
  return "unspecified";
}

function pointer(root, fragment) {
  return fragment
    .replace(/^#\/?/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => segment.replaceAll("~1", "/").replaceAll("~0", "~"))
    .reduce((value, segment) => value?.[segment], root);
}

function resolver(documents) {
  const byId = new Map(documents.map(({ schema }) => [schema.$id, schema]));
  const resolveRef = (node, current, seen = new Set()) => {
    if (!node?.$ref) return { node, current };
    const resolved = new URL(node.$ref, current.$id).href;
    if (seen.has(resolved)) return { node, current };
    const [documentId, fragment = ""] = resolved.split("#");
    const targetDocument = byId.get(documentId);
    if (!targetDocument) return { node, current };
    const target = fragment ? pointer(targetDocument, `#${fragment}`) : targetDocument;
    if (!target) return { node, current: targetDocument };
    return resolveRef(target, targetDocument, new Set([...seen, resolved]));
  };
  return resolveRef;
}

function flattenFields(node, current, resolve, prefix = "", depth = 0) {
  const resolved = resolve(node, current);
  const value = resolved.node;
  if (!value || depth > 5) return [];
  const required = new Set(value.required ?? []);
  const fields = [];
  for (const [name, propertyNode] of Object.entries(value.properties ?? {})) {
    const property = resolve(propertyNode, resolved.current);
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    fields.push({
      path: fieldPath,
      required: required.has(name),
      type: typeOf(property.node),
      ...(property.node.enum ? { enum: property.node.enum } : {}),
      ...(property.node.const !== undefined ? { const: property.node.const } : {}),
      ...(property.node.description ? { description: property.node.description } : {}),
      ...(propertyNode.$ref ? { ref: propertyNode.$ref } : {})
    });
    fields.push(
      ...flattenFields(
        property.node,
        property.current,
        resolve,
        fieldPath,
        depth + 1
      )
    );
  }
  return fields;
}

function conditionFacts(node, current, resolve, prefix = "") {
  const resolved = resolve(node, current);
  const facts = {};
  for (const [name, value] of Object.entries(resolved.node?.properties ?? {})) {
    const property = resolve(value, resolved.current);
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    if (property.node.const !== undefined) facts[fieldPath] = property.node.const;
    else if (property.node.enum?.length) facts[fieldPath] = property.node.enum;
    Object.assign(
      facts,
      conditionFacts(property.node, property.current, resolve, fieldPath)
    );
  }
  return facts;
}

function requiredFields(node, current, resolve, prefix = "") {
  const resolved = resolve(node, current);
  const fields = (resolved.node?.required ?? []).map((name) =>
    prefix ? `${prefix}.${name}` : name
  );
  for (const [name, child] of Object.entries(resolved.node?.properties ?? {})) {
    fields.push(
      ...requiredFields(
        child,
        resolved.current,
        resolve,
        prefix ? `${prefix}.${name}` : name
      )
    );
  }
  return fields;
}

function collectConditions(node, current, resolve, result = [], depth = 0) {
  const resolved = resolve(node, current);
  const value = resolved.node;
  if (!value || depth > 8) return result;
  if (value.if && value.then) {
    result.push({
      when: conditionFacts(value.if, resolved.current, resolve),
      required: requiredFields(value.then, resolved.current, resolve),
      fields: Object.keys(value.then.properties ?? {})
    });
  }
  for (const branch of value.oneOf ?? []) {
    const when = conditionFacts(branch, resolved.current, resolve);
    if (Object.keys(when).length === 0) continue;
    result.push({
      ...(branch.title ? { title: branch.title } : {}),
      when,
      required: requiredFields(branch, resolved.current, resolve),
      fields: Object.keys(branch.properties ?? {})
    });
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    for (const child of value[key] ?? []) {
      collectConditions(child, resolved.current, resolve, result, depth + 1);
    }
  }
  for (const child of Object.values(value.properties ?? {})) {
    collectConditions(child, resolved.current, resolve, result, depth + 1);
  }
  return result;
}

function describedOptions(usage) {
  const options = [];
  for (const match of usage.matchAll(/--[a-z][a-z-]*(?:\s+(?:<[^>]+>|[a-z][a-z|_-]*))?/g)) {
    if (!options.includes(match[0])) options.push(match[0]);
  }
  return options;
}

function filteredConditions(conditions, filters) {
  const unique = [
    ...new Map(
      conditions.map((condition) => [JSON.stringify(condition), condition])
    ).values()
  ];
  const activeFilters = Object.entries(filters).filter(([, value]) => value != null);
  if (activeFilters.length === 0) return unique;
  return unique.filter((condition) =>
    activeFilters.every(([name, value]) => {
      const matchingFacts = Object.entries(condition.when).filter(
        ([field]) => field === name || field.endsWith(`.${name}`)
      );
      if (matchingFacts.length === 0) return false;
      return matchingFacts.some(([, expected]) =>
        Array.isArray(expected) ? expected.includes(value) : expected === value
      );
    })
  );
}

export function describeCommands({
  commands,
  subject,
  rootDir,
  executable,
  filters = {}
}) {
  if (!subject) {
    return {
      schema_version: 1,
      executable,
      commands: Object.entries(commands).map(([name, metadata]) => ({
        name,
        summary: metadata.summary,
        usage: metadata.usage,
        schema: metadata.schema ?? null,
        output_schema: metadata.outputSchema ?? null,
        example: metadata.example ?? null
      }))
    };
  }
  const metadata = commands[subject];
  if (!metadata) {
    const error = new Error(`Unknown command to describe: ${subject}`);
    error.code = "unknown-command";
    throw error;
  }
  const result = {
    schema_version: 1,
    command: subject,
    summary: metadata.summary,
    usage: `${executable} ${metadata.usage}`,
    options: describedOptions(metadata.usage),
    filters
  };
  if (metadata.example) {
    result.example = readJson(path.join(rootDir, metadata.example));
  }
  if (metadata.schema) {
    const documents = loadSchemaDocuments(rootDir);
    const document = documents.find(
      (candidate) => candidate.relativePath === metadata.schema
    );
    if (!document) throw new Error(`schema is unavailable: ${metadata.schema}`);
    const resolve = resolver(documents);
    const fields = flattenFields(document.schema, document.schema, resolve);
    result.input_contract = {
      schema: metadata.schema,
      title: document.schema.title ?? null,
      required: document.schema.required ?? [],
      fields,
      conditional_rules: filteredConditions(
        collectConditions(document.schema, document.schema, resolve),
        filters
      )
    };
    result.selected_parameters = Object.entries(filters)
      .filter(([, value]) => value != null)
      .map(([name, value]) => ({
        name,
        value,
        matching_fields: fields
          .filter(
            (field) =>
              (field.path === name || field.path.endsWith(`.${name}`)) &&
              (!field.enum || field.enum.includes(value))
          )
          .map((field) => field.path)
      }));
  }
  if (metadata.outputSchema) {
    const documents = loadSchemaDocuments(rootDir);
    const document = documents.find(
      (candidate) => candidate.relativePath === metadata.outputSchema
    );
    if (!document) {
      throw new Error(`schema is unavailable: ${metadata.outputSchema}`);
    }
    const resolve = resolver(documents);
    result.output_contract = {
      schema: metadata.outputSchema,
      title: document.schema.title ?? null,
      required: document.schema.required ?? [],
      fields: flattenFields(document.schema, document.schema, resolve)
    };
  }
  return result;
}
