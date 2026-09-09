#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import Ajv2020 from "ajv/dist/2020.js";

import { parseMetadataCli } from "./lib/cli.mjs";
import { parseData, readData } from "./lib/data-files.mjs";
import { projectDecisionPages } from "./lib/decision-pages.mjs";
import { inspectGitHandoff, prepareGitHandoff } from "./lib/git-handoff.mjs";
import { applyLegacyCleanup, previewLegacyCleanup } from "./lib/legacy-cleanup.mjs";
import { loadSchemaDocuments, assertSchemaFile } from "./lib/schema-registry.mjs";
import {
  applyStandardsInitialization,
  discoverStandards,
  planStandardsInitialization,
  routeStandards
} from "./lib/standards.mjs";
import {
  advanceLoop,
  consolidateIssues,
  evaluateGate,
  readLoopState,
  saveLoopState
} from "./lib/workflow.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");

export const ZIPZAP_COMMANDS = {
  describe: {
    summary: "Describe one command and its machine contract.",
    usage: "describe [command] [--compact]",
    argument: true
  },
  validate: {
    summary: "Validate YML catalogs and JSON Schema contracts.",
    usage: "validate [--root <skill-dir>] [--compact]"
  },
  catalog: {
    summary: "Read one built-in catalog or catalog item.",
    usage: "catalog --kind <kind> [--id <id>] [--compact]"
  },
  initialize: {
    summary: "Preview or apply standards/ initialization.",
    usage: "initialize --input <json-or-yml> [--compact]",
    schema: "schemas/standards-initialization-input.schema.yml",
    example: "examples/zipzap/initialize.yml"
  },
  standards: {
    summary: "Discover or route project standards without a project manifest.",
    usage: "standards --input <json-or-yml> [--action <discover|route>] [--compact]",
    schema: "schemas/standards-route-input.schema.yml",
    example: "examples/zipzap/standards-route.yml"
  },
  gate: {
    summary: "Evaluate a built-in evidence and authority gate.",
    usage: "gate --input <json-or-yml> [--compact]",
    schema: "schemas/gate-input.schema.yml",
    example: "examples/zipzap/gate.yml"
  },
  loop: {
    summary: "Advance Work, Feedback, or Maintenance Loop with one model correction maximum.",
    usage: "loop --input <json-or-yml> [--action <advance|status>] [--compact]",
    schema: "schemas/loop-input.schema.yml",
    example: "examples/zipzap/loop.yml"
  },
  issues: {
    summary: "Deduplicate 问题项 and propose bounded standards improvements.",
    usage: "issues --input <json-or-yml> [--compact]",
    schema: "schemas/issues-input.schema.yml",
    example: "examples/zipzap/issues.yml"
  },
  handoff: {
    summary: "Prepare or inspect a Git Checkpoint handoff.",
    usage: "handoff --input <json-or-yml> [--action <prepare|inspect>] [--compact]",
    schema: "schemas/handoff-input.schema.yml",
    example: "examples/zipzap/handoff.yml"
  },
  "decision-pages": {
    summary: "Adapt decisions to native forms in pages of at most three questions.",
    usage: "decision-pages --input <json-or-yml> [--compact]",
    schema: "schemas/decision-pages-input.schema.yml",
    example: "examples/zipzap/decision-pages.yml"
  },
  "legacy-cleanup": {
    summary: "Preview or confirm deletion of obsolete .zipzap Task state.",
    usage: "legacy-cleanup --input <json-or-yml> [--action <preview|apply>] [--compact]",
    schema: "schemas/legacy-cleanup-input.schema.yml",
    example: "examples/zipzap/legacy-cleanup.yml"
  },
  "release-plan": {
    summary: "Build a deterministic installed-Skill inventory.",
    usage: "release-plan [--root <skill-dir>] [--compact]"
  },
  lifecycle: {
    summary: "Assess build, verify, publish, install, upgrade, or rollback.",
    usage: "lifecycle --input <json-or-yml> [--compact]",
    schema: "schemas/lifecycle-input.schema.yml",
    example: "examples/zipzap/lifecycle.yml"
  }
};

