import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { parseData } from "./data-files.mjs";

export const STANDARD_CATEGORIES = [
  "foundation",
  "engineering",
  "quality",
  "delivery",
  "governance"
];

const LEGACY_ROOTS = ["conventions", "docs/standards"];
const APPLICABILITY_DIMENSIONS = [
  "actions",
  "domains",
  "artifacts",
  "paths",
  "risks"
];

function normalizeRelative(projectRoot, locator) {
  const absolute = path.resolve(projectRoot, locator);
  const relative = path.relative(projectRoot, absolute).split(path.sep).join("/");
  if (!relative || relative.startsWith("../") || path.isAbsolute(relative)) {
    throw new Error(`path escapes project root: ${locator}`);
  }
  return relative;
}

function walkFiles(root, relativeRoot) {
  const absoluteRoot = path.join(root, relativeRoot);
  if (!fs.existsSync(absoluteRoot)) return [];
  const files = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
      }
    }
  };
  visit(absoluteRoot);
  return files.sort();
}

function frontmatter(content, locator) {
  if (!content.startsWith("---\n")) return {};
  const end = content.indexOf("\n---\n", 4);
  if (end < 0) throw new Error(`unterminated YAML frontmatter: ${locator}`);
  const value = parseData(content.slice(4, end), `${locator}.frontmatter.yml`);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`frontmatter must be a mapping: ${locator}`);
  }
  const allowed = new Set([
    "id",
    "summary",
    "priority",
    "applies_to",
    "high_risk",
    "authority"
  ]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`unsupported standards frontmatter key ${key}: ${locator}`);
  }
  return value;
}

function sha256(value) {
  return `sha256:${crypto.createHash("sha256").update(value).digest("hex")}`;
}

function markdownBody(content) {
  if (!content.startsWith("---\n")) return content;
  const end = content.indexOf("\n---\n", 4);
  return end < 0 ? content : content.slice(end + 5);
}

function diagnostic(code, locator, message, suggestedAction, details = {}) {
  return {
    code,
    severity: "warning",
    locator,
    message,
    suggested_action: suggestedAction,
    ...details
  };
}

