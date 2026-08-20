import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { capabilityProfileDigest } from "./capability-profiles.mjs";

function fileDigest(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

function containedFile(projectRoot, locator) {
  const root = path.resolve(projectRoot);
  const candidate = path.resolve(root, locator);
  const relative = path.relative(root, candidate);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`capability evidence escapes project root: ${locator}`);
  }
  return candidate;
}

function mavenVersion(content) {
  for (const property of [
    "maven.compiler.release",
    "maven.compiler.source",
    "java.version"
  ]) {
    const match = content.match(
      new RegExp(`<${property.replaceAll(".", "\\.")}[^>]*>\\s*([^<\\s]+)\\s*</`)
    );
    if (match) return { value: match[1], evidence: `pom.xml:properties/${property}` };
  }
  return null;
}

function gradleVersion(content, locator) {
  const toolchain = content.match(
    /JavaLanguageVersion\.of\(\s*["']?(\d+)["']?\s*\)/
  );
  if (toolchain) {
    return {
      value: toolchain[1],
      evidence: `${locator}:java.toolchain.languageVersion`
    };
  }
  const compatibility = content.match(
    /sourceCompatibility\s*=\s*(?:JavaVersion\.VERSION_)?["']?(\d+)["']?/
  );
  if (compatibility) {
    return {
      value: compatibility[1],
      evidence: `${locator}:sourceCompatibility`
    };
  }
  return null;
}

export function profileProjectCapabilities(projectRoot, sources = []) {
  const evidence = [];
  for (const source of sources) {
    const normalized = String(source.locator ?? "").replaceAll("\\", "/");
    const base = path.posix.basename(normalized);
    let buildTool = null;
    if (base === "pom.xml") buildTool = "maven";
    if (["build.gradle", "build.gradle.kts"].includes(base)) {
      buildTool = "gradle";
    }
    if (!buildTool) continue;
    const filePath = containedFile(projectRoot, source.locator);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) continue;
    const content = fs.readFileSync(filePath, "utf8");
    evidence.push({
      source,
      build_tool: buildTool,
      source_digest: fileDigest(filePath),
      version:
        buildTool === "maven"
          ? mavenVersion(content)
          : gradleVersion(content, source.locator)
    });
  }
  if (!evidence.length) return [];

  const versions = [...new Set(evidence.map((item) => item.version?.value).filter(Boolean))];
  if (versions.length > 1) {
    throw new Error(`conflicting Java versions in project evidence: ${versions.join(", ")}`);
  }
  const buildTools = [...new Set(evidence.map((item) => item.build_tool))];
  if (buildTools.length > 1) {
    throw new Error(`conflicting Java build tools in project evidence: ${buildTools.join(", ")}`);
  }

  const primary = evidence[0];
  const facts = [
    {
      key: "build-tool",
      value: primary.build_tool,
      source_id: primary.source.id,
      evidence: `${primary.source.locator}:project-build-configuration`,
      source_digest: primary.source_digest
    }
  ];
  if (primary.version) {
    facts.push({
      key: "java-version",
      value: primary.version.value,
      source_id: primary.source.id,
      evidence: primary.version.evidence,
      source_digest: primary.source_digest
    });
  }
  const profile = {
    schema_version: 1,
    id: "java-development",
    revision: 1,
    status: "active",
    facts,
    selectors: {
      roles: ["developer", "tester", "reviewer"],
      actions: ["implement", "verify", "review"],
      file_patterns: [
        "**/*.java",
        "pom.xml",
        "build.gradle",
        "build.gradle.kts"
      ]
    },
    source_refs: evidence.map((item) => ({ source_id: item.source.id })),
    module_ids: [],
    context_budget: {
      max_facts: 8,
      max_source_refs: Math.max(2, evidence.length)
    }
  };
  profile.profile_digest = capabilityProfileDigest(profile);
  return [profile];
}