function clone(value) {
  return structuredClone(value);
}

function commandHelp(command) {
  const metadata = ZIPZAP_COMMANDS[command];
  if (!metadata) {
    throw Object.assign(new Error(`Unknown ZipZap command: ${command}`), {
      code: "unknown-command"
    });
  }
  return [
    `Usage: node scripts/zipzap.mjs ${metadata.usage}`,
    "",
    metadata.summary,
    ...(metadata.schema ? ["", `Input schema: ${metadata.schema}`] : []),
    ...(metadata.example ? [`Example: ${metadata.example}`] : [])
  ].join("\n");
}

function rootHelp() {
  const lines = [
    "Usage: node scripts/zipzap.mjs <command> [options]",
    "",
    "Git-native collaboration with project standards and bounded feedback loops.",
    "",
    "Commands:"
  ];
  for (const [name, metadata] of Object.entries(ZIPZAP_COMMANDS)) {
    lines.push(`  ${name.padEnd(18)} ${metadata.summary}`);
  }
  return lines.join("\n");
}

function readInput(inputPath) {
  if (inputPath) return readData(path.resolve(inputPath));
  const text = fs.readFileSync(0, "utf8");
  if (!text.trim()) {
    throw Object.assign(new Error("command requires --input or stdin"), {
      code: "missing-input"
    });
  }
  try {
    return JSON.parse(text);
  } catch {
    return parseData(text, "stdin.yml");
  }
}

function catalogFiles(rootDir) {
  return fs
    .readdirSync(path.join(rootDir, "config"))
    .filter((name) => name.endsWith(".yml"))
    .sort();
}

export function loadCatalogs(rootDir = DEFAULT_ROOT) {
  return Object.fromEntries(
    catalogFiles(rootDir).map((name) => [
      name.slice(0, -4),
      readData(path.join(rootDir, "config", name))
    ])
  );
}

export function validateSkill(rootDir = DEFAULT_ROOT) {
  const errors = [];
  const catalogs = loadCatalogs(rootDir);
  for (const [name, value] of Object.entries(catalogs)) {
    if (!Number.isInteger(value?.schema_version) || value.schema_version < 1) {
      errors.push(`${name}.yml must define a positive schema_version`);
    }
  }
  const documents = loadSchemaDocuments(rootDir);
  const ajv = new Ajv2020({
    allErrors: true,
    strict: false,
    validateFormats: false
  });
  try {
    for (const document of documents) ajv.addSchema(document.schema);
  } catch (error) {
    errors.push(error.message);
  }
  const lifecycle = catalogs.lifecycle;
  for (const required of lifecycle?.package?.required_files ?? []) {
    if (!fs.existsSync(path.join(rootDir, required))) {
      errors.push(`required release file is missing: ${required}`);
    }
  }
  return {
    valid: errors.length === 0,
    errors,
    counts: {
      catalogs: Object.keys(catalogs).length,
      schemas: documents.length
    }
  };
}

function safePackagePath(rootDir, relative) {
  const absolute = path.resolve(rootDir, relative);
  const fromRoot = path.relative(rootDir, absolute);
  if (fromRoot.startsWith("..") || path.isAbsolute(fromRoot)) {
    throw new Error(`package path escapes Skill root: ${relative}`);
  }
  return absolute;
}

function packageFiles(rootDir, includeRoots) {
  const result = [];
  const visit = (absolute) => {
    const stat = fs.lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      throw new Error(`release package cannot contain symbolic links: ${absolute}`);
    }
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(absolute).sort()) {
        visit(path.join(absolute, name));
      }
    } else if (stat.isFile()) {
      const content = fs.readFileSync(absolute);
      result.push({
        path: path.relative(rootDir, absolute).split(path.sep).join("/"),
        sha256: crypto.createHash("sha256").update(content).digest("hex"),
        size: content.length
      });
    }
  };
  for (const relative of includeRoots) {
    visit(safePackagePath(rootDir, relative));
  }
  return result.sort((left, right) => left.path.localeCompare(right.path));
}