function standardsDiagnostics(entries) {
  if (!entries.length) {
    return [diagnostic(
      "missing-standards",
      "standards/",
      "No project standards were discovered.",
      "Preview standards initialization before creating project rules."
    )];
  }

  const result = [];
  const byId = new Map();
  for (const entry of entries) {
    const { standard, content } = entry;
    const duplicates = byId.get(standard.id) ?? [];
    duplicates.push(standard.locator);
    byId.set(standard.id, duplicates);

    const applies = standard.applies_to;
    const validApplies = applies && typeof applies === "object" && !Array.isArray(applies);
    if (!validApplies) {
      result.push(diagnostic(
        "invalid-applicability",
        standard.locator,
        "applies_to must be a mapping when present.",
        "Review the standard and propose corrected applicability metadata."
      ));
    }
    const selectors = validApplies ? Object.keys(applies) : [];
    const unsupported = selectors.filter((key) => !APPLICABILITY_DIMENSIONS.includes(key));
    if (unsupported.length) {
      result.push(diagnostic(
        "unsupported-applicability-selector",
        standard.locator,
        `Unsupported applicability selectors: ${unsupported.join(", ")}.`,
        "Replace them with actions, domains, artifacts, paths, or risks.",
        { selectors: unsupported }
      ));
    }
    const scoped = APPLICABILITY_DIMENSIONS.some((key) => list(validApplies ? applies[key] : null).length > 0);
    if (standard.category !== "foundation" && !scoped) {
      result.push(diagnostic(
        "unscoped-standard",
        standard.locator,
        "This standard is universally applicable for backward compatibility.",
        "Add minimal applies_to metadata when the rule is not truly universal."
      ));
    }

    const body = markdownBody(content).trim();
    const substantive = body.replace(/^#{1,6}\s+.*$/gm, "").trim();
    if (substantive.length < 20) {
      result.push(diagnostic(
        "thin-standard",
        standard.locator,
        "This standard has little actionable content.",
        "Add durable boundaries, conditions, constraints, and expected outcomes."
      ));
    }
    const exampleHeadings = body.match(/^#{1,6}\s+.*(?:example|examples|示例|样例).*$/gim)?.length ?? 0;
    const fencedExamples = Math.floor((body.match(/^```/gm)?.length ?? 0) / 2);
    const explicitExamples = body.match(/(?:\be\.g\.|\bfor example\b|例如|比如)/gi)?.length ?? 0;
    const normativeStatements = body.match(/\b(?:must|should|required?|never|only|prohibit(?:ed)?)\b|必须|应当|不得|禁止|仅限|要求/gi)?.length ?? 0;
    const exampleSignals = exampleHeadings + fencedExamples + explicitExamples;
    if (exampleSignals >= 3 && normativeStatements < 2) {
      result.push(diagnostic(
        "example-heavy-standard",
        standard.locator,
        "Examples dominate this file without enough durable normative statements.",
        "Propose extracting stable rules here and moving concrete examples to reference material.",
        { example_signals: exampleSignals, normative_statements: normativeStatements }
      ));
    }
  }

  for (const [id, locators] of byId.entries()) {
    if (locators.length < 2) continue;
    for (const locator of locators) {
      result.push(diagnostic(
        "duplicate-standard-id",
        locator,
        `Standard id ${id} is also used by another file.`,
        "Review the files and confirm a unique stable id for each standard.",
        { id, related_locators: locators.filter((candidate) => candidate !== locator) }
      ));
    }
  }
  return result.sort((left, right) =>
    left.locator.localeCompare(right.locator) || left.code.localeCompare(right.code)
  );
}

function classifyCategory(locator, content = "") {
  const normalized = `${locator}\n${content.slice(0, 2000)}`.toLowerCase();
  if (/test|quality|review|验证|测试|质量/.test(normalized)) return "quality";
  if (/release|deploy|delivery|git|commit|发布|部署|交付|提交/.test(normalized)) return "delivery";
  if (/govern|feedback|authority|security|治理|反馈|权限|安全/.test(normalized)) return "governance";
  if (/code|java|typescript|javascript|python|database|api|工程|编码|数据库|接口/.test(normalized)) {
    return "engineering";
  }
  return "foundation";
}

function slug(locator) {
  return path.basename(locator, ".md").toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-|-$/g, "") || "standard";
}

function existingSignals(projectRoot) {
  const has = (locator) => fs.existsSync(path.join(projectRoot, locator));
  const hasNamedDeliveryScript = ["scripts", "bin", "ops"].some((directory) => {
    const absolute = path.join(projectRoot, directory);
    return fs.existsSync(absolute) && fs.statSync(absolute).isDirectory() &&
      fs.readdirSync(absolute).some((name) => /(?:deploy|start|probe|health|smoke|rollback|stop)/i.test(name));
  });
  const java = has("pom.xml") || has("build.gradle") || has("build.gradle.kts");
  const node = has("package.json") || has("tsconfig.json");
  const python = has("pyproject.toml") || has("requirements.txt");
  return {
    git: has(".git"),
    java,
    node,
    python,
    build: java || node || python || has("Makefile"),
    delivery: has("devctl") || has("Dockerfile") || has("compose.yml") ||
      has("compose.yaml") || has("docker-compose.yml") || has("docker-compose.yaml") ||
      hasNamedDeliveryScript,
    tests: ["tests", "test", "src/test"].some(has)
  };
}

function starterAssets(projectRoot) {
  const signals = existingSignals(projectRoot);
  const assets = [
    {
      locator: "standards/foundation/project.md",
      content: "# Project standard\n\nRecord durable project boundaries, authoritative sources, global invariants, and the conditions and outcomes that make them actionable. Keep concrete examples in reference documentation.\n"
    }
  ];
  if (signals.java) assets.push({ locator: "standards/engineering/java.md", content: "# Java engineering standard\n\nRecord the supported Java version, build commands, module boundaries, and compatibility rules here.\n" });
  if (signals.node) assets.push({ locator: "standards/engineering/node.md", content: "# Node engineering standard\n\nRecord the package manager, runtime version, build commands, and module conventions here.\n" });
  if (signals.python) assets.push({ locator: "standards/engineering/python.md", content: "# Python engineering standard\n\nRecord the Python version, environment, build commands, and module conventions here.\n" });
  if (signals.build) assets.push({ locator: "standards/engineering/build.md", content: "# Build standard\n\nMap `build.execute` and `build.verify-artifact` to existing project-owned commands. Record the working directory, timeout, artifact locator, commit binding, SHA-256 verification, and known limitations. Do not rebuild during Deploy.\n" });
  if (signals.tests) assets.push({ locator: "standards/quality/testing.md", content: "# Testing standard\n\nRecord focused checks, full acceptance commands, evidence requirements, and known limitations here.\n" });
  if (signals.git) assets.push({ locator: "standards/delivery/git.md", content: "# Git delivery standard\n\nRecord branch, commit, verification, and publication rules here. ZipZap Handoff metadata belongs to the final effective commit.\n" });
  if (signals.delivery) assets.push({ locator: "standards/delivery/deployment.md", content: "# Development and test deployment standard\n\nMap `deploy.precheck`, `deploy.apply`, `deploy.probe`, `deploy.smoke`, `deploy.diagnose`, and `deploy.rollback` to existing project-owned commands. Identify every target explicitly, keep production out of scope, require readiness separately from command success, and record authorization boundaries for shared or destructive environments.\n" });
  return assets;
}

function previewFingerprint(preview) {
  const copy = structuredClone(preview);
  delete copy.preview_fingerprint;
  return sha256(JSON.stringify(copy));
}

export function discoverStandards(projectRoot) {
  const root = path.resolve(projectRoot);
  const entries = walkFiles(root, "standards").map((locator) => {
    const content = fs.readFileSync(path.join(root, locator), "utf8");
    const relative = locator.slice("standards/".length);
    const category = relative.split("/", 1)[0];
    if (!STANDARD_CATEGORIES.includes(category)) {
      throw new Error(`standards file is outside a standard category: ${locator}`);
    }
    const metadata = frontmatter(content, locator);
    const standard = {
      id: metadata.id ?? locator.slice("standards/".length, -3).replaceAll("/", ":"),
      locator,
      category,
      priority: metadata.priority ?? 0,
      summary: metadata.summary ?? null,
      applies_to: metadata.applies_to ?? {},
      high_risk: metadata.high_risk === true,
      authority: metadata.authority ?? "project",
      sha256: sha256(content)
    };
    return { standard, content };
  });
  const files = entries.map((entry) => entry.standard);
  return {
    configured: files.length > 0,
    root: "standards/",
    categories: [...STANDARD_CATEGORIES],
    index: {
      mode: "derived",
      source: "standards/",
      persisted: false
    },
    files,
    diagnostics: standardsDiagnostics(entries)
  };
}

export function planStandardsInitialization(input) {
  const projectRoot = path.resolve(input.project?.locator ?? "");
  if (!input.project?.locator || !fs.existsSync(projectRoot)) {
    throw new Error("standards initialization requires an available project locator");
  }
  const current = discoverStandards(projectRoot);
  const requestedStrategy = input.strategy ?? "configure";
  const hasLegacyStandards = LEGACY_ROOTS.some(
    (legacyRoot) => walkFiles(projectRoot, legacyRoot).length > 0
  );
  const strategy = current.configured && requestedStrategy === "configure"
    ? "keep"
    : requestedStrategy === "configure" && hasLegacyStandards
      ? "reorganize"
      : requestedStrategy;
  if (!["keep", "configure", "reorganize", "rebuild"].includes(strategy)) {
    throw new Error(`unsupported standards initialization strategy: ${strategy}`);
  }
  const operations = [];
  const decisions = [];
  if (strategy === "keep") {
    operations.push({ action: "keep", source: "standards/", target: "standards/", reason: "standard structure already exists" });
  } else {
    if (strategy === "rebuild" && current.configured) {
      operations.push({
        action: "replace-tree",
        source: "standards/",
        target: "standards/",
        reason: "full rebuild requested; existing tree will be backed up in user cache"
      });
    }
    for (const category of STANDARD_CATEGORIES) {
      operations.push({ action: "mkdir", source: null, target: `standards/${category}/`, reason: "standard category" });
    }
    if (strategy === "reorganize") {
      for (const legacyRoot of LEGACY_ROOTS) {
        for (const locator of walkFiles(projectRoot, legacyRoot)) {
          const content = fs.readFileSync(path.join(projectRoot, locator), "utf8");
          const category = classifyCategory(locator, content);
          const target = `standards/${category}/${slug(locator)}.md`;
          if (fs.existsSync(path.join(projectRoot, target))) {
            decisions.push({ id: `collision-${sha256(locator).slice(7, 15)}`, question: `${locator} 与 ${target} 冲突，应合并还是保留？`, source: locator, target });
          } else {
            operations.push({ action: "move", source: locator, target, reason: `classified as ${category}` });
          }
        }
      }
    }
    if (strategy === "configure" || strategy === "rebuild") {
      for (const asset of starterAssets(projectRoot)) {
        if (!fs.existsSync(path.join(projectRoot, asset.locator)) || strategy === "rebuild") {
          operations.push({ action: "write", source: null, target: asset.locator, reason: "project signal matched", content: asset.content });
        }
      }
    }
  }
  const agentsPath = path.join(projectRoot, "AGENTS.md");
  if (!fs.existsSync(agentsPath)) {
    operations.push({ action: "write", source: null, target: "AGENTS.md", reason: "thin ZipZap bootstrap", content: agentsBootstrap() });
  } else {
    operations.push({ action: "keep", source: "AGENTS.md", target: "AGENTS.md", reason: "existing bootstrap requires human-guided consolidation" });
  }
  const preview = {
    schema_version: 1,
    project: { locator: projectRoot },
    strategy,
    already_configured: current.configured,
    operations: operations.map(({ content, ...operation }) => operation),
    decisions,
    requires_confirmation: operations.some((operation) =>
      ["move", "write", "replace-tree"].includes(operation.action)
    )
  };
  preview.preview_fingerprint = previewFingerprint(preview);
  return { preview, executable_operations: operations };
}

function cacheBackupRoot(projectRoot, cacheRoot) {
  const gitFile = path.join(projectRoot, ".git");
  const worktreeIdentity = fs.existsSync(gitFile) ? fs.realpathSync(gitFile) : projectRoot;
  const fingerprint = crypto.createHash("sha256").update(`${projectRoot}\0${worktreeIdentity}`).digest("hex").slice(0, 24);
  return path.join(cacheRoot ?? path.join(os.homedir(), ".cache", "zipzap"), fingerprint, "backups");
}

export function applyStandardsInitialization(input) {
  const { preview, executable_operations } = planStandardsInitialization(input);
  if (preview.decisions.length) throw new Error("standards migration has unresolved decisions");
  if (input.confirmation?.preview_fingerprint !== preview.preview_fingerprint) {
    throw new Error("standards migration requires the current preview_fingerprint");
  }
  const projectRoot = preview.project.locator;
  const backupRoot = cacheBackupRoot(projectRoot, input.cache_root);
  const changed = [];
  for (const operation of executable_operations) {
    const target = operation.target.endsWith("/") ? operation.target.slice(0, -1) : operation.target;
    const absoluteTarget = path.join(projectRoot, normalizeRelative(projectRoot, target));
    if (operation.action === "replace-tree") {
      if (fs.existsSync(absoluteTarget)) {
        const backup = path.join(
          backupRoot,
          `standards-pre-rebuild-${preview.preview_fingerprint.slice(7, 19)}`
        );
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.cpSync(absoluteTarget, backup, { recursive: true });
        fs.rmSync(absoluteTarget, { recursive: true, force: false });
      }
      changed.push(operation.target);
    } else if (operation.action === "mkdir") {
      fs.mkdirSync(absoluteTarget, { recursive: true });
    } else if (operation.action === "move") {
      fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
      fs.renameSync(path.join(projectRoot, operation.source), absoluteTarget);
      changed.push(operation.target);
    } else if (operation.action === "write") {
      if (fs.existsSync(absoluteTarget)) {
        const backup = path.join(backupRoot, operation.target);
        fs.mkdirSync(path.dirname(backup), { recursive: true });
        fs.copyFileSync(absoluteTarget, backup);
      }
      fs.mkdirSync(path.dirname(absoluteTarget), { recursive: true });
      fs.writeFileSync(absoluteTarget, operation.content);
      changed.push(operation.target);
    }
  }
  return { ...preview, applied: true, changed, backup_root: fs.existsSync(backupRoot) ? backupRoot : null, standards: discoverStandards(projectRoot) };
}

function list(value) {
  return Array.isArray(value) ? value : value == null ? [] : [value];
}

function globMatches(pattern, locator) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replaceAll("**", "\0").replaceAll("*", "[^/]*").replaceAll("\0", ".*");
  return new RegExp(`^${escaped}$`).test(locator);
}

function matchedSelectorValues(dimension, configured, actual) {
  if (dimension === "paths") {
    return configured.filter((pattern) => actual.some((locator) => globMatches(pattern, locator)));
  }
  return configured.filter((value) => actual.includes(value));
}

function contextValues(context, dimension) {
  if (dimension === "actions") return list(context.action);
  if (dimension === "risks") return list(context.risk);
  return list(context[dimension]);
}

function matchStandard(standard, context = {}) {
  const applies = standard.applies_to && typeof standard.applies_to === "object" && !Array.isArray(standard.applies_to)
    ? standard.applies_to
    : {};
  const matchedBy = [];
  for (const dimension of APPLICABILITY_DIMENSIONS) {
    const configured = list(applies[dimension]);
    if (!configured.length) continue;
    const matched = matchedSelectorValues(dimension, configured, contextValues(context, dimension));
    if (!matched.length) return null;
    matchedBy.push({ dimension, values: matched });
  }
  return matchedBy.length
    ? matchedBy
    : [{ dimension: "default", values: ["unscoped"] }];
}

function contextCoverageDiagnostics(context, selected) {
  const result = [];
  for (const dimension of ["domains", "artifacts"]) {
    const requested = list(context?.[dimension]);
    if (!requested.length) continue;
    const matched = new Set(
      selected.flatMap((standard) =>
        standard.matched_by
          .filter((item) => item.dimension === dimension)
          .flatMap((item) => item.values)
      )
    );
    const missing = requested.filter((value) => !matched.has(value));
    if (!missing.length) continue;
    result.push(diagnostic(
      `unmatched-${dimension}`,
      "standards/",
      `No scoped standard matched ${dimension}: ${missing.join(", ")}.`,
      "Review existing applicability metadata or preview a standards maintenance proposal.",
      { values: missing }
    ));
  }
  return result;
}

function routingContextDiagnostics(context) {
  const hasRoutingContext = APPLICABILITY_DIMENSIONS.some(
    (dimension) => contextValues(context ?? {}, dimension).length > 0
  );
  if (hasRoutingContext) return [];
  return [diagnostic(
    "insufficient-routing-context",
    "standards/",
    "No action, domain, artifact, path, or risk was provided for routing.",
    "Load the foundation standard and ask only for the missing routing decision."
  )];
}

export function routeStandards(input) {
  const standards = discoverStandards(input.project?.locator);
  const files = standards.files.flatMap((standard) => {
    const matchedBy = matchStandard(standard, input.context);
    return matchedBy ? [{ ...standard, matched_by: matchedBy }] : [];
  }).sort((left, right) => right.priority - left.priority || left.locator.localeCompare(right.locator));
  return {
    schema_version: 1,
    authority: "standards/",
    loading: "whole-file",
    index: standards.index,
    selected: files,
    diagnostics: [
      ...standards.diagnostics,
      ...routingContextDiagnostics(input.context),
      ...contextCoverageDiagnostics(input.context, files)
    ],
    fallback: files.length ? null : "Load standards/foundation/project.md when present, then ask for missing project rules."
  };
}

export function agentsBootstrap() {
  return `# Agent bootstrap\n\n- Use the installed ZipZap Skill for collaboration routing, gates, loops, feedback, and Git Handoff.\n- Project standards under \`standards/\` are authoritative for project-specific work.\n- Route by the active action, affected domains, artifacts, changed paths, and risk; load every selected standards file in full.\n- Do not bypass a blocking gate or claim unrecorded verification.\n- When routing is uncertain, load \`standards/foundation/project.md\` and ask only for the missing decision.\n- Repeated feedback may propose a merge into an existing standard. A repeated bootstrap gap may propose a minimal reviewed revision here; never append blindly or auto-edit this file.\n`;
}
