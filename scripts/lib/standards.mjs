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
  return {
    git: has(".git"),
    java: has("pom.xml") || has("build.gradle") || has("build.gradle.kts"),
    node: has("package.json") || has("tsconfig.json"),
    python: has("pyproject.toml") || has("requirements.txt"),
    tests: ["tests", "test", "src/test"].some(has)
  };
}

function starterAssets(projectRoot) {
  const signals = existingSignals(projectRoot);
  const assets = [
    {
      locator: "standards/foundation/project.md",
      content: "# Project standard\n\nDescribe the project boundary, source-of-truth hierarchy, and global invariants here.\n"
    }
  ];
  if (signals.java) assets.push({ locator: "standards/engineering/java.md", content: "# Java engineering standard\n\nRecord the supported Java version, build commands, module boundaries, and compatibility rules here.\n" });
  if (signals.node) assets.push({ locator: "standards/engineering/node.md", content: "# Node engineering standard\n\nRecord the package manager, runtime version, build commands, and module conventions here.\n" });
  if (signals.python) assets.push({ locator: "standards/engineering/python.md", content: "# Python engineering standard\n\nRecord the Python version, environment, build commands, and module conventions here.\n" });
  if (signals.tests) assets.push({ locator: "standards/quality/testing.md", content: "# Testing standard\n\nRecord focused checks, full acceptance commands, evidence requirements, and known limitations here.\n" });
  if (signals.git) assets.push({ locator: "standards/delivery/git.md", content: "# Git delivery standard\n\nRecord branch, commit, verification, and publication rules here. ZipZap Handoff metadata belongs to the final effective commit.\n" });
  return assets;
}

function previewFingerprint(preview) {
  const copy = structuredClone(preview);
  delete copy.preview_fingerprint;
  return sha256(JSON.stringify(copy));
}

export function discoverStandards(projectRoot) {
  const root = path.resolve(projectRoot);
  const files = walkFiles(root, "standards").map((locator) => {
    const content = fs.readFileSync(path.join(root, locator), "utf8");
    const relative = locator.slice("standards/".length);
    const category = relative.split("/", 1)[0];
    if (!STANDARD_CATEGORIES.includes(category)) {
      throw new Error(`standards file is outside a standard category: ${locator}`);
    }
    const metadata = frontmatter(content, locator);
    return {
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
  });
  return {
    configured: files.length > 0,
    root: "standards/",
    categories: [...STANDARD_CATEGORIES],
    files
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

export function routeStandards(input) {
  const standards = discoverStandards(input.project?.locator);
  const files = standards.files.filter((standard) => {
    const applies = standard.applies_to;
    const paths = list(applies.paths);
    const actions = list(applies.actions);
    const risks = list(applies.risks);
    const pathMatch = !paths.length || list(input.context?.paths).some((locator) => paths.some((pattern) => globMatches(pattern, locator)));
    const actionMatch = !actions.length || actions.includes(input.context?.action);
    const riskMatch = !risks.length || risks.includes(input.context?.risk);
    return pathMatch && actionMatch && riskMatch;
  }).sort((left, right) => right.priority - left.priority || left.locator.localeCompare(right.locator));
  return {
    schema_version: 1,
    authority: "standards/",
    loading: "whole-file",
    selected: files,
    fallback: files.length ? null : "Load standards/foundation/project.md when present, then ask for missing project rules."
  };
}

export function agentsBootstrap() {
  return `# Agent bootstrap\n\n- Use the installed ZipZap Skill for collaboration routing, gates, loops, feedback, and Git Handoff.\n- Project standards under \`standards/\` are authoritative for project-specific work.\n- Route by the active action, changed paths, and risk; load every selected standards file in full.\n- Do not bypass a blocking gate or claim unrecorded verification.\n- When routing is uncertain, load \`standards/foundation/project.md\` and ask only for the missing decision.\n- Repeated feedback may propose a merge into an existing standard. A repeated bootstrap gap may propose a minimal reviewed revision here; never append blindly or auto-edit this file.\n`;
}
