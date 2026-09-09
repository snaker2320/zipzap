import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { parseDocument, stringify } from "yaml";

const SUPPORTED_EXTENSIONS = new Set([".json", ".yaml", ".yml"]);

function assertJsonCompatible(value, locator = "$") {
  if (value == null || ["string", "boolean"].includes(typeof value)) return;
  if (typeof value === "number" && Number.isFinite(value)) return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatible(item, `${locator}[${index}]`));
    return;
  }
  if (Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, child] of Object.entries(value)) {
      assertJsonCompatible(child, `${locator}.${key}`);
    }
    return;
  }
  throw new Error(`unsupported YAML value at ${locator}`);
}

export function parseData(text, source = "input.yml") {
  const extension = path.extname(source).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw new Error(`unsupported data file extension: ${extension || "none"}`);
  }
  if (extension === ".json") return JSON.parse(text);

  const document = parseDocument(text, {
    customTags: [],
    merge: false,
    prettyErrors: true,
    schema: "core",
    strict: true,
    uniqueKeys: true
  });
  if (document.errors.length) {
    throw new Error(`invalid YAML in ${source}: ${document.errors[0].message}`);
  }
  if (document.warnings.length) {
    throw new Error(`unsafe YAML in ${source}: ${document.warnings[0].message}`);
  }
  const value = document.toJS({ maxAliasCount: 32 });
  assertJsonCompatible(value);
  return value;
}

export function readData(filePath) {
  return parseData(fs.readFileSync(filePath, "utf8"), filePath);
}

export function stringifyData(value) {
  assertJsonCompatible(value);
  return stringify(value, {
    aliasDuplicateObjects: false,
    lineWidth: 100,
    sortMapEntries: true
  });
}

export function canonicalData(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalData).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalData(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function dataDigest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalData(value)).digest("hex")}`;
}

export function resolveDataFile(rootDir, relativePath) {
  const exact = path.join(rootDir, relativePath);
  if (fs.existsSync(exact)) return exact;
  const extension = path.extname(relativePath);
  const stem = exact.slice(0, -extension.length);
  for (const candidateExtension of [".yml", ".yaml", ".json"]) {
    const candidate = `${stem}${candidateExtension}`;
    if (fs.existsSync(candidate)) return candidate;
  }
  return exact;
}