export function buildReleaseManifest(rootDir = DEFAULT_ROOT) {
  const catalogs = loadCatalogs(rootDir);
  const lifecycle = catalogs.lifecycle;
  const compatibility = catalogs.compatibility;
  return {
    schema_version: 1,
    skill: clone(lifecycle.skill),
    package_format: lifecycle.package.format,
    interfaces: {
      workflow: compatibility.interfaces.workflow.current,
      handoff: compatibility.interfaces.handoff.current
    },
    catalogs: Object.fromEntries(
      Object.entries(catalogs).map(([name, value]) => [name, value.schema_version])
    ),
    runtime_dependencies: [],
    release_requirements: clone(lifecycle.release_gates),
    files: packageFiles(rootDir, lifecycle.package.include_roots)
  };
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function assessLifecycle(input, rootDir = DEFAULT_ROOT) {
  const catalogs = loadCatalogs(rootDir);
  const current = buildReleaseManifest(rootDir);
  const checks = [];
  let releaseManifest = null;
  if (input.operation === "build-release") {
    releaseManifest = current;
    const validation = validateSkill(rootDir);
    checks.push({
      id: "catalog-valid",
      passed: validation.valid,
      message: validation.valid
        ? "YML catalogs and schemas are valid."
        : validation.errors.join("; ")
    });
  } else if (["verify-release", "publish"].includes(input.operation)) {
    releaseManifest = input.release_manifest;
    const inventoryMatches = same(input.release_manifest, current);
    checks.push({
      id: "release-inventory",
      passed: inventoryMatches,
      message: inventoryMatches
        ? "Release inventory matches."
        : "Rebuild the release manifest from this artifact."
    });
    if (input.operation === "publish") {
      const evidence = new Map(
        (input.evidence ?? []).map((item) => [item.gate, item])
      );
      for (const gate of catalogs.lifecycle.release_gates) {
        const passed = evidence.get(gate)?.status === "passed";
        checks.push({
          id: `gate-${gate}`,
          passed,
          message: passed ? `${gate} passed.` : `${gate} evidence is missing.`
        });
      }
    }
  } else {
    const targetMatches =
      input.target_version === catalogs.lifecycle.skill.version ||
      input.operation === "rollback";
    checks.push({
      id: "target-version",
      passed: targetMatches,
      message: targetMatches
        ? "Target version matches this Skill."
        : "Target version must match this installed Skill."
    });
    const hostCompatible = input.host_conformance?.compatible === true;
    checks.push({
      id: "host",
      passed: hostCompatible,
      message: hostCompatible
        ? "Host is compatible."
        : "Host compatibility is required."
    });
    if (input.operation === "upgrade" && input.project?.locator) {
      const legacy = previewLegacyCleanup(input.project.locator);
      checks.push({
        id: "legacy-task-state",
        passed: !legacy.present,
        message: legacy.present
          ? `Confirm deletion of ${legacy.file_count} obsolete .zipzap files (${legacy.total_bytes} bytes).`
          : "No obsolete .zipzap state exists.",
        details: legacy
      });
    }
  }
  const failed = checks.filter((check) => !check.passed);
  return {
    schema_version: 1,
    operation: input.operation,
    status: failed.length ? "blocked" : "ready",
    allowed: failed.length === 0,
    release_manifest: releaseManifest,
    checks,
    required_actions: failed.map((check) => check.message),
    migration_plan:
      input.operation === "upgrade" ? clone(catalogs.lifecycle.migrations) : [],
    next_actions: failed.length
      ? []
      : ["Proceed with the requested lifecycle operation."]
  };
}

function commandDescription(subject) {
  if (!subject) {
    return { schema_version: 1, commands: ZIPZAP_COMMANDS };
  }
  const metadata = ZIPZAP_COMMANDS[subject];
  if (!metadata) {
    throw Object.assign(new Error(`Unknown ZipZap command: ${subject}`), {
      code: "unknown-command"
    });
  }
  return { schema_version: 1, command: subject, ...metadata };
}

function executeCommand(options, rootDir) {
  const command = options.command;
  if (command === "validate") return validateSkill(rootDir);
  if (command === "describe") return commandDescription(options.subject);
  if (command === "catalog") {
    const catalogs = loadCatalogs(rootDir);
    const value = catalogs[options.kind];
    if (!value) throw new Error(`unknown catalog: ${options.kind}`);
    if (!options.id) return value;
    for (const child of Object.values(value)) {
      if (
        child &&
        typeof child === "object" &&
        !Array.isArray(child) &&
        Object.hasOwn(child, options.id)
      ) {
        return child[options.id];
      }
    }
    throw new Error(`catalog item not found: ${options.kind}/${options.id}`);
  }
  if (command === "release-plan") return buildReleaseManifest(rootDir);

  const input = readInput(options.input);
  const metadata = ZIPZAP_COMMANDS[command];
  if (metadata.schema) assertSchemaFile(rootDir, metadata.schema, input);
  if (command === "initialize") {
    const planned = planStandardsInitialization(input);
    return input.action === "apply"
      ? applyStandardsInitialization(input)
      : planned.preview;
  }
  if (command === "standards") {
    return options.action === "discover"
      ? discoverStandards(input.project.locator)
      : routeStandards(input);
  }
  if (command === "gate") return evaluateGate(input);
  if (command === "loop") {
    if (options.action === "status") {
      return readLoopState(input.project.locator, input.cache_root);
    }
    const result = advanceLoop(input);
    return {
      ...result,
      cache_locator:
        input.persist === false ? null : saveLoopState(input, result)
    };
  }
  if (command === "issues") return consolidateIssues(input);
  if (command === "handoff") {
    return options.action === "inspect"
      ? inspectGitHandoff(input)
      : prepareGitHandoff(input);
  }
  if (command === "decision-pages") return projectDecisionPages(input);
  if (command === "legacy-cleanup") {
    return options.action === "apply"
      ? applyLegacyCleanup(input)
      : previewLegacyCleanup(input.project.locator);
  }
  if (command === "lifecycle") return assessLifecycle(input, rootDir);
  throw Object.assign(new Error(`Unknown ZipZap command: ${command}`), {
    code: "unknown-command"
  });
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseMetadataCli({
    argv,
    commands: ZIPZAP_COMMANDS,
    executable: "node scripts/zipzap.mjs",
    description:
      "Git-native collaboration with project standards and bounded feedback loops.",
    optionSpecs: [
      { flags: "--input <file>", description: "JSON or YML input file" },
      { flags: "--root <dir>", description: "Skill root" },
      { flags: "--compact", description: "compact JSON output" },
      { flags: "--action <action>", description: "command action" },
      { flags: "--kind <kind>", description: "catalog kind" },
      { flags: "--id <id>", description: "catalog item id" }
    ]
  });
  if (options.help) {
    return {
      help: options.command ? commandHelp(options.command) : rootHelp()
    };
  }
  return {
    value: executeCommand(
      options,
      path.resolve(options.root ?? DEFAULT_ROOT)
    ),
    compact: options.compact === true
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = runCli();
    if (result.help) process.stdout.write(`${result.help}\n`);
    else {
      process.stdout.write(
        `${JSON.stringify(result.value, null, result.compact ? 0 : 2)}\n`
      );
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({
        error: {
          code: error.code ?? "command-failed",
          message: error.message,
          hint: error.hint ?? null,
          details: error.details ?? null
        }
      })}\n`
    );
    process.exitCode = 1;
  }
}
