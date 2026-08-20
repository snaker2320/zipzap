import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_ID_PATTERN =
  /^(role|capability|policy|context-provider):[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const PROFILE_FIELDS = new Set([
  "schema_version",
  "id",
  "revision",
  "status",
  "facts",
  "selectors",
  "source_refs",
  "module_ids",
  "context_budget",
  "profile_digest"
]);
const FACT_FIELDS = new Set([
  "key",
  "value",
  "source_id",
  "evidence",
  "source_digest"
]);
const SELECTOR_FIELDS = new Set([
  "roles",
  "stages",
  "actions",
  "components",
  "risk_flags",
  "file_patterns"
]);
const SOURCE_REF_FIELDS = new Set([
  "source_id",
  "section",
  "start_line",
  "end_line"
]);

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

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertAllowedFields(value, fields, label) {
  assertObject(value, label);
  for (const field of Object.keys(value)) {
    if (!fields.has(field)) throw new Error(`unknown ${label} field: ${field}`);
  }
}

function assertId(value, label) {
  if (typeof value !== "string" || !ID_PATTERN.test(value)) {
    throw new Error(`${label} must be a kebab-case id`);
  }
}

function assertUniqueStrings(values, label, pattern = ID_PATTERN) {
  if (
    !Array.isArray(values) ||
    values.some((value) => typeof value !== "string" || !pattern.test(value)) ||
    new Set(values).size !== values.length
  ) {
    throw new Error(`${label} must contain unique valid strings`);
  }
}

function assertContainedPattern(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  if (
    path.posix.isAbsolute(normalized) ||
    normalized.split("/").includes("..")
  ) {
    throw new Error(`capability file pattern escapes project root: ${pattern}`);
  }
}

export function capabilityProfileDigest(profile) {
  const copy = structuredClone(profile);
  delete copy.profile_digest;
  return digest(canonical(copy));
}

export function validateCapabilityProfile(profile) {
  assertAllowedFields(profile, PROFILE_FIELDS, "capability profile");
  if (profile.schema_version !== 1) {
    throw new Error("capability profile schema_version must be 1");
  }
  assertId(profile.id, "capability profile id");
  if (!Number.isInteger(profile.revision) || profile.revision < 1) {
    throw new Error("capability profile revision must be a positive integer");
  }
  if (!["active", "disabled"].includes(profile.status)) {
    throw new Error("capability profile status must be active or disabled");
  }

  if (!Array.isArray(profile.facts)) {
    throw new Error("capability profile facts must be an array");
  }
  const factKeys = new Set();
  for (const fact of profile.facts) {
    assertAllowedFields(fact, FACT_FIELDS, "capability fact");
    assertId(fact.key, "capability fact key");
    assertId(fact.source_id, "capability fact source_id");
    if (factKeys.has(fact.key)) {
      throw new Error(`duplicate capability fact key: ${fact.key}`);
    }
    factKeys.add(fact.key);
    if (
      fact.value !== null &&
      !["string", "number", "boolean"].includes(typeof fact.value)
    ) {
      throw new Error("capability fact value must be a JSON scalar");
    }
    if (typeof fact.value === "number" && !Number.isFinite(fact.value)) {
      throw new Error("capability fact value must be a JSON scalar");
    }
    if (typeof fact.evidence !== "string" || !fact.evidence.trim()) {
      throw new Error("capability fact evidence must be non-empty");
    }
    if (!DIGEST_PATTERN.test(fact.source_digest ?? "")) {
      throw new Error("capability fact source_digest must be a SHA-256 reference");
    }
  }

  assertAllowedFields(profile.selectors, SELECTOR_FIELDS, "capability selectors");
  for (const field of [
    "roles",
    "stages",
    "actions",
    "components",
    "risk_flags"
  ]) {
    if (profile.selectors[field] != null) {
      assertUniqueStrings(profile.selectors[field], `capability selector ${field}`);
    }
  }
  if (profile.selectors.file_patterns != null) {
    if (
      !Array.isArray(profile.selectors.file_patterns) ||
      profile.selectors.file_patterns.some(
        (value) => typeof value !== "string" || !value
      ) ||
      new Set(profile.selectors.file_patterns).size !==
        profile.selectors.file_patterns.length
    ) {
      throw new Error("capability selector file_patterns must be unique strings");
    }
    profile.selectors.file_patterns.forEach(assertContainedPattern);
  }

  if (!Array.isArray(profile.source_refs)) {
    throw new Error("capability profile source_refs must be an array");
  }
  for (const sourceRef of profile.source_refs) {
    assertAllowedFields(sourceRef, SOURCE_REF_FIELDS, "capability source ref");
    assertId(sourceRef.source_id, "capability source ref source_id");
    if (
      sourceRef.section != null &&
      (typeof sourceRef.section !== "string" || !sourceRef.section.trim())
    ) {
      throw new Error("capability source ref section must be non-empty");
    }
    for (const field of ["start_line", "end_line"]) {
      if (
        sourceRef[field] != null &&
        (!Number.isInteger(sourceRef[field]) || sourceRef[field] < 1)
      ) {
        throw new Error(`capability source ref ${field} must be positive`);
      }
    }
    if (
      sourceRef.start_line != null &&
      sourceRef.end_line != null &&
      sourceRef.end_line < sourceRef.start_line
    ) {
      throw new Error("capability source ref line range is reversed");
    }
  }

  if (profile.module_ids != null) {
    assertUniqueStrings(
      profile.module_ids,
      "capability module_ids",
      MODULE_ID_PATTERN
    );
  }
  if (profile.context_budget != null) {
    assertAllowedFields(
      profile.context_budget,
      new Set(["max_facts", "max_source_refs"]),
      "capability context budget"
    );
    for (const field of ["max_facts", "max_source_refs"]) {
      if (
        !Number.isInteger(profile.context_budget[field]) ||
        profile.context_budget[field] < 0
      ) {
        throw new Error(`capability context budget ${field} must be non-negative`);
      }
    }
  }
  if (!DIGEST_PATTERN.test(profile.profile_digest ?? "")) {
    throw new Error("capability profile_digest must be a SHA-256 reference");
  }
  if (profile.profile_digest !== capabilityProfileDigest(profile)) {
    throw new Error("capability profile_digest does not match profile content");
  }
  return profile;
}

function containedPath(projectRoot, locator) {
  if (typeof locator !== "string" || !locator || path.isAbsolute(locator)) {
    throw new Error(`capability profile locator escapes project root: ${locator}`);
  }
  const root = fs.realpathSync(projectRoot);
  const candidate = path.resolve(root, locator);
  const lexicalRelative = path.relative(root, candidate);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) {
    throw new Error(`capability profile locator escapes project root: ${locator}`);
  }
  const resolved = fs.realpathSync(candidate);
  const realRelative = path.relative(root, resolved);
  if (realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    throw new Error(`capability profile locator escapes project root: ${locator}`);
  }
  return resolved;
}

