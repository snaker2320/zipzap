import fs from "node:fs";
import path from "node:path";

import { loadScopedSchemaDocuments } from "./schema-registry.mjs";

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
    const isRequired = required.has(name);
    fields.push({
      path: fieldPath,
      required: isRequired,
      ...(isRequired
        ? { required_scope: prefix ? "parent-present" : "document" }
        : {}),
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

function collectConditions(
  node,
  current,
  resolve,
  result = [],
  depth = 0,
  prefix = ""
) {
  const resolved = resolve(node, current);
  const value = resolved.node;
  if (!value || depth > 8) return result;
  if (value.if && value.then) {
    result.push({
      when: conditionFacts(value.if, resolved.current, resolve, prefix),
      required: requiredFields(value.then, resolved.current, resolve, prefix),
      fields: Object.keys(value.then.properties ?? {}).map((name) =>
        prefix ? `${prefix}.${name}` : name
      )
    });
  }
  for (const branch of value.oneOf ?? []) {
    const when = conditionFacts(branch, resolved.current, resolve, prefix);
    if (Object.keys(when).length === 0) continue;
    result.push({
      ...(branch.title ? { title: branch.title } : {}),
      when,
      required: requiredFields(branch, resolved.current, resolve, prefix),
      fields: Object.keys(branch.properties ?? {}).map((name) =>
        prefix ? `${prefix}.${name}` : name
      )
    });
  }
  for (const key of ["allOf", "anyOf", "oneOf"]) {
    for (const child of value[key] ?? []) {
      collectConditions(
        child,
        resolved.current,
        resolve,
        result,
        depth + 1,
        prefix
      );
    }
  }
  for (const [name, child] of Object.entries(value.properties ?? {})) {
    collectConditions(
      child,
      resolved.current,
      resolve,
      result,
      depth + 1,
      prefix ? `${prefix}.${name}` : name
    );
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

function expectedMatches(expected, value) {
  return Array.isArray(expected) ? expected.includes(value) : expected === value;
}

function conditionFilterState(condition, filters) {
  let addressed = false;
  for (const [name, value] of Object.entries(filters)) {
    if (value == null) continue;
    const matchingFacts = Object.entries(condition.when).filter(
      ([field]) => field === name || field.endsWith(`.${name}`)
    );
    if (matchingFacts.length === 0) continue;
    addressed = true;
    if (!matchingFacts.some(([, expected]) => expectedMatches(expected, value))) {
      return "conflict";
    }
  }
  return addressed ? "match" : "unrelated";
}

function uniqueConditions(conditions) {
  return [
    ...new Map(
      conditions.map((condition) => [JSON.stringify(condition), condition])
    ).values()
  ];
}

function filteredConditions(conditions, filters) {
  const unique = uniqueConditions(conditions);
  const activeFilters = Object.entries(filters).filter(
    ([, value]) => value != null
  );
  if (activeFilters.length === 0) return unique;
  return unique.filter(
    (condition) => conditionFilterState(condition, filters) === "match"
  );
}

function collectValuePaths(value, prefix = "", result = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectValuePaths(item, prefix, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [name, child] of Object.entries(value)) {
    const fieldPath = prefix ? `${prefix}.${name}` : name;
    result.add(fieldPath);
    collectValuePaths(child, fieldPath, result);
  }
  return result;
}

function filterValues(value, name, result = []) {
  if (Array.isArray(value)) {
    for (const item of value) filterValues(item, name, result);
    return result;
  }
  if (!value || typeof value !== "object") return result;
  for (const [key, child] of Object.entries(value)) {
    if (key === name) result.push(child);
    filterValues(child, name, result);
  }
  return result;
}

function exampleMatchesFilters(example, filters) {
  return Object.entries(filters)
    .filter(([, value]) => value != null)
    .every(([name, value]) => filterValues(example, name).includes(value));
}

function selectExample(metadata, rootDir, filters) {
  const candidates = [
    ...(metadata.example ? [{ path: metadata.example }] : []),
    ...(metadata.examples ?? [])
  ];
  for (const candidate of candidates) {
    const declaredFilters = candidate.filters ?? {};
    const conflicts = Object.entries(filters).some(
      ([name, value]) =>
        value != null &&
        declaredFilters[name] != null &&
        declaredFilters[name] !== value
    );
    if (conflicts) continue;
    const example = readJson(path.join(rootDir, candidate.path));
    if (exampleMatchesFilters(example, filters)) {
      return { path: candidate.path, value: example };
    }
  }
  return null;
}

function pathRelated(path, target) {
  return (
    path === target ||
    path.startsWith(`${target}.`) ||
    target.startsWith(`${path}.`)
  );
}

function focusFields(fields, conditions, filters, example) {
  const activeFilters = Object.entries(filters).filter(
    ([, value]) => value != null
  );
  if (activeFilters.length === 0) return fields;
  const unique = uniqueConditions(conditions);
  const selected = unique.filter(
    (condition) => conditionFilterState(condition, filters) === "match"
  );
  const selectedPaths = new Set(
    selected.flatMap((condition) => [
      ...Object.keys(condition.when),
      ...condition.required
    ])
  );
  const conflictingPaths = new Set(
    unique
      .filter(
        (condition) => conditionFilterState(condition, filters) === "conflict"
      )
      .flatMap((condition) => condition.required)
      .filter(
        (path) =>
          ![...selectedPaths].some((selectedPath) =>
            pathRelated(path, selectedPath)
          )
      )
  );
  const examplePaths = example ? collectValuePaths(example) : new Set();
  return fields.filter((field) => {
    const path = field.path;
    if (
      [...conflictingPaths].some(
        (conflictingPath) =>
          path === conflictingPath || path.startsWith(`${conflictingPath}.`)
      )
    ) {
      return false;
    }
    if (
      examplePaths.has(path) ||
      [...examplePaths].some((examplePath) => examplePath.startsWith(`${path}.`))
    ) {
      return true;
    }
    if (
      [...selectedPaths].some(
        (selectedPath) =>
          path === selectedPath ||
          selectedPath.startsWith(`${path}.`) ||
          (!example && path.startsWith(`${selectedPath}.`))
      )
    ) {
      return true;
    }
    return field.required && !path.includes(".");
  });
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
        example: metadata.example ?? null,
        examples: (metadata.examples ?? []).map((candidate) => candidate.path)
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
  const selectedExample = selectExample(metadata, rootDir, filters);
  const filteredExample = selectedExample?.value ?? null;
  if (selectedExample) {
    result.example_source = selectedExample.path;
    result.example = selectedExample.value;
  }
  if (metadata.schema) {
    const documents = loadScopedSchemaDocuments(rootDir, metadata.schema);
    const document = documents.find(
      (candidate) => candidate.relativePath === metadata.schema
    );
    if (!document) throw new Error(`schema is unavailable: ${metadata.schema}`);
    const resolve = resolver(documents);
    const conditions = collectConditions(
      document.schema,
      document.schema,
      resolve
    );
    const fields = focusFields(
      flattenFields(document.schema, document.schema, resolve),
      conditions,
      filters,
      filteredExample
    );
    result.input_contract = {
      schema: metadata.schema,
      title: document.schema.title ?? null,
      required: document.schema.required ?? [],
      fields,
      conditional_rules: filteredConditions(
        conditions,
        filters
      ),
      projection: Object.values(filters).some((value) => value != null)
        ? "filtered"
        : "full"
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
    const documents = loadScopedSchemaDocuments(rootDir, metadata.outputSchema);
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