export function loadCapabilityProfiles(projectRoot, registrations) {
  if (!Array.isArray(registrations)) {
    throw new Error("capability registrations must be an array");
  }
  const registrationIds = new Set();
  const loadedIds = new Set();
  const profiles = [];
  for (const registration of registrations) {
    assertAllowedFields(
      registration,
      new Set(["id", "locator", "enabled"]),
      "capability registration"
    );
    assertId(registration.id, "capability registration id");
    if (registrationIds.has(registration.id)) {
      throw new Error(`duplicate capability registration id: ${registration.id}`);
    }
    registrationIds.add(registration.id);
    if (typeof registration.enabled !== "boolean") {
      throw new Error("capability registration enabled must be boolean");
    }
    if (!registration.enabled) continue;
    const locator = containedPath(projectRoot, registration.locator);
    let profile;
    try {
      profile = JSON.parse(fs.readFileSync(locator, "utf8"));
    } catch (error) {
      throw new Error(`cannot load capability profile ${registration.id}: ${error.message}`);
    }
    validateCapabilityProfile(profile);
    if (profile.id !== registration.id) {
      throw new Error(
        `capability registration ${registration.id} does not match profile ${profile.id}`
      );
    }
    if (profile.status !== "active") continue;
    if (loadedIds.has(profile.id)) {
      throw new Error(`duplicate capability profile id: ${profile.id}`);
    }
    loadedIds.add(profile.id);
    profiles.push(profile);
  }
  return profiles.sort((left, right) => left.id.localeCompare(right.id));
}

function globRegex(pattern) {
  const normalized = pattern.replaceAll("\\", "/");
  let expression = "^";
  for (let index = 0; index < normalized.length; index += 1) {
    const character = normalized[index];
    if (character === "*" && normalized[index + 1] === "*") {
      if (normalized[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") {
      expression += "[^/]*";
    } else if (character === "?") {
      expression += "[^/]";
    } else {
      expression += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
    }
  }
  return new RegExp(`${expression}$`);
}

function profileMatches(profile, query) {
  const selectors = profile.selectors;
  for (const [field, actual] of [
    ["roles", query.role],
    ["stages", query.stage],
    ["actions", query.action]
  ]) {
    if (selectors[field]?.length && !selectors[field].includes(actual)) {
      return false;
    }
  }
  for (const [field, actual] of [
    ["components", query.components ?? []],
    ["risk_flags", query.risk_flags ?? []]
  ]) {
    if (
      selectors[field]?.length &&
      !selectors[field].some((value) => actual.includes(value))
    ) {
      return false;
    }
  }
  if (selectors.file_patterns?.length) {
    const matchers = selectors.file_patterns.map(globRegex);
    if (
      !(query.files ?? []).some((file) =>
        matchers.some((matcher) => matcher.test(file.replaceAll("\\", "/")))
      )
    ) {
      return false;
    }
  }
  return true;
}

export function matchCapabilityProfiles(profiles, query = {}) {
  const explicit = new Set(query.explicit ?? []);
  const selected = [];
  const rejected = [];
  const knownIds = new Set();
  for (const profile of [...profiles].sort((left, right) =>
    left.id.localeCompare(right.id)
  )) {
    knownIds.add(profile.id);
    if (profile.status !== "active") {
      rejected.push({ id: profile.id, reason: "disabled" });
    } else if (explicit.has(profile.id) || profileMatches(profile, query)) {
      selected.push(profile);
    } else {
      rejected.push({ id: profile.id, reason: "selector-mismatch" });
    }
  }
  for (const id of [...explicit].sort()) {
    if (!knownIds.has(id)) rejected.push({ id, reason: "not-found" });
  }
  return { selected, rejected };
}

export function assessCapabilityProfile(profile, projectRoot, sourcesById) {
  void projectRoot;
  try {
    validateCapabilityProfile(profile);
  } catch (error) {
    return { status: "invalid", changes: [{ reason: error.message }] };
  }
  const changes = [];
  const requiredSourceIds = new Set([
    ...profile.facts.map((fact) => fact.source_id),
    ...profile.source_refs.map((sourceRef) => sourceRef.source_id)
  ]);
  for (const sourceId of [...requiredSourceIds].sort()) {
    if (!sourcesById?.[sourceId]) {
      changes.push({ source_id: sourceId, reason: "missing-source" });
    }
  }
  if (changes.length) return { status: "missing-source", changes };

  for (const fact of profile.facts) {
    const currentDigest = sourcesById[fact.source_id].version;
    if (currentDigest !== fact.source_digest) {
      changes.push({
        source_id: fact.source_id,
        fact_key: fact.key,
        from: fact.source_digest,
        to: currentDigest ?? null,
        reason: "source-fingerprint-changed"
      });
    }
  }
  return { status: changes.length ? "stale" : "current", changes };
}
