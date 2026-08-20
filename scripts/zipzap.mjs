#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  inferDocumentKind,
  inferDocumentRoutes,
  resolveDocumentRoute
} from "./lib/document-routing.mjs";
import {
  applyRuleHealthDisposition,
  diagnoseRuleHealth,
  listIgnoredRuleFindings
} from "./lib/rule-health.mjs";
import { selectReconciliationAction } from "./lib/loop-controller.mjs";
import {
  loadModuleCatalog,
  validateModuleCatalog
} from "./lib/module-catalog.mjs";

export {
  applyDocumentMaintenance,
  inferDocumentKind,
  inferDocumentRoutes,
  planDocumentMaintenance,
  resolveDocumentRoute
} from "./lib/document-routing.mjs";
export {
  applyRuleHealthDisposition,
  diagnoseRuleHealth,
  listIgnoredRuleFindings
} from "./lib/rule-health.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, "..");
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const RELEASE_CHANNELS = new Set([
  "development",
  "alpha",
  "beta",
  "rc",
  "stable"
]);
const PROJECT_GITIGNORE = `# Derived or machine-local ZipZap state
/reports/
/cache/
/state/
/locks/
/index.json
*.tmp
`;
const ASSURANCE_KEYS = [
  "second_context",
  "peer_challenge",
  "tester_separate_from_developer",
  "reviewer_separate_from_developer",
  "reviewer_separate_from_tester",
  "product_separate_from_coordinator"
];
const ZIPZAP_COMMANDS = {
  validate: {
    summary: "Validate catalogs, schemas, and lifecycle policy.",
    usage: "validate [--root <skill-dir>] [--compact]"
  },
  catalog: {
    summary: "Query a narrow catalog item or section.",
    usage:
      "catalog --kind <kind> [--id <id>] [--section <section>] [--compact]"
  },
  initialize: {
    summary: "Discover, configure, or refresh project collaboration.",
    usage: "initialize --input <file> [--compact]",
    schema: "schemas/l5-input.schema.json",
    example: "examples/zipzap/initialize.json"
  },
  "first-run": {
    summary: "Guide discovery, visible preferences, preview, and configuration.",
    usage: "first-run --input <file> [--compact]",
    schema: "schemas/first-run-input.schema.json",
    example: "examples/zipzap/first-run.json"
  },
  onboard: {
    summary: "Start or advance guided preference setup.",
    usage: "onboard --input <file> [--compact]",
    schema: "schemas/onboarding-input.schema.json",
    example: "examples/zipzap/onboard.json"
  },
  "source-resolve": {
    summary: "Resolve registered project sources for a focused query.",
    usage: "source-resolve --input <file> [--compact]",
    schema: "schemas/source-resolution-input.schema.json",
    example: "examples/zipzap/source-resolve.json"
  },
  "document-route": {
    summary: "Resolve one governed document destination without writing it.",
    usage: "document-route --input <file> [--compact]",
    schema: "schemas/document-route-input.schema.json",
    example: "examples/zipzap/document-route.json"
  },
  "rule-health": {
    summary:
      "Run quick, standard, or deep rule health explicitly. Diagnosis is read-only; ignore and restore write dispositions.",
    usage: "rule-health --input <file> [--compact]",
    schema: "schemas/rule-health-input.schema.json",
    example: "examples/zipzap/rule-health.json"
  },
  invoke: {
    summary: "Invoke the stable L5 collaboration interface.",
    usage: "invoke --input <file> [--compact]",
    schema: "schemas/l5-adapter-input.schema.json",
    example: "examples/zipzap/invoke.json"
  },
  "task-prepare": {
    summary: "Prepare a persistent Task for risk assessment.",
    usage: "task-prepare --input <file> [--compact]",
    schema: "schemas/task.schema.json",
    example: "examples/task/create.json"
  },
  "task-adapt": {
    summary: "Adapt a persistent Task into or from L5 execution.",
    usage: "task-adapt --input <file> [--compact]",
    schema: "schemas/task-adapter-input.schema.json"
  },
  "normalize-risk": {
    summary: "Normalize evidence-backed risk assessment deterministically.",
    usage: "normalize-risk --input <file> [--compact]",
    schema: "schemas/risk-normalization-input.schema.json",
    example: "examples/zipzap/design-diagnostic.json"
  },
  conform: {
    summary: "Assess host compatibility for one L5 operation.",
    usage:
      "conform --operation <operation> [--action <action>] --input <file> [--compact]",
    schema: "schemas/host-capabilities.schema.json",
    example: "examples/zipzap/conform.json"
  },
  evaluate: {
    summary: "Evaluate one ready L4 Kernel request.",
    usage: "evaluate --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json",
    example: "examples/zipzap/evaluate.json"
  },
  compose: {
    summary: "Inspect full L4 runtime composition diagnostics.",
    usage: "compose --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json",
    example: "examples/zipzap/evaluate.json"
  },
  resolve: {
    summary: "Inspect only L4 preset resolution.",
    usage: "resolve --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json",
    example: "examples/zipzap/evaluate.json"
  },
  bind: {
    summary: "Inspect L4 preset resolution and participant binding.",
    usage: "bind --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json",
    example: "examples/zipzap/evaluate.json"
  },
  project: {
    summary: "Inspect the current minimal runtime projection.",
    usage: "project --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json",
    example: "examples/zipzap/evaluate.json"
  },
  reconcile: {
    summary: "Inspect projection reconciliation for a runtime event.",
    usage: "reconcile --input <file> [--compact]",
    schema: "schemas/runtime-input.schema.json"
  },
  "release-plan": {
    summary: "Build a deterministic release inventory.",
    usage: "release-plan [--root <skill-dir>] [--compact]"
  },
  "install-check": {
    summary: "Assess installation eligibility from host conformance.",
    usage: "install-check --input <file> [--compact]"
  },
  lifecycle: {
    summary:
      "Assess build, publish, install, upgrade, post-upgrade, or rollback.",
    usage: "lifecycle --input <file> [--compact]",
    schema: "schemas/lifecycle-input.schema.json",
    example: "examples/zipzap/lifecycle.json"
  }
};

class CliUsageError extends Error {
  constructor(code, message, hint) {
    super(message);
    this.code = code;
    this.hint = hint;
  }
}

function commandHelp(command) {
  const metadata = ZIPZAP_COMMANDS[command];
  if (!metadata) {
    throw new CliUsageError(
      "unknown-command",
      `Unknown ZipZap command: ${command}`,
      "Run `node scripts/zipzap.mjs --help` to list available commands."
    );
  }
  const details = [
    `Usage: node scripts/zipzap.mjs ${metadata.usage}`,
    "",
    metadata.summary
  ];
  if (metadata.schema) {
    details.push("", `Input schema: ${metadata.schema}`);
  }
  if (metadata.example) {
    details.push(
      `Example input: ${metadata.example}`,
      `Print example: node scripts/zipzap.mjs ${command} --example`
    );
  }
  if (metadata.schema || command === "install-check") {
    details.push(
      "",
      "Input may be supplied with --input <file> or as JSON on stdin."
    );
  }
  details.push("Use --compact for single-line JSON output.");
  return `${details.join("\n")}\n`;
}

function globalHelp() {
  const commands = Object.entries(ZIPZAP_COMMANDS)
    .map(([command, metadata]) => `  ${command.padEnd(16)} ${metadata.summary}`)
    .join("\n");
  return `ZipZap collaboration CLI

Usage:
  node scripts/zipzap.mjs <command> [options]
  node scripts/zipzap.mjs <command> --help
  node scripts/zipzap.mjs <command> --example

Commands:
${commands}

Global options:
  -h, --help          Show global or command help.
  --root <skill-dir>  Read catalogs and examples from another Skill root.
  --compact           Emit single-line JSON.

Run \`node scripts/zipzap.mjs <command> --help\` for command details.
`;
}

function optionValue(args, flag) {
  const value = args.shift();
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(
      "missing-option-value",
      `${flag} requires a value.`,
      `Run \`node scripts/zipzap.mjs --help\` or command-level --help.`
    );
  }
  return value;
}

function parseInputJson(text, source, command) {
  if (!text.trim()) {
    throw new CliUsageError(
      "input-required",
      `No JSON input was provided for ${command}.`,
      `Use --input <file>, pipe JSON on stdin, or run \`node scripts/zipzap.mjs ${command} --example\`.`
    );
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliUsageError(
      "invalid-json",
      `Invalid JSON from ${source}: ${error.message}`,
      `Compare the input with \`node scripts/zipzap.mjs ${command} --example\` and its registered schema.`
    );
  }
}

function structuredCliError(error, command) {
  const knownCommand = ZIPZAP_COMMANDS[command] ? command : null;
  let code = error.code ?? "command-failed";
  let hint = error.hint;
  if (error instanceof SyntaxError) code = "invalid-json";
  if (!hint && error.code === "ENOENT") {
    code = "file-not-found";
    hint = "Check the supplied file or project path and try again.";
  }
  if (!error.code && /revision mismatch|stale revision/i.test(error.message)) {
    code = "revision-conflict";
    hint = "Reload current state, preserve the latest revision, and retry.";
  }
  if (
    !error.code &&
    /\b(must|requires|invalid|unknown .* field|cannot)\b/i.test(error.message)
  ) {
    code = "invalid-input";
  }
  if (!hint) {
    hint = knownCommand
      ? "Check the command input against its example and schema."
      : "Run the global help to select a supported command.";
  }
  return {
    ok: false,
    error: {
      code,
      message: error.message,
      hint,
      help: knownCommand
        ? `node scripts/zipzap.mjs ${knownCommand} --help`
        : "node scripts/zipzap.mjs --help"
    }
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function slug(value, fallback = "work") {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function unique(values) {
  return [...new Set(values)];
}

function trueEntries(object) {
  return Object.fromEntries(
    Object.entries(object).filter(([, value]) => value === true)
  );
}

function assertObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertAllowedFields(value, fields, label) {
  assertObject(value, label);
  const allowed = new Set(fields);
  for (const field of Object.keys(value)) {
    if (!allowed.has(field)) {
      throw new Error(`unknown ${label} field: ${field}`);
    }
  }
}

export function loadCatalogs(rootDir = DEFAULT_ROOT) {
  const configDir = path.join(rootDir, "config");
  const schemaDir = path.join(rootDir, "schemas");
  const moduleCatalog = loadModuleCatalog(rootDir);
  const roleModules = Object.fromEntries(
    moduleCatalog.by_kind.role.map((moduleId) => [
      moduleId.slice("role:".length),
      moduleCatalog.modules[moduleId].value
    ])
  );
  return {
    rootDir,
    moduleCatalog,
    invariants: readJson(path.join(configDir, "invariants.json")),
    agents: readJson(path.join(configDir, "agents.json")),
    roles: { schema_version: 1, roles: roleModules },
    teams: readJson(path.join(configDir, "teams.json")),
    controlFunctions: readJson(path.join(configDir, "control-functions.json")),
    runtimePolicy: moduleCatalog.modules["policy:runtime"].value,
    executionProfiles: readJson(
      path.join(configDir, "execution-profiles.json")
    ),
    riskTaxonomy: readJson(path.join(configDir, "risk-taxonomy.json")),
    taskPolicy: readJson(path.join(configDir, "task-policy.json")),
    onboarding: readJson(path.join(configDir, "onboarding.json")),
    compatibility: readJson(path.join(configDir, "compatibility.json")),
    experience: readJson(path.join(configDir, "experience.json")),
    lifecycle: readJson(path.join(configDir, "lifecycle.json")),
    schemas: {
      moduleCatalog: readJson(
        path.join(schemaDir, "module-catalog.schema.json")
      ),
      l5Input: readJson(path.join(schemaDir, "l5-input.schema.json")),
      l5Output: readJson(path.join(schemaDir, "l5-output.schema.json")),
      decisionBundle: readJson(
        path.join(schemaDir, "decision-bundle.schema.json")
      ),
      decisionInteraction: readJson(
        path.join(schemaDir, "decision-interaction.schema.json")
      ),
      userView: readJson(path.join(schemaDir, "user-view.schema.json")),
      hostCapabilityMatrix: readJson(
        path.join(schemaDir, "host-capability-matrix.schema.json")
      ),
      l5AdapterInput: readJson(
        path.join(schemaDir, "l5-adapter-input.schema.json")
      ),
      projectManifest: readJson(
        path.join(schemaDir, "project-manifest.schema.json")
      ),
      onboardingInput: readJson(
        path.join(schemaDir, "onboarding-input.schema.json")
      ),
      onboardingOutput: readJson(
        path.join(schemaDir, "onboarding-output.schema.json")
      ),
      firstRunInput: readJson(
        path.join(schemaDir, "first-run-input.schema.json")
      ),
      firstRunOutput: readJson(
        path.join(schemaDir, "first-run-output.schema.json")
      ),
      sourceResolutionInput: readJson(
        path.join(schemaDir, "source-resolution-input.schema.json")
      ),
      sourceResolutionOutput: readJson(
        path.join(schemaDir, "source-resolution-output.schema.json")
      ),
      documentRouteInput: readJson(
        path.join(schemaDir, "document-route-input.schema.json")
      ),
      documentRouteOutput: readJson(
        path.join(schemaDir, "document-route-output.schema.json")
      ),
      documentMaintenanceInput: readJson(
        path.join(schemaDir, "document-maintenance-input.schema.json")
      ),
      documentMaintenanceOutput: readJson(
        path.join(schemaDir, "document-maintenance-output.schema.json")
      ),
      ruleHealthInput: readJson(
        path.join(schemaDir, "rule-health-input.schema.json")
      ),
      ruleHealthOutput: readJson(
        path.join(schemaDir, "rule-health-output.schema.json")
      ),
      ruleHealthIgnore: readJson(
        path.join(schemaDir, "rule-health-ignore.schema.json")
      ),
      runtimeInput: readJson(path.join(schemaDir, "runtime-input.schema.json")),
      runtimeOutput: readJson(path.join(schemaDir, "runtime-output.schema.json")),
      riskAssessmentInput: readJson(
        path.join(schemaDir, "risk-assessment-input.schema.json")
      ),
      riskAssessmentOutput: readJson(
        path.join(schemaDir, "risk-assessment-output.schema.json")
      ),
      riskNormalizationInput: readJson(
        path.join(schemaDir, "risk-normalization-input.schema.json")
      ),
      riskNormalizationOutput: readJson(
        path.join(schemaDir, "risk-normalization-output.schema.json")
      ),
      task: readJson(path.join(schemaDir, "task.schema.json")),
      taskEvent: readJson(path.join(schemaDir, "task-event.schema.json")),
      feedback: readJson(path.join(schemaDir, "feedback.schema.json")),
      reviewResult: readJson(path.join(schemaDir, "review-result.schema.json")),
      diagnosticReview: readJson(
        path.join(schemaDir, "diagnostic-review.schema.json")
      ),
      resourceUsage: readJson(
        path.join(schemaDir, "resource-usage.schema.json")
      ),
      taskReport: readJson(path.join(schemaDir, "task-report.schema.json")),
      capabilityReport: readJson(
        path.join(schemaDir, "capability-report.schema.json")
      ),
      taskAdapterInput: readJson(
        path.join(schemaDir, "task-adapter-input.schema.json")
      ),
      taskAdapterOutput: readJson(
        path.join(schemaDir, "task-adapter-output.schema.json")
      ),
      hostCapabilities: readJson(
        path.join(schemaDir, "host-capabilities.schema.json")
      ),
      conformanceResult: readJson(
        path.join(schemaDir, "conformance-result.schema.json")
      ),
      conformanceVector: readJson(
        path.join(schemaDir, "conformance-vector.schema.json")
      ),
      releaseManifest: readJson(
        path.join(schemaDir, "release-manifest.schema.json")
      ),
      lifecycleInput: readJson(
        path.join(schemaDir, "lifecycle-input.schema.json")
      ),
      lifecycleOutput: readJson(
        path.join(schemaDir, "lifecycle-output.schema.json")
      )
    }
  };
}

export function validateCatalogs(catalogs) {
  const errors = [];
  try {
    validateModuleCatalog({
      schema_version: catalogs.moduleCatalog.schema_version,
      modules: catalogs.moduleCatalog.definitions
    });
  } catch (error) {
    errors.push(error.message);
  }
  const agents = catalogs.agents.agents ?? {};
  const roles = catalogs.roles.roles ?? {};
  const teams = catalogs.teams.teams ?? {};
  const functions = catalogs.controlFunctions.control_functions ?? {};
  const policy = catalogs.runtimePolicy;
  const executionProfiles = catalogs.executionProfiles ?? {};
  const riskSignals = catalogs.riskTaxonomy?.signals ?? {};
  const taskPolicy = catalogs.taskPolicy ?? {};
  const onboarding = catalogs.onboarding ?? {};
  const compatibility = catalogs.compatibility ?? {};
  const experience = catalogs.experience ?? {};
  const lifecycle = catalogs.lifecycle ?? {};

  for (const [group, records] of Object.entries({
    agent: agents,
    role: roles,
    team: teams,
    "control-function": functions
  })) {
    for (const id of Object.keys(records)) {
      if (!ID_PATTERN.test(id)) {
        errors.push(`${group} id is not kebab-case: ${id}`);
      }
    }
  }

  if (new Set(catalogs.teams.order ?? []).size !== Object.keys(teams).length) {
    errors.push("team order must contain every team exactly once");
  }
  for (const teamId of catalogs.teams.order ?? []) {
    if (!teams[teamId]) {
      errors.push(`team order references unknown team: ${teamId}`);
    }
  }

  for (const [teamId, team] of Object.entries(teams)) {
    for (const field of [
      "display_name",
      "summary",
      "select_when",
      "avoid_when",
      "members",
      "assurance",
      "schedule_waves",
      "degradation"
    ]) {
      if (team[field] == null) {
        errors.push(`${teamId} must define ${field}`);
      }
    }
    const slots = new Set();
    for (const member of team.members ?? []) {
      if (slots.has(member.slot)) {
        errors.push(`${teamId} repeats slot ${member.slot}`);
      }
      slots.add(member.slot);
      if (!agents[member.profile]) {
        errors.push(`${teamId}.${member.slot} references unknown profile ${member.profile}`);
      }
      for (const roleId of member.roles ?? []) {
        if (!roles[roleId]) {
          errors.push(`${teamId}.${member.slot} references unknown role ${roleId}`);
        }
      }
      for (const functionId of member.functions ?? []) {
        if (!functions[functionId]) {
          errors.push(
            `${teamId}.${member.slot} references unknown control function ${functionId}`
          );
        }
      }
    }
    for (const wave of team.schedule_waves ?? []) {
      for (const slot of wave) {
        if (!slots.has(slot)) {
          errors.push(`${teamId} schedule references unknown slot ${slot}`);
        }
      }
    }
    for (const key of ASSURANCE_KEYS) {
      if (typeof team.assurance?.[key] !== "boolean") {
        errors.push(`${teamId} assurance ${key} must be boolean`);
      }
    }
  }

  for (const [roleId, role] of Object.entries(roles)) {
    for (const field of [
      "purpose",
      "select_when",
      "responsibilities",
      "authority",
      "inputs",
      "capsule",
      "rule_selectors",
      "stages",
      "escalation",
      "independence",
      "completion_claims"
    ]) {
      if (role[field] == null) {
        errors.push(`${roleId} must define ${field}`);
      }
    }
    const standardStages = new Set(catalogs.invariants.standard_stages ?? []);
    for (const stageId of Object.keys(role.stages ?? {})) {
      if (!standardStages.has(stageId)) {
        errors.push(`${roleId} references unknown standard stage ${stageId}`);
      }
    }
  }

  for (const [profileId, profile] of Object.entries(agents)) {
    for (const field of [
      "display_name",
      "summary",
      "working_style",
      "strengths",
      "capsule"
    ]) {
      if (profile[field] == null) {
        errors.push(`${profileId} must define ${field}`);
      }
    }
  }

  for (const [gate, requirement] of Object.entries(
    policy.gate_requirements ?? {}
  )) {
    for (const key of Object.keys(requirement)) {
      if (!ASSURANCE_KEYS.includes(key)) {
        errors.push(`${gate} references unknown assurance key ${key}`);
      }
    }
  }
  for (const [risk, requirement] of Object.entries(
    policy.risk_requirements ?? {}
  )) {
    for (const key of Object.keys(requirement)) {
      if (!ASSURANCE_KEYS.includes(key)) {
        errors.push(`${risk} references unknown assurance key ${key}`);
      }
    }
  }
  for (const [targetId, target] of Object.entries(
    executionProfiles.assurance_targets ?? {}
  )) {
    if (!ID_PATTERN.test(targetId)) {
      errors.push(`assurance target id is not kebab-case: ${targetId}`);
    }
    for (const gate of target.required_gates ?? []) {
      if (!policy.gate_requirements?.[gate]) {
        errors.push(`${targetId} references unknown gate ${gate}`);
      }
    }
    if (
      !Array.isArray(target.required_gates) ||
      !Array.isArray(target.requires_approval) ||
      typeof target.persistence_required !== "boolean" ||
      typeof target.claim_limit !== "string"
    ) {
      errors.push(`assurance target is incomplete: ${targetId}`);
    }
  }
  for (const [intent, targetId] of Object.entries(
    executionProfiles.intent_defaults ?? {}
  )) {
    if (
      !ID_PATTERN.test(intent) ||
      !executionProfiles.assurance_targets?.[targetId]
    ) {
      errors.push(`intent default is invalid: ${intent}`);
    }
  }
  for (const [profileId, executionProfile] of Object.entries(
    executionProfiles.profiles ?? {}
  )) {
    if (!ID_PATTERN.test(profileId)) {
      errors.push(`execution profile id is not kebab-case: ${profileId}`);
    }
    const role = roles[executionProfile.role];
    if (!role?.stages?.[executionProfile.stage]) {
      errors.push(
        `${profileId} references invalid role stage ${executionProfile.role}.${executionProfile.stage}`
      );
    }
    for (const target of executionProfile.match?.assurance_target ?? []) {
      if (!executionProfiles.assurance_targets?.[target]) {
        errors.push(`${profileId} references unknown assurance target ${target}`);
      }
    }
    if (
      ["intent", "scope_depth", "assurance_target"].some(
        (field) =>
          !Array.isArray(executionProfile.match?.[field]) ||
          executionProfile.match[field].length === 0
      ) ||
      Object.values(executionProfile.match ?? {}).some(
        (values) => !Array.isArray(values) || values.length === 0
      ) ||
      executionProfile.risk_processing?.require_exposure !== true ||
      executionProfile.risk_processing?.subject_effects !== "focus-only" ||
      executionProfile.risk_processing?.action_effects !== "require-upgrade"
    ) {
      errors.push(`${profileId} must define deterministic routing policy`);
    }
    for (const [signalId, focus] of Object.entries(
      executionProfile.signal_focus ?? {}
    )) {
      if (!riskSignals[signalId]) {
        errors.push(`${profileId} references unknown risk signal ${signalId}`);
      }
      if (!Array.isArray(focus) || focus.length === 0) {
        errors.push(`${profileId}.${signalId} must define review focus`);
      }
    }
    const budget = executionProfile.default_budget;
    if (
      !["light", "standard", "deep"].includes(budget?.evidence) ||
      !Number.isInteger(budget?.max_source_files) ||
      budget.max_source_files < 1 ||
      typeof budget.allow_tests !== "boolean" ||
      typeof budget.allow_mutations !== "boolean" ||
      typeof budget.allow_persistence !== "boolean"
    ) {
      errors.push(`${profileId} must define a valid default budget`);
    }
    for (const field of [
      "purpose",
      "context_order",
      "review_focus",
      "required_outputs",
      "exit_gate",
      "prohibited",
      "upgrade_triggers"
    ]) {
      if (executionProfile.capsule?.[field] == null) {
        errors.push(`${profileId} capsule must define ${field}`);
      }
    }
    if (
      executionProfile.capsule?.id !== profileId ||
      executionProfile.capsule?.role !== executionProfile.role ||
      executionProfile.capsule?.stage !== executionProfile.stage
    ) {
      errors.push(`${profileId} capsule identity must match its route`);
    }
  }
  for (const [signalId, signal] of Object.entries(riskSignals)) {
    if (!ID_PATTERN.test(signalId)) {
      errors.push(`risk signal id is not kebab-case: ${signalId}`);
    }
    if (
      typeof signal.summary !== "string" ||
      signal.summary.trim() === "" ||
      !signal.effects
    ) {
      errors.push(`risk signal is incomplete: ${signalId}`);
      continue;
    }
    for (const field of [
      "risk_flags",
      "required_gates",
      "required_evidence",
      "requires_approval"
    ]) {
      if (!Array.isArray(signal.effects[field])) {
        errors.push(`${signalId} effects.${field} must be an array`);
      }
    }
    for (const riskFlag of signal.effects.risk_flags ?? []) {
      if (!policy.risk_requirements?.[riskFlag]) {
        errors.push(`${signalId} references unknown risk flag ${riskFlag}`);
      }
    }
    for (const gate of signal.effects.required_gates ?? []) {
      if (!policy.gate_requirements?.[gate]) {
        errors.push(`${signalId} references unknown gate ${gate}`);
      }
    }
    if (typeof signal.effects.persistence_required !== "boolean") {
      errors.push(`${signalId} must define persistence_required`);
    }
  }
  const taskStatuses = new Set([
    "in-progress",
    "blocked",
    "review",
    "completed"
  ]);
  if (
    taskPolicy.local_store?.event_format !== "one-json-file-per-event" ||
    taskPolicy.local_store?.legacy_event_format !==
      "monthly-jsonl-read-only" ||
    taskPolicy.local_store?.feedback_locator !== ".zipzap/feedback" ||
    taskPolicy.local_store?.feedback_format !==
      "one-json-file-per-feedback"
  ) {
    errors.push("task policy must define Git-shareable events and Feedback");
  }
  if (
    taskPolicy.task_standard?.version !== 1 ||
    taskPolicy.task_standard?.default_status !== "ready" ||
    JSON.stringify(taskPolicy.task_standard?.creation_statuses) !==
      JSON.stringify(["ready", "blocked"]) ||
    (taskPolicy.task_standard?.non_waivable_requirements ?? []).some(
      (requirement) =>
        ![
          "work.objective",
          "work.acceptance_criteria"
        ].includes(requirement)
    ) ||
    JSON.stringify(
      taskPolicy.task_standard?.expedite_waivable_requirements
    ) !==
      JSON.stringify([
        "work.affected_components",
        "planning.target_finish-or-deadline"
      ])
  ) {
    errors.push("task policy must define Task Standard v1 Ready creation");
  }
  for (const workflowStatus of [
    "ready",
    "decision-required",
    "blocked",
    "completed"
  ]) {
    const taskStatus =
      taskPolicy.response_status_to_task_status?.[workflowStatus];
    if (!taskStatuses.has(taskStatus)) {
      errors.push(`task policy must map workflow status ${workflowStatus}`);
    }
  }
  for (const [policyId, enabled] of Object.entries(taskPolicy.policies ?? {})) {
    if (!ID_PATTERN.test(policyId.replaceAll("_", "-")) || enabled !== true) {
      errors.push(`task policy must be enabled: ${policyId}`);
    }
  }
  const onboardingQuestionIds = new Set();
  for (const question of onboarding.questions ?? []) {
    if (
      !ID_PATTERN.test(question.id ?? "") ||
      onboardingQuestionIds.has(question.id)
    ) {
      errors.push(`onboarding question id must be unique kebab-case: ${question.id}`);
    }
    onboardingQuestionIds.add(question.id);
    if (
      typeof question.field !== "string" ||
      !["core", "advanced"].includes(question.group) ||
      !Array.isArray(question.options) ||
      question.options.length === 0
    ) {
      errors.push(`onboarding question is incomplete: ${question.id}`);
    }
    if (
      question.options.filter((option) => option.recommended === true).length >
      1
    ) {
      errors.push(`onboarding question has multiple recommended options: ${question.id}`);
    }
  }
  for (const [policyId, enabled] of Object.entries(onboarding.policies ?? {})) {
    if (!ID_PATTERN.test(policyId.replaceAll("_", "-")) || enabled !== true) {
      errors.push(`onboarding policy must be enabled: ${policyId}`);
    }
  }

  const invariantIds = new Set();
  for (const invariant of catalogs.invariants.invariants ?? []) {
    if (!ID_PATTERN.test(invariant.id)) {
      errors.push(`invariant id is not kebab-case: ${invariant.id}`);
    }
    if (invariantIds.has(invariant.id)) {
      errors.push(`duplicate invariant id: ${invariant.id}`);
    }
    invariantIds.add(invariant.id);
  }

  for (const [name, schema] of Object.entries(catalogs.schemas ?? {})) {
    if (
      schema?.$schema !== "https://json-schema.org/draft/2020-12/schema" ||
      schema?.type !== "object"
    ) {
      errors.push(`${name} must be a JSON Schema 2020-12 object schema`);
    }
  }

  const adapters = compatibility.adapters ?? {};
  const adapterOrder = compatibility.adapter_order ?? [];
  if (
    new Set(adapterOrder).size !== Object.keys(adapters).length ||
    adapterOrder.some((adapterId) => !adapters[adapterId])
  ) {
    errors.push("adapter order must contain every adapter exactly once");
  }
  for (const [adapterId, adapter] of Object.entries(adapters)) {
    if (!ID_PATTERN.test(adapterId)) {
      errors.push(`adapter id is not kebab-case: ${adapterId}`);
    }
    for (const field of ["required_capabilities", "required_runtimes"]) {
      if (!Array.isArray(adapter[field])) {
        errors.push(`${adapterId} must define ${field} as an array`);
      }
    }
  }
  for (const interfaceId of ["l5", "kernel"]) {
    if (
      !Number.isInteger(compatibility.interfaces?.[interfaceId]?.current) ||
      compatibility.interfaces[interfaceId].current < 1
    ) {
      errors.push(`${interfaceId} current interface version must be positive`);
    }
  }
  for (const operationId of ["initialize", "execute", "resume", "inspect"]) {
    const operation = compatibility.operations?.[operationId];
    if (!operation) {
      errors.push(`compatibility must define operation ${operationId}`);
      continue;
    }
    for (const interfaceId of operation.required_interfaces ?? []) {
      if (!compatibility.interfaces?.[interfaceId]) {
        errors.push(`${operationId} references unknown interface ${interfaceId}`);
      }
    }
  }
  for (const [policyId, enabled] of Object.entries(
    compatibility.policies ?? {}
  )) {
    if (!ID_PATTERN.test(policyId.replaceAll("_", "-"))) {
      errors.push(`compatibility policy id is invalid: ${policyId}`);
    }
    if (enabled !== true) {
      errors.push(`compatibility policy must be enabled: ${policyId}`);
    }
  }
  if (
    canonicalJson(Object.keys(experience.public_phases ?? {}).sort()) !==
    canonicalJson(["complete", "initialize", "work"])
  ) {
    errors.push("experience must expose initialize, work, and complete phases");
  }
  for (const operationId of ["initialize", "execute", "resume", "inspect"]) {
    if (!experience.public_phases?.[experience.operation_phase?.[operationId]]) {
      errors.push(`experience must map operation ${operationId}`);
    }
  }
  for (const status of [
    "ready",
    "completed",
    "decision-required",
    "preview-ready",
    "blocked"
  ]) {
    if (
      !["silent", "inform", "confirm", "block"].includes(
        experience.status_interaction?.[status]
      )
    ) {
      errors.push(`experience must map status ${status}`);
    }
  }
  for (const [policyId, enabled] of Object.entries(
    experience.policies ?? {}
  )) {
    if (!ID_PATTERN.test(policyId.replaceAll("_", "-")) || enabled !== true) {
      errors.push(`experience policy must be enabled: ${policyId}`);
    }
  }
  const decisionInteraction = experience.decision_interaction;
  if (
    decisionInteraction?.initialization_confirmation !== "always" ||
    decisionInteraction?.multi_agent_launch_confirmation !==
      "when-authorization-unknown" ||
    decisionInteraction?.native_form_capability !== "guided-form" ||
    decisionInteraction?.fallback_presentation !== "stepwise" ||
    decisionInteraction?.pause_on_nonempty_bundle !== true ||
    experience.policies?.decision_bundles_stop_execution !== true ||
    experience.policies?.non_plan_decisions_use_conversation_fallback !==
      true ||
    experience.policies?.uninitialized_projects_enter_first_run !== true ||
    experience.policies?.multi_agent_launch_requires_authorization !== true
  ) {
    errors.push(
      "experience decision interaction must pause active decisions with non-Plan fallback"
    );
  }

  if (!SEMVER_PATTERN.test(lifecycle.skill?.current_version ?? "")) {
    errors.push("lifecycle current version must be semantic versioning");
  } else {
    const expectedChannel = releaseChannelForVersion(
      lifecycle.skill.current_version
    );
    if (
      !RELEASE_CHANNELS.has(lifecycle.skill?.channel) ||
      expectedChannel == null ||
      lifecycle.skill.channel !== expectedChannel
    ) {
      errors.push(
        `lifecycle channel ${lifecycle.skill?.channel ?? "missing"} does not match version ${lifecycle.skill.current_version}`
      );
    }
  }
  if ((lifecycle.runtime_dependencies ?? []).length !== 0) {
    errors.push("ZipZap runtime dependencies must remain empty");
  }
  const knownVersions = new Set();
  for (const release of lifecycle.known_releases ?? []) {
    if (!SEMVER_PATTERN.test(release.version ?? "")) {
      errors.push(`known release has invalid version: ${release.version}`);
    }
    if (knownVersions.has(release.version)) {
      errors.push(`duplicate known release: ${release.version}`);
    }
    knownVersions.add(release.version);
  }
  if (!knownVersions.has(lifecycle.skill?.current_version)) {
    errors.push("known releases must include the current version");
  }
  const currentRelease = (lifecycle.known_releases ?? []).find(
    (release) => release.version === lifecycle.skill?.current_version
  );
  if (
    currentRelease &&
    (currentRelease.interfaces?.l5 !==
      compatibility.interfaces?.l5?.current ||
      currentRelease.interfaces?.kernel !==
        compatibility.interfaces?.kernel?.current)
  ) {
    errors.push("current release interfaces must match compatibility versions");
  }
  const migrationIds = new Set();
  for (const migration of lifecycle.migrations ?? []) {
    if (!ID_PATTERN.test(migration.id ?? "") || migrationIds.has(migration.id)) {
      errors.push(`migration id must be unique kebab-case: ${migration.id}`);
    }
    migrationIds.add(migration.id);
    if (
      !SEMVER_PATTERN.test(migration.from_version ?? "") ||
      !SEMVER_PATTERN.test(migration.to_version ?? "") ||
      typeof migration.description !== "string" ||
      migration.description.trim() === ""
    ) {
      errors.push(`migration is incomplete: ${migration.id}`);
    }
  }
  const releaseGates = lifecycle.release_gates ?? [];
  if (
    new Set(releaseGates).size !== releaseGates.length ||
    releaseGates.some((gate) => !ID_PATTERN.test(gate))
  ) {
    errors.push("release gates must be unique kebab-case identifiers");
  }
  for (const [policyId, enabled] of Object.entries(lifecycle.policies ?? {})) {
    if (!ID_PATTERN.test(policyId.replaceAll("_", "-")) || enabled !== true) {
      errors.push(`lifecycle policy must be enabled: ${policyId}`);
    }
  }
  for (const relativePath of lifecycle.package?.required_files ?? []) {
    const absolutePath = path.resolve(catalogs.rootDir, relativePath);
    const insideRoot =
      absolutePath === catalogs.rootDir ||
      absolutePath.startsWith(`${catalogs.rootDir}${path.sep}`);
    if (!insideRoot || !fs.existsSync(absolutePath)) {
      errors.push(`required package file is unavailable: ${relativePath}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    counts: {
      invariants: invariantIds.size,
      agents: Object.keys(agents).length,
      roles: Object.keys(roles).length,
      teams: Object.keys(teams).length,
      control_functions: Object.keys(functions).length,
      execution_profiles: Object.keys(
        executionProfiles.profiles ?? {}
      ).length,
      risk_signals: Object.keys(riskSignals).length,
      task_policies: Object.keys(taskPolicy.policies ?? {}).length,
      onboarding_questions: onboardingQuestionIds.size,
      adapters: Object.keys(adapters).length,
      releases: knownVersions.size
    }
  };
}

function normalizePersonalization(raw, catalogs) {
  if (raw == null) return {};
  assertObject(raw, "user_selection.personalization");
  const allowedFields = new Set([
    "agent_aliases",
    "response_detail",
    "team_tone",
    "humor",
    "status_style",
    "signatures"
  ]);
  for (const field of Object.keys(raw)) {
    if (!allowedFields.has(field)) {
      throw new Error(`unknown personalization field: ${field}`);
    }
  }

  const result = {};
  const policy = catalogs.runtimePolicy.personalization;
  const synonyms = {
    humor: {
      none: "off",
      no: "off"
    }
  };
  for (const field of [
    "response_detail",
    "team_tone",
    "humor",
    "status_style",
    "signatures"
  ]) {
    if (raw[field] == null) continue;
    const normalized = synonyms[field]?.[raw[field]] ?? raw[field];
    if (!policy[field].includes(normalized)) {
      throw new Error(
        `${field} must be one of: ${policy[field].join(", ")}`
      );
    }
    result[field] = normalized;
  }

  if (raw.agent_aliases != null) {
    assertObject(raw.agent_aliases, "personalization.agent_aliases");
    result.agent_aliases = {};
    for (const [profile, alias] of Object.entries(raw.agent_aliases)) {
      if (!catalogs.agents.agents[profile]) {
        throw new Error(`alias references unknown profile: ${profile}`);
      }
      if (typeof alias !== "string" || alias.trim() === "") {
        throw new Error(`alias for ${profile} must be a non-empty string`);
      }
      result.agent_aliases[profile] = alias.trim();
    }
  }
  return result;
}

function validateInput(input, catalogs) {
  assertObject(input, "input");
  const allowedTopLevel = new Set([
    "schema_version",
    "work_id",
    "user_selection",
    "host_capability",
    "work_signals",
    "execution_state",
    "event",
    "previous"
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedTopLevel.has(field)) {
      throw new Error(`unknown input field: ${field}`);
    }
  }
  if (input.schema_version !== 1) {
    throw new Error("input.schema_version must be 1");
  }
  if (typeof input.work_id !== "string" || input.work_id.trim() === "") {
    throw new Error("input.work_id must be a non-empty string");
  }
  assertObject(input.work_signals, "input.work_signals");

  const requested = input.user_selection?.team_preset;
  if (requested != null && !catalogs.teams.teams[requested]) {
    throw new Error(`unknown team preset: ${requested}`);
  }

  for (const field of [
    "required_gates",
    "risk_flags",
    "affected_components",
    "subject_risk_signals",
    "action_risk_signals",
    "review_focus"
  ]) {
    const value = input.work_signals[field];
    if (value != null && !Array.isArray(value)) {
      throw new Error(`work_signals.${field} must be an array`);
    }
  }

  if (input.event != null) {
    assertObject(input.event, "input.event");
    if (!catalogs.runtimePolicy.event_actions[input.event.type]) {
      throw new Error(`unknown runtime event: ${input.event.type}`);
    }
  }

  const state = input.execution_state;
  if (state != null) {
    assertObject(state, "input.execution_state");
    if (state.current_role && state.current_function) {
      throw new Error(
        "execution_state must select a role or a control function, not both"
      );
    }
  }
  const executionProfileId = input.work_signals.execution_profile;
  const executionProfile = executionProfileId
    ? catalogs.executionProfiles.profiles[executionProfileId]
    : null;
  if (executionProfileId && !executionProfile) {
    throw new Error(`unknown execution profile: ${executionProfileId}`);
  }
  if (
    executionProfile &&
    state?.current_role &&
    (state.current_role !== executionProfile.role ||
      state.current_stage !== executionProfile.stage)
  ) {
    throw new Error(
      `execution profile ${executionProfileId} requires ${executionProfile.role}.${executionProfile.stage}`
    );
  }
}

export function queryCatalog(
  catalogs,
  kind,
  id = null,
  section = null
) {
  const sources = {
    invariants: catalogs.invariants,
    agents: catalogs.agents.agents,
    roles: catalogs.roles.roles,
    teams: catalogs.teams.teams,
    "control-functions": catalogs.controlFunctions.control_functions,
    "runtime-policy": catalogs.runtimePolicy,
    "execution-profiles": catalogs.executionProfiles.profiles,
    experience: catalogs.experience,
    "risk-taxonomy": catalogs.riskTaxonomy.signals,
    "task-policy": catalogs.taskPolicy
  };
  if (!sources[kind]) {
    throw new Error(
      `catalog kind must be one of: ${Object.keys(sources).join(", ")}`
    );
  }
  let result = sources[kind];
  if (id != null) {
    if (kind === "invariants") {
      result = result.invariants?.find((item) => item.id === id);
    } else {
      result = result[id];
    }
    if (result == null) {
      throw new Error(`unknown ${kind} id: ${id}`);
    }
  }
  if (section != null) {
    assertObject(result, `catalog ${kind}${id ? `.${id}` : ""}`);
    result = result[section];
    if (result == null) {
      throw new Error(`catalog section not found: ${section}`);
    }
  }
  return clone(result);
}

function deriveRequiredAssurance(input, catalogs) {
  const required = Object.fromEntries(ASSURANCE_KEYS.map((key) => [key, false]));
  const signals = input.work_signals;
  const policy = catalogs.runtimePolicy;

  for (const gate of signals.required_gates ?? []) {
    const requirement = policy.gate_requirements[gate];
    if (!requirement) {
      throw new Error(`unknown required gate: ${gate}`);
    }
    Object.assign(required, requirement);
  }
  for (const risk of signals.risk_flags ?? []) {
    Object.assign(required, policy.risk_requirements[risk] ?? {});
  }
  if (signals.required_assurance != null) {
    assertObject(signals.required_assurance, "work_signals.required_assurance");
    for (const [key, value] of Object.entries(signals.required_assurance)) {
      if (!ASSURANCE_KEYS.includes(key) || typeof value !== "boolean") {
        throw new Error(`invalid required assurance: ${key}`);
      }
      required[key] = value;
    }
  }
  return required;
}

function satisfies(capability, required) {
  return ASSURANCE_KEYS.every(
    (key) => required[key] !== true || capability[key] === true
  );
}

function revisionFor(previous, key, action, affectedActions) {
  const prior = previous?.[key] ?? 0;
  if (prior === 0) return 1;
  return affectedActions.includes(action) ? prior + 1 : prior;
}

function calculateRevisions(input, action) {
  const previous = input.previous ?? {};
  return {
    preset: revisionFor(previous, "preset_resolution_revision", action, [
      "re-resolve-preset"
    ]),
    binding: revisionFor(previous, "binding_revision", action, [
      "re-resolve-preset",
      "rebind"
    ]),
    projection: revisionFor(previous, "projection_revision", action, [
      "re-resolve-preset",
      "rebind",
      "rebuild-projection",
      "patch",
      "block"
    ])
  };
}

export function resolvePreset(input, catalogs, revisions = { preset: 1 }) {
  const teams = catalogs.teams.teams;
  const order = catalogs.teams.order;
  const requested = input.user_selection?.team_preset ?? null;
  const required = deriveRequiredAssurance(input, catalogs);
  const recommended =
    order.find((teamId) => satisfies(teams[teamId].assurance, required)) ?? null;
  const reasons = [];
  let effective = null;
  let recommendation = null;
  let status = "selected";

  if (!recommended) {
    status = "blocked";
    reasons.push("No registered Team Preset satisfies required assurance.");
  } else if (requested && satisfies(teams[requested].assurance, required)) {
    effective = requested;
    reasons.push("The explicit Team Preset satisfies required assurance.");
  } else if (requested) {
    recommendation = recommended;
    status = "decision-required";
    reasons.push(
      `The explicit ${teams[requested].display_name} preset does not satisfy required assurance.`
    );
  } else {
    effective = recommended;
    reasons.push(
      "Selected the least costly registered preset satisfying required assurance."
    );
  }

  const host = input.host_capability ?? {};
  const candidate = effective ?? recommendation;
  const memberCount = candidate ? teams[candidate].members.length : 0;
  const multiAgentAuthorization =
    host.multi_agent_authorization ?? "unknown";
  if (effective && memberCount > 1 && multiAgentAuthorization !== "granted") {
    recommendation = effective;
    effective = null;
    status =
      multiAgentAuthorization === "denied"
        ? "authorization-denied"
        : "authorization-required";
    reasons.push(
      multiAgentAuthorization === "denied"
        ? "Multi-Agent execution was denied; required independent assurance remains unavailable."
        : "The selected topology requires explicit authorization for multiple Agent contexts."
    );
  }
  if (
    effective &&
    Number.isInteger(host.distinct_context_limit) &&
    host.distinct_context_limit < memberCount
  ) {
    recommendation = effective;
    effective = null;
    status = "capacity-gap";
    reasons.push(
      `The host supports ${host.distinct_context_limit} distinct contexts but ${memberCount} are required.`
    );
  }

  return {
    id: `${slug(input.work_id)}-preset`,
    revision: revisions.preset,
    requested,
    effective,
    recommended: recommendation,
    status,
    required_assurance: trueEntries(required),
    effective_capability: effective ? clone(teams[effective].assurance) : null,
    recommended_capability: recommendation
      ? clone(teams[recommendation].assurance)
      : null,
    reasons,
    host_schedule: {
      concurrency_limit: host.concurrency_limit ?? 1,
      distinct_context_limit: host.distinct_context_limit ?? null,
      multi_agent_authorization: multiAgentAuthorization,
      logical_members: memberCount
    },
    unresolved:
      status === "decision-required"
        ? ["Approve the recommended topology or provide a valid assurance alternative."]
        : status === "authorization-required"
          ? [
              "Authorize Multi-Agent execution, or assign qualified humans to the required independent gates."
            ]
          : status === "authorization-denied"
            ? [
                "Required independent gates remain blocked until Multi-Agent execution is authorized or qualified humans are assigned."
              ]
        : status === "capacity-gap"
          ? ["Provide additional distinct contexts or a qualified human substitute."]
          : []
  };
}

function scheduleWaves(team, concurrencyLimit) {
  const limit = Math.max(1, Number(concurrencyLimit) || 1);
  const waves = [];
  for (const wave of team.schedule_waves ?? []) {
    for (let index = 0; index < wave.length; index += limit) {
      waves.push(wave.slice(index, index + limit));
    }
  }
  return waves;
}

export function planBinding(
  input,
  catalogs,
  resolution,
  personalization,
  revisions = { binding: 1 }
) {
  if (!resolution.effective) return null;
  const teamId = resolution.effective;
  const team = catalogs.teams.teams[teamId];
  const workId = slug(input.work_id);
  const concurrencyLimit = input.host_capability?.concurrency_limit ?? 1;

  return {
    id: `${workId}-binding`,
    revision: revisions.binding,
    preset: teamId,
    status: "valid",
    personalization,
    members: team.members.map((member) => ({
      slot: member.slot,
      context_id: `${workId}-${slug(member.slot)}`,
      profile: member.profile,
      display_name:
        personalization.agent_aliases?.[member.profile] ??
        catalogs.agents.agents[member.profile].display_name,
      functions: clone(member.functions ?? []),
      roles: clone(member.roles ?? []),
      ...(member.artifact_access
        ? { artifact_access: member.artifact_access }
        : {})
    })),
    assurance: clone(team.assurance),
    schedule: {
      concurrency_limit: concurrencyLimit,
      waves: scheduleWaves(team, concurrencyLimit)
    },
    provenance: {
      preset_resolution_revision: resolution.revision
    },
    unresolved: []
  };
}

function selectMember(binding, state) {
  if (state.target_slot) {
    const member = binding.members.find((item) => item.slot === state.target_slot);
    if (!member) {
      throw new Error(`target slot is not in binding: ${state.target_slot}`);
    }
    return member;
  }
  const matches = binding.members.filter((member) =>
    state.current_role
      ? member.roles.includes(state.current_role)
      : member.functions.includes(state.current_function)
  );
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one bound participant, found ${matches.length}`
    );
  }
  return matches[0];
}

function selectorMatches(rule, state, signals) {
  const selectors = rule.selectors ?? {};
  const scalarChecks = {
    roles: state.current_role,
    functions: state.current_function,
    stages: state.current_stage,
    checkpoints: state.current_checkpoint,
    work_types: signals.work_type,
    actions: signals.requested_action
  };
  for (const [key, actual] of Object.entries(scalarChecks)) {
    if (selectors[key]?.length && !selectors[key].includes(actual)) return false;
  }
  const listChecks = {
    components: signals.affected_components ?? [],
    risk_flags: signals.risk_flags ?? []
  };
  for (const [key, actual] of Object.entries(listChecks)) {
    if (
      selectors[key]?.length &&
      !selectors[key].some((value) => actual.includes(value))
    ) {
      return false;
    }
  }
  return true;
}

const SOURCE_SELECTOR_KEYS = [
  "roles",
  "functions",
  "stages",
  "checkpoints",
  "work_types",
  "actions",
  "components",
  "risk_flags"
];

function validateProjectManifest(manifest, catalogs = loadCatalogs()) {
  assertAllowedFields(
    manifest,
    [
      "schema_version",
      "project_id",
      "revision",
      "sources",
      "extensions",
      "collaboration",
      "persistence",
      "document_routing"
    ],
    "project manifest"
  );
  if (manifest.schema_version !== 1 || !ID_PATTERN.test(manifest.project_id)) {
    throw new Error("project manifest version or project_id is invalid");
  }
  if (
    manifest.revision != null &&
    (!Number.isInteger(manifest.revision) || manifest.revision < 1)
  ) {
    throw new Error("project manifest revision must be a positive integer");
  }
  if (!Array.isArray(manifest.sources)) {
    throw new Error("project manifest sources must be an array");
  }
  const sourceIds = new Set();
  for (const source of manifest.sources) {
    assertAllowedFields(
      source,
      [
        "id",
        "locator",
        "kind",
        "format",
        "loading",
        "description",
        "authority",
        "owner",
        "topics",
        "selectors",
        "priority",
        "version",
        "document_kind",
        "status",
        "relations"
      ],
      "project source"
    );
    if (!ID_PATTERN.test(source.id) || !source.locator) {
      throw new Error("project source id or locator is invalid");
    }
    if (sourceIds.has(source.id)) {
      throw new Error(`duplicate project source id: ${source.id}`);
    }
    sourceIds.add(source.id);
    if (
      !Array.isArray(source.topics) ||
      source.topics.length === 0 ||
      source.topics.some((topic) => typeof topic !== "string" || !topic)
    ) {
      throw new Error(`${source.id} must define non-empty topics`);
    }
    if (new Set(source.topics).size !== source.topics.length) {
      throw new Error(`${source.id} topics must be unique`);
    }
    if (source.selectors) {
      assertAllowedFields(
        source.selectors,
        SOURCE_SELECTOR_KEYS,
        `${source.id} selectors`
      );
      for (const [key, values] of Object.entries(source.selectors)) {
        if (!Array.isArray(values) || values.some((value) => !value)) {
          throw new Error(`${source.id}.${key} must be an array of strings`);
        }
      }
    }
    if (
      source.document_kind != null &&
      ![
        "business-capability",
        "development-design",
        "integration-design",
        "architecture-overview",
        "architecture-decision",
        "engineering-standard",
        "operations-guide",
        "governance-policy",
        "external-requirement",
        "project-reference"
      ].includes(source.document_kind)
    ) {
      throw new Error(`${source.id} document_kind is invalid`);
    }
    if (
      source.status != null &&
      !["draft", "active", "superseded", "archived"].includes(source.status)
    ) {
      throw new Error(`${source.id} status is invalid`);
    }
    if (source.relations) {
      assertAllowedFields(
        source.relations,
        ["derived_from", "references", "supersedes"],
        `${source.id} relations`
      );
      for (const [relation, sourceIds] of Object.entries(source.relations)) {
        if (
          !Array.isArray(sourceIds) ||
          sourceIds.some((sourceId) => !ID_PATTERN.test(sourceId)) ||
          new Set(sourceIds).size !== sourceIds.length
        ) {
          throw new Error(`${source.id}.${relation} must contain unique source IDs`);
        }
      }
    }
  }
  if (manifest.document_routing) {
    const routing = manifest.document_routing;
    assertAllowedFields(
      routing,
      ["strategy", "on_ambiguity", "on_mismatch", "routes"],
      "document routing"
    );
    if (
      routing.strategy != null &&
      routing.strategy !== "preserve-existing"
    ) {
      throw new Error("document routing strategy must preserve existing conventions");
    }
    if (
      routing.on_ambiguity != null &&
      routing.on_ambiguity !== "decision-required"
    ) {
      throw new Error("document routing ambiguity policy is invalid");
    }
    if (
      routing.on_mismatch != null &&
      routing.on_mismatch !== "approval-required"
    ) {
      throw new Error("document routing mismatch policy is invalid");
    }
    if (!Array.isArray(routing.routes)) {
      throw new Error("document routing routes must be an array");
    }
    const routeIds = new Set();
    for (const route of routing.routes) {
      assertAllowedFields(
        route,
        [
          "id",
          "document_kinds",
          "topics",
          "target",
          "filename_pattern",
          "priority",
          "origin"
        ],
        "document route"
      );
      if (!ID_PATTERN.test(route.id) || routeIds.has(route.id)) {
        throw new Error(`invalid or duplicate document route id: ${route.id}`);
      }
      routeIds.add(route.id);
      if (
        !Array.isArray(route.document_kinds) ||
        route.document_kinds.length === 0
      ) {
        throw new Error(`${route.id} must define document_kinds`);
      }
      const normalizedTarget = route.target?.replaceAll("\\", "/");
      if (
        !normalizedTarget ||
        normalizedTarget.startsWith("/") ||
        /^[A-Za-z]:\//.test(normalizedTarget) ||
        normalizedTarget.split("/").includes("..")
      ) {
        throw new Error(`${route.id} target escapes project root`);
      }
    }
  }
  if (
    manifest.persistence &&
    (manifest.persistence.adapter !== "local-json" ||
      !manifest.persistence.locator)
  ) {
    throw new Error(
      "project persistence must use local-json with a project-local locator"
    );
  }
  if (manifest.collaboration) {
    assertAllowedFields(
      manifest.collaboration,
      [
        "preferred_preset",
        "enabled_presets",
        "enabled_roles",
        "personalization"
      ],
      "project collaboration"
    );
    const preferred = manifest.collaboration.preferred_preset;
    if (
      preferred != null &&
      !["auto", ...catalogs.teams.order].includes(preferred)
    ) {
      throw new Error(`unknown preferred preset: ${preferred}`);
    }
    for (const preset of manifest.collaboration.enabled_presets ?? []) {
      if (!catalogs.teams.teams[preset]) {
        throw new Error(`unknown enabled preset: ${preset}`);
      }
    }
    for (const role of manifest.collaboration.enabled_roles ?? []) {
      if (!catalogs.roles.roles[role]) {
        throw new Error(`unknown enabled role: ${role}`);
      }
    }
    if (manifest.collaboration.personalization) {
      const normalized = normalizePersonalization(
        manifest.collaboration.personalization,
        catalogs
      );
      if (
        canonicalJson(normalized) !==
        canonicalJson(manifest.collaboration.personalization)
      ) {
        throw new Error("project personalization must use canonical values");
      }
    }
  }
  return manifest;
}

function sourceSelectorsMatch(sourceSelectors = {}, querySelectors = {}) {
  for (const key of SOURCE_SELECTOR_KEYS) {
    const required = sourceSelectors[key] ?? [];
    if (required.length === 0) continue;
    const actual = querySelectors[key] ?? [];
    if (!Array.isArray(actual) || !required.some((value) => actual.includes(value))) {
      return false;
    }
  }
  return true;
}

export function resolveSources(input) {
  assertAllowedFields(
    input,
    ["schema_version", "manifest", "query", "observations"],
    "source resolution input"
  );
  if (input.schema_version !== 1) {
    throw new Error("source resolution schema_version must be 1");
  }
  const manifest = validateProjectManifest(input.manifest);
  assertObject(input.query, "source resolution query");
  assertAllowedFields(
    input.query,
    ["topics", "selectors", "on_missing"],
    "source resolution query"
  );
  if (
    !Array.isArray(input.query.topics) ||
    input.query.topics.length === 0 ||
    input.query.topics.some((topic) => typeof topic !== "string" || !topic)
  ) {
    throw new Error("source resolution query requires non-empty topics");
  }
  const observations = new Map();
  for (const observation of input.observations ?? []) {
    assertAllowedFields(
      observation,
      ["source_id", "availability", "preloaded", "version"],
      "source observation"
    );
    if (!manifest.sources.some((source) => source.id === observation.source_id)) {
      throw new Error(
        `source observation references unknown source: ${observation.source_id}`
      );
    }
    if (observations.has(observation.source_id)) {
      throw new Error(`duplicate source observation: ${observation.source_id}`);
    }
    if (
      !["available", "unavailable", "stale"].includes(
        observation.availability
      )
    ) {
      throw new Error(
        `invalid source availability: ${observation.availability}`
      );
    }
    observations.set(observation.source_id, observation);
  }

  const matches = manifest.sources
    .map((source) => {
      const matchedTopics = input.query.topics.filter((topic) =>
        source.topics.includes(topic)
      );
      if (
        matchedTopics.length === 0 ||
        !sourceSelectorsMatch(source.selectors, input.query.selectors)
      ) {
        return null;
      }
      const observation = observations.get(source.id);
      const versionChanged =
        source.version != null &&
        observation?.version != null &&
        source.version !== observation.version;
      const availability = versionChanged
        ? "stale"
        : observation?.availability ?? "available";
      const preloaded = observation?.preloaded === true;
      return {
        source_id: source.id,
        locator: source.locator,
        kind: source.kind ?? "reference",
        format: source.format ?? "markdown",
        loading: source.loading ?? "on-demand",
        matched_topics: matchedTopics,
        availability,
        load_required: availability === "available" && !preloaded,
        version: observation?.version ?? source.version ?? null,
        priority: source.priority ?? 0,
        preloaded
      };
    })
    .filter(Boolean)
    .sort(
      (left, right) =>
        right.priority - left.priority ||
        left.source_id.localeCompare(right.source_id)
    );

  const coverage = input.query.topics.map((topic) => {
    const topicMatches = matches.filter((match) =>
      match.matched_topics.includes(topic)
    );
    const available = topicMatches.filter(
      (match) => match.availability === "available"
    );
    let status = "missing";
    if (available.some((match) => match.preloaded)) status = "host-preloaded";
    else if (available.length > 0) status = "covered";
    else if (topicMatches.some((match) => match.availability === "stale")) {
      status = "stale";
    } else if (
      topicMatches.some((match) => match.availability === "unavailable")
    ) {
      status = "unavailable";
    }
    return {
      topic,
      status,
      source_ids: topicMatches.map((match) => match.source_id)
    };
  });
  const limitations = coverage
    .filter((item) => !["covered", "host-preloaded"].includes(item.status))
    .map((item) => `${item.topic}: ${item.status}`);
  const onMissing = input.query.on_missing ?? "decision-required";
  const status =
    limitations.length === 0 || onMissing === "allow-with-limitation"
      ? "ready"
      : onMissing === "block"
        ? "blocked"
        : "decision-required";

  return {
    schema_version: 1,
    status,
    matches: matches.map(({ preloaded, ...match }) => match),
    coverage,
    limitations
  };
}

export function routeProjection(
  input,
  catalogs,
  binding,
  revisions = { projection: 1 }
) {
  const state = input.execution_state;
  if (!binding || !state || (!state.current_role && !state.current_function)) {
    return {
      runtime_projection: null,
      projection_manifest: null
    };
  }

  const member = selectMember(binding, state);
  if (state.current_role && !member.roles.includes(state.current_role)) {
    throw new Error(`${member.slot} is not bound to role ${state.current_role}`);
  }
  if (
    state.current_function &&
    !member.functions.includes(state.current_function)
  ) {
    throw new Error(
      `${member.slot} is not bound to control function ${state.current_function}`
    );
  }

  const profile = catalogs.agents.agents[member.profile];
  const role = state.current_role
    ? catalogs.roles.roles[state.current_role]
    : null;
  const controlFunction = state.current_function
    ? catalogs.controlFunctions.control_functions[state.current_function]
    : null;
  if (state.current_role && !role) {
    throw new Error(`unknown role: ${state.current_role}`);
  }
  if (state.current_function && !controlFunction) {
    throw new Error(`unknown control function: ${state.current_function}`);
  }

  const stage = role
    ? role.stages[state.current_stage]
    : null;
  if (role && !stage) {
    throw new Error(
      `role ${state.current_role} does not define stage ${state.current_stage}`
    );
  }
  if (
    controlFunction &&
    !controlFunction.checkpoints.includes(state.current_checkpoint)
  ) {
    throw new Error(
      `control function ${state.current_function} does not define checkpoint ${state.current_checkpoint}`
    );
  }

  const signals = input.work_signals;
  const executionProfile = signals.execution_profile
    ? catalogs.executionProfiles.profiles[signals.execution_profile]
    : null;
  if (signals.execution_profile && !executionProfile) {
    throw new Error(
      `unknown execution profile: ${signals.execution_profile}`
    );
  }
  const executionBudget = executionProfile
    ? {
        ...clone(executionProfile.default_budget),
        ...clone(signals.execution_budget ?? {})
      }
    : null;
  const matchedRules = (signals.project_rules ?? []).filter((rule) =>
    selectorMatches(rule, state, signals)
  );
  const projectionId = `${slug(input.work_id)}-${slug(member.slot)}-${
    state.current_stage ?? state.current_checkpoint
  }`;
  const sourceLocators = matchedRules.map((rule) => ({
    id: rule.id,
    locator: rule.locator,
    version: rule.version ?? null
  }));
  const included = [
    `profile:${member.profile}`,
    role ? `role:${state.current_role}` : `function:${state.current_function}`,
    role
      ? `stage:${state.current_role}:${state.current_stage}`
      : `checkpoint:${state.current_function}:${state.current_checkpoint}`,
    ...(executionProfile
      ? [`execution-profile:${signals.execution_profile}`]
      : []),
    ...matchedRules.map((rule) => `project-rule:${rule.id}`)
  ];

  const runtimeProjection = {
    id: projectionId,
    revision: revisions.projection,
    binding: {
      id: binding.id,
      revision: binding.revision
    },
    participant: {
      slot: member.slot,
      context_id: member.context_id,
      profile: member.profile,
      display_name: member.display_name,
      role: state.current_role ?? null,
      function: state.current_function ?? null,
      stage: state.current_stage ?? null,
      checkpoint: state.current_checkpoint ?? null
    },
    work: {
      objective: signals.objective ?? null,
      intent: signals.intent ?? null,
      scope_depth: signals.scope_depth ?? null,
      assurance_target: signals.assurance_target ?? null,
      scope_summary: signals.scope_summary ?? null,
      work_type: signals.work_type ?? null,
      requested_action: signals.requested_action ?? null,
      affected_components: clone(signals.affected_components ?? []),
      risk_flags: clone(signals.risk_flags ?? [])
    },
    instructions: {
      profile_capsule: clone(profile.capsule),
      role_capsule: role ? clone(role.capsule) : null,
      control_function_overlay: controlFunction
        ? clone(controlFunction.overlay)
        : null,
      stage_overlay: stage ? clone(stage) : null,
      execution_profile_overlay: executionProfile
        ? {
            ...clone(executionProfile.capsule),
            claim_limit:
              signals.claim_limit ??
              executionProfile.capsule.claim_limit,
            execution_budget: clone(executionBudget)
          }
        : null,
      source_access: [
        "Locate with native search or rg before reading.",
        "Read the smallest relevant heading or line range.",
        "Expand only when the current evidence is insufficient.",
        "Treat truncation as incomplete evidence, never as proof of absence.",
        ...(executionProfile
          ? [
              `Stop the initial scan after ${executionBudget.max_source_files} source files and disclose the coverage limit.`,
              "Do not expand into implementation or tests unless the user authorizes the suggested upgrade."
            ]
          : [])
      ]
    },
    authority: {
      allowed: clone(role?.capsule?.may ?? controlFunction?.overlay?.may ?? []),
      prohibited: clone([
        ...(role?.capsule?.must_not ??
          controlFunction?.overlay?.must_not ??
          []),
        ...(executionProfile?.capsule?.prohibited ?? [])
      ]),
      requires_approval: clone(signals.requires_approval ?? [])
    },
    outputs: {
      required: clone(
        executionProfile?.capsule?.required_outputs ??
          stage?.required_outputs ??
          []
      ),
      evidence: clone(signals.required_evidence ?? []),
      exit_gate: clone(
        executionProfile?.capsule?.exit_gate ??
          stage?.exit_gate ??
          []
      )
    },
    sources: {
      required_rule_topics: clone(role?.rule_selectors ?? []),
      locators: sourceLocators
    },
    handoff: {
      prior: clone(state.prior_handoff ?? null),
      expected_next: state.expected_next ?? null
    },
    findings: {
      open: clone(state.open_findings ?? [])
    },
    assurance: {
      labels: clone(state.assurance_labels ?? []),
      topology: clone(binding.assurance),
      claim_limit: signals.claim_limit ?? null
    },
    unresolved: clone(state.unresolved ?? [])
  };

  return {
    runtime_projection: runtimeProjection,
    projection_manifest: {
      projection_id: projectionId,
      projection_revision: revisions.projection,
      binding_id: binding.id,
      binding_revision: binding.revision,
      team: binding.preset,
      agent_slot: member.slot,
      context_id: member.context_id,
      profile: member.profile,
      role: state.current_role ?? null,
      function: state.current_function ?? null,
      stage: state.current_stage ?? null,
      checkpoint: state.current_checkpoint ?? null,
      included,
      source_versions: Object.fromEntries(
        matchedRules.map((rule) => [rule.id, rule.version ?? null])
      ),
      assurance: clone(binding.assurance),
      unresolved: clone(runtimeProjection.unresolved)
    }
  };
}

function reconciliationFor(input, action, revisions, projection) {
  if (!input.event) return null;
  const previous = input.previous ?? {};
  const normalEvents = new Set([
    "role-transitioned",
    "stage-transitioned",
    "checkpoint-transitioned",
    "handoff-received"
  ]);
  const staleEvents = new Set([
    "user-selection-changed",
    "host-capacity-changed",
    "member-availability-changed",
    "risk-changed",
    "gate-changed",
    "source-version-changed",
    "source-unavailable"
  ]);
  const oldProjection = input.event.previous_projection_id ?? null;

  return {
    event: clone(input.event),
    previous: {
      preset_resolution_revision:
        previous.preset_resolution_revision ?? null,
      binding_revision: previous.binding_revision ?? null,
      projection_revision: previous.projection_revision ?? null
    },
    action,
    result: {
      preset_resolution_revision: revisions.preset,
      binding_revision: revisions.binding,
      projection_revision: projection?.revision ?? revisions.projection
    },
    superseded:
      oldProjection && normalEvents.has(input.event.type)
        ? [
            {
              projection_id: oldProjection,
              reason: "A valid runtime transition replaced the active projection."
            }
          ]
        : [],
    invalidated:
      oldProjection && staleEvents.has(input.event.type)
        ? [
            {
              projection_id: oldProjection,
              reason: "A governing runtime input became stale or unsafe."
            }
          ]
        : [],
    unresolved:
      action === "block"
        ? ["The event blocks projection until the governing input is resolved."]
        : []
  };
}

function defaultExecutionState(input, catalogs, binding) {
  if (input.execution_state != null || !binding) return input.execution_state;
  const executionProfile =
    catalogs.executionProfiles.profiles[
      input.work_signals.execution_profile
    ];
  if (executionProfile) {
    const matchingMembers = binding.members.filter((member) =>
      member.roles.includes(executionProfile.role)
    );
    if (matchingMembers.length !== 1) return undefined;
    return {
      target_slot: matchingMembers[0].slot,
      current_role: executionProfile.role,
      current_stage: executionProfile.stage
    };
  }
  const action = String(
    input.work_signals.requested_action ?? ""
  ).toLowerCase();
  let currentRole = "developer";
  let currentStage = "produce";
  if (/(review|audit|diagnos)/.test(action)) {
    currentRole = "reviewer";
    currentStage = "review";
  } else if (/(test|verify|check|retest)/.test(action)) {
    currentRole = "tester";
    currentStage = "verify";
  } else if (/(accept)/.test(action)) {
    currentRole = "product";
    currentStage = "accept";
  } else if (/(define|clarify|frame)/.test(action)) {
    currentRole = "product";
    currentStage = "frame";
  } else if (/(plan)/.test(action)) {
    currentRole = "developer";
    currentStage = "plan";
  }
  const role = catalogs.roles.roles[currentRole];
  const matchingMembers = binding.members.filter((member) =>
    member.roles.includes(currentRole)
  );
  if (!role?.stages?.[currentStage] || matchingMembers.length !== 1) {
    return undefined;
  }
  return {
    target_slot: matchingMembers[0].slot,
    current_role: currentRole,
    current_stage: currentStage
  };
}

export function compose(input, catalogs = loadCatalogs()) {
  const catalogValidation = validateCatalogs(catalogs);
  if (!catalogValidation.valid) {
    throw new Error(`invalid catalogs: ${catalogValidation.errors.join("; ")}`);
  }
  validateInput(input, catalogs);

  const action = input.event
    ? selectReconciliationAction(
        input.event.type,
        catalogs.runtimePolicy.event_actions
      )
    : "initial-compose";
  const revisions = calculateRevisions(input, action);
  const personalization = normalizePersonalization(
    input.user_selection?.personalization,
    catalogs
  );
  const presetResolution = resolvePreset(input, catalogs, revisions);
  const teamBinding = planBinding(
    input,
    catalogs,
    presetResolution,
    personalization,
    revisions
  );
  const executionState = defaultExecutionState(input, catalogs, teamBinding);
  const projectionInput =
    executionState === input.execution_state
      ? input
      : {
          ...input,
          execution_state: executionState
        };
  const projectionResult =
    action === "block"
      ? { runtime_projection: null, projection_manifest: null }
      : routeProjection(projectionInput, catalogs, teamBinding, revisions);
  const reconciliationResult = reconciliationFor(
    input,
    action,
    revisions,
    projectionResult.runtime_projection
  );

  return {
    schema_version: 1,
    preset_resolution: presetResolution,
    team_binding: teamBinding,
    runtime_projection: projectionResult.runtime_projection,
    projection_manifest: projectionResult.projection_manifest,
    reconciliation_result: reconciliationResult
  };
}

function requestEvidenceRefs(invocation) {
  const refs = [];
  for (const [field, value] of Object.entries(invocation.request ?? {})) {
    if (
      value != null &&
      (!Array.isArray(value) || value.length > 0) &&
      value !== ""
    ) {
      refs.push(`request.${field}`);
    }
  }
  return refs;
}

function requestExecutionSemantics(request, catalogs) {
  const intent =
    typeof request.intent === "string"
      ? request.intent.trim().toLowerCase()
      : null;
  const assuranceTarget =
    request.assurance_target ??
    catalogs.executionProfiles.intent_defaults[intent] ??
    null;
  const scopeDepth = request.scope_depth ?? null;
  const matchValues = {
    intent,
    scope_depth: scopeDepth,
    assurance_target: assuranceTarget
  };
  const profileEntry = Object.entries(
    catalogs.executionProfiles.profiles
  ).find(([, profile]) =>
    Object.entries(profile.match).every(([field, accepted]) =>
      accepted.includes(matchValues[field])
    )
  );
  const profileId = profileEntry?.[0] ?? null;
  const profile = profileEntry?.[1] ?? null;
  const budget = profile
    ? {
        ...clone(profile.default_budget),
        ...clone(request.execution_budget ?? {})
      }
    : clone(request.execution_budget ?? null);
  const assurancePolicy = assuranceTarget
    ? catalogs.executionProfiles.assurance_targets[assuranceTarget]
    : null;
  return {
    intent,
    scope_depth: scopeDepth,
    assurance_target: assuranceTarget,
    assurance_policy: assurancePolicy,
    profile_id: profileId,
    profile,
    execution_budget: budget,
    claim_limit: assurancePolicy?.claim_limit ?? null
  };
}

function validateRiskNormalizationInput(input, catalogs) {
  assertObject(input, "risk normalization input");
  const allowedFields = new Set([
    "schema_version",
    "work_id",
    "work_type",
    "affected_components",
    "assessment_input",
    "assessment",
    "host",
    "project_sources",
    "state"
  ]);
  for (const field of Object.keys(input)) {
    if (!allowedFields.has(field)) {
      throw new Error(`unknown risk normalization field: ${field}`);
    }
  }
  if (input.schema_version !== 1) {
    throw new Error("risk normalization schema_version must be 1");
  }
  if (typeof input.work_id !== "string" || input.work_id.trim() === "") {
    throw new Error("risk normalization work_id must be a non-empty string");
  }
  assertObject(input.assessment_input, "risk assessment input");
  assertObject(input.assessment, "risk assessment output");
  assertAllowedFields(
    input.assessment_input,
    ["schema_version", "taxonomy_version", "invocation", "evidence"],
    "risk assessment input"
  );
  assertAllowedFields(
    input.assessment,
    [
      "schema_version",
      "taxonomy_version",
      "evaluated_signals",
      "present_signals",
      "unknown_signals"
    ],
    "risk assessment output"
  );
  if (
    input.assessment_input.schema_version !== 1 ||
    input.assessment.schema_version !== 1 ||
    input.assessment_input.taxonomy_version !==
      catalogs.riskTaxonomy.schema_version ||
    input.assessment.taxonomy_version !== catalogs.riskTaxonomy.schema_version
  ) {
    throw new Error("risk assessment versions must match the taxonomy");
  }
  const invocation = input.assessment_input.invocation;
  assertAllowedFields(
    invocation,
    [
      "schema_version",
      "operation",
      "request_id",
      "project",
      "initialization",
      "request",
      "collaboration",
      "context",
      "inspection"
    ],
    "risk assessment invocation"
  );
  if (invocation.operation !== "execute") {
    throw new Error("risk normalization supports L5 execute only");
  }
  assertObject(invocation.request, "risk assessment invocation.request");
  assertAllowedFields(
    invocation.request,
    [
      "intent",
      "scope_depth",
      "assurance_target",
      "execution_budget",
      "objective",
      "scope",
      "requested_action",
      "constraints",
      "acceptance_criteria"
    ],
    "risk assessment request"
  );
  if (
    typeof invocation.request.objective !== "string" ||
    invocation.request.objective.trim() === ""
  ) {
    throw new Error("risk assessment objective must be a non-empty string");
  }
  if (
    invocation.request.scope_depth != null &&
    !["design-only", "targeted-implementation", "full"].includes(
      invocation.request.scope_depth
    )
  ) {
    throw new Error("risk assessment scope_depth is invalid");
  }
  if (
    invocation.request.assurance_target != null &&
    !catalogs.executionProfiles.assurance_targets[
      invocation.request.assurance_target
    ]
  ) {
    throw new Error("risk assessment assurance_target is invalid");
  }
  if (invocation.request.execution_budget != null) {
    assertAllowedFields(
      invocation.request.execution_budget,
      [
        "evidence",
        "max_source_files",
        "allow_tests",
        "allow_mutations",
        "allow_persistence"
      ],
      "risk assessment execution_budget"
    );
    const budget = invocation.request.execution_budget;
    if (
      (budget.evidence != null &&
        !["light", "standard", "deep"].includes(budget.evidence)) ||
      (budget.max_source_files != null &&
        (!Number.isInteger(budget.max_source_files) ||
          budget.max_source_files < 1 ||
          budget.max_source_files > 100)) ||
      ["allow_tests", "allow_mutations", "allow_persistence"].some(
        (field) => budget[field] != null && typeof budget[field] !== "boolean"
      )
    ) {
      throw new Error("risk assessment execution_budget is invalid");
    }
  }
  const executionSemantics = requestExecutionSemantics(
    invocation.request,
    catalogs
  );

  if (!Array.isArray(input.assessment.evaluated_signals)) {
    throw new Error("assessment evaluated_signals must be an array");
  }
  const taxonomyIds = Object.keys(catalogs.riskTaxonomy.signals).sort();
  const evaluatedIds = [...input.assessment.evaluated_signals].sort();
  if (canonicalJson(evaluatedIds) !== canonicalJson(taxonomyIds)) {
    throw new Error("assessment must evaluate every registered risk signal");
  }

  const evidenceIds = new Set(requestEvidenceRefs(invocation));
  if (!Array.isArray(input.assessment_input.evidence)) {
    throw new Error("risk assessment evidence must be an array");
  }
  for (const evidence of input.assessment_input.evidence) {
    if (
      !evidence ||
      typeof evidence.id !== "string" ||
      !ID_PATTERN.test(evidence.id) ||
      evidenceIds.has(evidence.id) ||
      typeof evidence.locator !== "string" ||
      evidence.locator.trim() === "" ||
      typeof evidence.statement !== "string" ||
      evidence.statement.trim() === ""
    ) {
      throw new Error(`invalid or duplicate assessment evidence: ${evidence?.id}`);
    }
    evidenceIds.add(evidence.id);
  }

  const classifiedIds = new Set();
  for (const [group, signals] of Object.entries({
    present: input.assessment.present_signals,
    unknown: input.assessment.unknown_signals
  })) {
    if (!Array.isArray(signals)) {
      throw new Error(`assessment ${group}_signals must be an array`);
    }
    for (const signal of signals) {
      assertAllowedFields(
        signal,
        group === "present"
          ? ["id", "evidence_refs", "confidence", "exposure"]
          : [
              "id",
              "question",
              "required_authority",
              "evidence_refs",
              "exposure"
            ],
        `${group} risk signal`
      );
      if (!catalogs.riskTaxonomy.signals[signal.id]) {
        throw new Error(`assessment references unknown risk signal: ${signal.id}`);
      }
      if (classifiedIds.has(signal.id)) {
        throw new Error(`risk signal classified more than once: ${signal.id}`);
      }
      classifiedIds.add(signal.id);
      const refs = signal.evidence_refs ?? [];
      if (group === "present" && refs.length === 0) {
        throw new Error(`present risk signal requires evidence: ${signal.id}`);
      }
      if (
        group === "present" &&
        !["high", "medium", "low"].includes(signal.confidence)
      ) {
        throw new Error(`present risk signal requires confidence: ${signal.id}`);
      }
      if (
        signal.exposure != null &&
        !["subject", "action", "both"].includes(signal.exposure)
      ) {
        throw new Error(`risk signal exposure is invalid: ${signal.id}`);
      }
      if (
        executionSemantics.profile?.risk_processing.require_exposure === true &&
        signal.exposure == null
      ) {
        throw new Error(
          `design diagnostic risk signal requires subject, action, or both exposure: ${signal.id}`
        );
      }
      for (const ref of refs) {
        if (!evidenceIds.has(ref)) {
          throw new Error(`risk signal ${signal.id} cites unknown evidence: ${ref}`);
        }
      }
      if (
        group === "unknown" &&
        (typeof signal.question !== "string" ||
          signal.question.trim() === "" ||
          typeof signal.required_authority !== "string" ||
          signal.required_authority.trim() === "")
      ) {
        throw new Error(`unknown risk signal requires a decision: ${signal.id}`);
      }
    }
  }

  validateHostCapabilities({
    schema_version: 1,
    host_id: "normalization-host",
    surface: "l5-normalizer",
    capabilities: [],
    limits: clone(input.host),
    runtimes: [],
    interfaces: {
      l5: [1],
      kernel: [1]
    }
  });
  if (!Array.isArray(input.project_sources)) {
    throw new Error("risk normalization project_sources must be an array");
  }
}

export function normalizeRiskAssessment(
  input,
  catalogs = loadCatalogs()
) {
  validateRiskNormalizationInput(input, catalogs);
  const invocation = input.assessment_input.invocation;
  const request = invocation.request;
  const execution = requestExecutionSemantics(request, catalogs);
  const presentSignals = input.assessment.present_signals.map(
    (signal) => signal.id
  );
  const exposureFor = (signal) =>
    signal.exposure ?? (execution.profile ? null : "action");
  const subjectSignalRecords = input.assessment.present_signals.filter(
    (signal) => ["subject", "both"].includes(exposureFor(signal))
  );
  const actionSignalRecords = input.assessment.present_signals.filter(
    (signal) => ["action", "both"].includes(exposureFor(signal))
  );
  const subjectUnknownRecords = input.assessment.unknown_signals.filter(
    (signal) => ["subject", "both"].includes(exposureFor(signal))
  );
  const actionUnknownRecords = input.assessment.unknown_signals.filter(
    (signal) => ["action", "both"].includes(exposureFor(signal))
  );
  const actionEffects = actionSignalRecords.map(
    (signal) => catalogs.riskTaxonomy.signals[signal.id].effects
  );
  const assurancePolicy = execution.assurance_policy ?? {
    required_gates: [],
    requires_approval: [],
    persistence_required: false,
    claim_limit: null
  };
  const reviewFocus = unique([
    ...(execution.profile?.capsule.review_focus ?? []),
    ...subjectSignalRecords.flatMap(
      (signal) => execution.profile?.signal_focus[signal.id] ?? []
    ),
    ...subjectUnknownRecords.flatMap(
      (signal) => execution.profile?.signal_focus[signal.id] ?? []
    )
  ]);
  const derived = {
    present_signals: presentSignals,
    subject_risk_signals: unique(
      subjectSignalRecords.map((signal) => signal.id)
    ),
    action_risk_signals: unique(
      actionSignalRecords.map((signal) => signal.id)
    ),
    subject_uncertainties: unique(
      subjectUnknownRecords.map((signal) => signal.id)
    ),
    risk_flags: unique(
      actionEffects.flatMap((effect) => effect.risk_flags)
    ),
    required_gates: unique(
      [
        ...actionEffects.flatMap((effect) => effect.required_gates),
        ...assurancePolicy.required_gates
      ]
    ),
    required_evidence: unique(
      [
        ...actionEffects.flatMap((effect) => effect.required_evidence),
        ...(execution.profile
          ? ["authoritative-design-evidence", "coverage-limitations"]
          : [])
      ]
    ),
    requires_approval: unique(
      [
        ...actionEffects.flatMap((effect) => effect.requires_approval),
        ...assurancePolicy.requires_approval
      ]
    ),
    persistence_required:
      invocation.collaboration?.persistence === "persistent" ||
      actionEffects.some((effect) => effect.persistence_required) ||
      assurancePolicy.persistence_required,
    execution_profile: execution.profile_id,
    assurance_target: execution.assurance_target,
    claim_limit: execution.claim_limit,
    review_focus: reviewFocus,
    execution_budget: clone(execution.execution_budget)
  };
  const decisions = actionUnknownRecords.map((signal) => ({
    code: "risk-signal-unresolved",
    signal: signal.id,
    message: signal.question,
    required_authority: signal.required_authority
  }));
  if (
    execution.profile?.risk_processing.action_effects === "require-upgrade" &&
    actionSignalRecords.length > 0
  ) {
    decisions.push({
      code: "diagnostic-upgrade-required",
      signal: actionSignalRecords[0].id,
      message:
        "The current action carries material risk beyond a read-only design diagnosis. Upgrade the scope before continuing.",
      required_authority: "user"
    });
  }
  if (
    execution.profile &&
    (execution.execution_budget.allow_tests ||
      execution.execution_budget.allow_mutations ||
      execution.execution_budget.allow_persistence ||
      invocation.collaboration?.persistence === "persistent")
  ) {
    decisions.push({
      code: "diagnostic-upgrade-required",
      signal: "execution-profile",
      message:
        "The requested permissions exceed the read-only design diagnostic profile. Choose targeted verification, implementation, or persistent Review.",
      required_authority: "user"
    });
  }
  if (decisions.length) {
    const decisionBundles = buildDecisionBundles(decisions, {
      id: "risk-clarification",
      title: "Resolve work risk",
      context:
        "Clarify the unresolved risk signals or choose a permitted work profile before execution."
    });
    return {
      schema_version: 1,
      status: "decision-required",
      kernel_request: null,
      derived_governance: derived,
      decisions_required: decisions,
      decision_bundles: decisionBundles,
      decision_interaction: projectDecisionInteraction(decisionBundles)
    };
  }

  const collaboration = invocation.collaboration ?? {};
  const hasPreferences =
    collaboration.team_preset != null ||
    collaboration.personalization != null;
  const kernelRequest = {
    schema_version: 1,
    work: {
      id: input.work_id,
      objective: request.objective,
      requested_action: request.requested_action ?? "execute",
      intent: request.intent ?? null,
      scope_depth: execution.scope_depth,
      assurance_target: execution.assurance_target,
      execution_budget: clone(execution.execution_budget),
      scope: clone(request.scope ?? []),
      scope_summary:
        request.intent ??
        (request.scope?.length ? request.scope.join(", ") : null),
      work_type: input.work_type ?? null,
      affected_components: clone(input.affected_components ?? []),
      acceptance_criteria: clone(request.acceptance_criteria ?? [])
    },
    ...(hasPreferences
      ? {
          preferences: {
            ...(collaboration.team_preset
              ? { team_preset: collaboration.team_preset }
              : {}),
            ...(collaboration.personalization
              ? { personalization: clone(collaboration.personalization) }
              : {})
          }
        }
      : {}),
    governance: {
      risk_flags: clone(derived.risk_flags),
      required_gates: clone(derived.required_gates),
      execution_profile: derived.execution_profile,
      subject_risk_signals: clone(derived.subject_risk_signals),
      action_risk_signals: clone(derived.action_risk_signals),
      review_focus: clone(derived.review_focus),
      claim_limit: derived.claim_limit,
      required_evidence: clone(derived.required_evidence),
      requires_approval: clone(derived.requires_approval),
      project_sources: clone(input.project_sources)
    },
    host: clone(input.host),
    ...(input.state ? { state: clone(input.state) } : {})
  };
  validateKernelRequest(kernelRequest);
  return {
    schema_version: 1,
    status: "ready",
    kernel_request: kernelRequest,
    derived_governance: derived,
    decisions_required: [],
    decision_bundles: [],
    decision_interaction: projectDecisionInteraction([])
  };
}

function validateKernelRequest(request) {
  assertObject(request, "kernel request");
  const allowedFields = new Set([
    "schema_version",
    "work",
    "preferences",
    "governance",
    "host",
    "state",
    "event"
  ]);
  for (const field of Object.keys(request)) {
    if (!allowedFields.has(field)) {
      throw new Error(`unknown kernel request field: ${field}`);
    }
  }
  if (request.schema_version !== 1) {
    throw new Error("kernel request schema_version must be 1");
  }
  assertObject(request.work, "kernel request work");
  for (const field of ["id", "objective", "requested_action"]) {
    if (
      typeof request.work[field] !== "string" ||
      request.work[field].trim() === ""
    ) {
      throw new Error(`kernel request work.${field} must be a non-empty string`);
    }
  }
  assertObject(request.governance, "kernel request governance");
  for (const field of [
    "risk_flags",
    "required_gates",
    "required_evidence",
    "project_sources"
  ]) {
    if (!Array.isArray(request.governance[field])) {
      throw new Error(`kernel request governance.${field} must be an array`);
    }
  }
  assertObject(request.host, "kernel request host");
  for (const field of ["concurrency_limit", "distinct_context_limit"]) {
    if (!Number.isInteger(request.host[field]) || request.host[field] < 1) {
      throw new Error(`kernel request host.${field} must be a positive integer`);
    }
  }
  if (
    request.host.multi_agent_authorization != null &&
    !["unknown", "granted", "denied"].includes(
      request.host.multi_agent_authorization
    )
  ) {
    throw new Error(
      "kernel request host.multi_agent_authorization must be unknown, granted, or denied"
    );
  }
}

function kernelToRuntimeInput(request) {
  const state = request.state ?? null;
  const previousRevisions = state?.previous_revisions ?? {};
  const executionState = state
    ? Object.fromEntries(
        Object.entries(state).filter(([key]) => key !== "previous_revisions")
      )
    : undefined;
  return {
    schema_version: 1,
    work_id: request.work.id,
    ...(request.preferences
      ? {
          user_selection: {
            ...(request.preferences.team_preset
              ? { team_preset: request.preferences.team_preset }
              : {}),
            ...(request.preferences.personalization
              ? { personalization: request.preferences.personalization }
              : {})
          }
        }
      : {}),
    host_capability: clone(request.host),
    work_signals: {
      objective: request.work.objective,
      intent: request.work.intent ?? null,
      scope_depth: request.work.scope_depth ?? null,
      assurance_target: request.work.assurance_target ?? null,
      execution_budget: clone(request.work.execution_budget ?? null),
      scope_summary:
        request.work.scope_summary ??
        (request.work.scope?.length ? request.work.scope.join(", ") : null),
      work_type: request.work.work_type ?? null,
      requested_action: request.work.requested_action,
      affected_components: clone(request.work.affected_components ?? []),
      acceptance_criteria: clone(request.work.acceptance_criteria ?? []),
      risk_flags: clone(request.governance.risk_flags),
      required_gates: clone(request.governance.required_gates),
      required_assurance: clone(
        request.governance.required_assurance ?? undefined
      ),
      execution_profile:
        request.governance.execution_profile ?? null,
      subject_risk_signals: clone(
        request.governance.subject_risk_signals ?? []
      ),
      action_risk_signals: clone(
        request.governance.action_risk_signals ?? []
      ),
      review_focus: clone(request.governance.review_focus ?? []),
      claim_limit: request.governance.claim_limit ?? null,
      required_evidence: clone(request.governance.required_evidence),
      requires_approval: clone(request.governance.requires_approval ?? []),
      project_rules: clone(request.governance.project_sources)
    },
    ...(executionState ? { execution_state: executionState } : {}),
    ...(request.event ? { event: clone(request.event) } : {}),
    ...(Object.keys(previousRevisions).length
      ? {
          previous: {
            ...(previousRevisions.preset_resolution
              ? {
                  preset_resolution_revision:
                    previousRevisions.preset_resolution
                }
              : {}),
            ...(previousRevisions.binding
              ? { binding_revision: previousRevisions.binding }
              : {}),
            ...(previousRevisions.projection
              ? { projection_revision: previousRevisions.projection }
              : {})
          }
        }
      : {})
  };
}

function assuranceView(binding, resolution = null) {
  if (!binding) {
    return {
      mode: "unavailable",
      limitations: unique([
        "No executable Team Binding is available.",
        ...(resolution?.reasons ?? []),
        ...(resolution?.unresolved ?? [])
      ]),
      capability: null
    };
  }
  const modes = {
    solo: "self",
    copilot: "peer-challenge",
    trio: "independent-from-developer",
    squad: "full-separation"
  };
  const limitations = {
    solo: [
      "No independent testing.",
      "No independent review.",
      "No second-context challenge."
    ],
    copilot: [
      "No formal independent testing.",
      "No formal independent review."
    ],
    trio: ["Reviewer is not separate from Tester."],
    squad: []
  };
  return {
    mode: modes[binding.preset] ?? "custom",
    limitations: clone(limitations[binding.preset] ?? []),
    capability: clone(binding.assurance)
  };
}

function decisionView(result) {
  const resolution = result.preset_resolution;
  if (resolution.status === "authorization-required") {
    return [
      {
        code: "multi-agent-authorization-required",
        message:
          "The required assurance needs multiple Agent contexts. Authorize Multi-Agent execution; otherwise the independent gates must pause or be assigned to qualified humans.",
        options: ["granted", "denied"]
      }
    ];
  }
  if (resolution.status === "decision-required") {
    return [
      {
        code: "team-selection-required",
        message:
          resolution.reasons.at(-1) ??
          "Select a topology that satisfies required assurance.",
        options: resolution.recommended ? [resolution.recommended] : []
      }
    ];
  }
  if (
    resolution.status === "selected" &&
    !result.runtime_projection &&
    result.team_binding
  ) {
    return [
      {
        code: "participant-selection-required",
        message: "Select the current Role and stage or Control Function checkpoint.",
        options: result.team_binding.members.map((member) => member.slot)
      }
    ];
  }
  return [];
}

function nextActionView(projection) {
  if (!projection) return null;
  const participant = {
    profile: projection.participant.profile,
    display_name: projection.participant.display_name,
    ...(projection.participant.role
      ? { role: projection.participant.role }
      : { function: projection.participant.function }),
    stage: projection.participant.stage,
    checkpoint: projection.participant.checkpoint
  };
  return {
    participant,
    objective: projection.work.objective,
    requested_action: projection.work.requested_action,
    execution_profile:
      projection.instructions.execution_profile_overlay?.id ?? null,
    instructions: clone(projection.instructions),
    required_outputs: clone(projection.outputs.required),
    exit_gate: clone(projection.outputs.exit_gate),
    source_locators: clone(projection.sources.locators)
  };
}

function evaluateKernelDetailed(request, catalogs) {
  validateKernelRequest(request);
  const result = compose(kernelToRuntimeInput(request), catalogs);
  const decisions = decisionView(result);
  const resolutionStatus = result.preset_resolution.status;
  const status =
    resolutionStatus === "blocked" ||
    resolutionStatus === "capacity-gap" ||
    resolutionStatus === "authorization-denied"
      ? "blocked"
      : decisions.length
        ? "decision-required"
        : result.runtime_projection
          ? "ready"
          : "blocked";
  const decisionBundles =
    status === "decision-required"
      ? buildDecisionBundles(decisions, {
          id: "collaboration-decision",
          title: "Choose collaboration settings",
          context:
            "Resolve the collaboration choice before the accountable action starts."
        })
      : [];

  const response = {
    schema_version: 1,
    status,
    next_action:
      status === "ready" ? nextActionView(result.runtime_projection) : null,
    assurance: assuranceView(result.team_binding, result.preset_resolution),
    decisions_required: decisions,
    decision_bundles: decisionBundles,
    decision_interaction: projectDecisionInteraction(decisionBundles),
    continuation: {
      work_id: request.work.id,
      revisions: {
        preset_resolution: result.preset_resolution.revision,
        binding: result.team_binding?.revision ?? null,
        projection: result.runtime_projection?.revision ?? null
      }
    },
    diagnostics_ref: null
  };
  return {
    response,
    diagnostics: result
  };
}

export function evaluateKernel(request, catalogs = loadCatalogs()) {
  return evaluateKernelDetailed(request, catalogs).response;
}

function l5Decision(decision) {
  return {
    code: decision.code,
    message: decision.signal
      ? `[${decision.signal}] ${decision.message}`
      : decision.message,
    ...(decision.required_authority
      ? { required_authority: decision.required_authority }
      : {}),
    ...(decision.options?.length
      ? {
          options: decision.options.map((option) =>
            typeof option === "string"
              ? { id: option, label: option }
              : option
          )
        }
      : {})
  };
}

function humanizeDecisionId(value) {
  const text = String(value ?? "decision")
    .replaceAll("-", " ")
    .replaceAll("_", " ")
    .trim();
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "Decision";
}

function fallbackDecisionOptions(decision) {
  if (decision.code === "risk-signal-unresolved") {
    return [
      {
        id: "present",
        label: "Treat as present",
        description: "Apply the safeguards and gates associated with this risk."
      },
      {
        id: "absent",
        label: "Treat as absent",
        description: "Continue only when evidence supports that the risk is absent."
      },
      {
        id: "defer",
        label: "Defer",
        description: "Pause the affected work until the risk can be resolved."
      }
    ];
  }
  if (decision.code === "diagnostic-upgrade-required") {
    return [
      {
        id: "upgrade",
        label: "Upgrade the work profile",
        description: "Continue under a profile authorized for the requested scope."
      },
      {
        id: "keep-limits",
        label: "Keep current limits",
        description: "Do not perform work outside the current profile."
      }
    ];
  }
  if (String(decision.code).startsWith("initialization-decision-")) {
    return [
      {
        id: "continue-with-limitation",
        label: "Continue with the limitation",
        description: "Proceed while keeping the disclosed limitation visible."
      },
      {
        id: "cancel",
        label: "Cancel initialization",
        description: "Leave project initialization unchanged."
      }
    ];
  }
  return [
    {
      id: "continue",
      label: "Continue",
      description: "Authorize the described next step."
    },
    {
      id: "stop",
      label: "Stop",
      description: "Do not perform the described next step."
    }
  ];
}

function normalizedDecisionOptions(decision) {
  const rawOptions = decision.options?.length
    ? decision.options
    : fallbackDecisionOptions(decision);
  const recommendedId =
    decision.recommended_option ??
    (decision.code === "team-selection-required"
      ? typeof rawOptions[0] === "string"
        ? rawOptions[0]
        : rawOptions[0]?.id
      : null);
  return rawOptions.map((option) => {
    const normalized =
      typeof option === "string"
        ? { id: option, label: humanizeDecisionId(option) }
        : option;
    return {
      id: normalized.id,
      label: normalized.label ?? humanizeDecisionId(normalized.id),
      description:
        normalized.description ?? `Select ${normalized.label ?? normalized.id}.`,
      recommended:
        normalized.recommended === true || normalized.id === recommendedId
    };
  });
}

function decisionQuestion(decision, index) {
  const kind = decision.kind ?? "single-select";
  if (!["single-select", "multi-select", "confirm"].includes(kind)) {
    throw new Error(`unsupported decision question kind: ${kind}`);
  }
  const derivedId = [decision.code, decision.signal]
    .filter(Boolean)
    .join("-");
  const baseId =
    (decision.question_id ?? derivedId) || `decision-${index + 1}`;
  const normalizedOptions = normalizedDecisionOptions(decision);
  const optionIds = normalizedOptions.map((option) => option.id);
  if (
    optionIds.some(
      (optionId) =>
        typeof optionId !== "string" || optionId.trim() === ""
    ) ||
    new Set(optionIds).size !== optionIds.length
  ) {
    throw new Error(
      `decision question options must have unique non-empty ids: ${baseId}`
    );
  }
  const minSelections = decision.min_selections ?? 1;
  if (
    kind === "multi-select" &&
    (!Number.isInteger(minSelections) ||
      minSelections < 0 ||
      minSelections > normalizedOptions.length ||
      (decision.max_selections != null &&
        (!Number.isInteger(decision.max_selections) ||
          decision.max_selections < Math.max(1, minSelections) ||
          decision.max_selections > normalizedOptions.length)))
  ) {
    throw new Error(
      `decision question selection bounds are invalid: ${baseId}`
    );
  }
  const question = {
    id: slug(baseId, `decision-${index + 1}`),
    ...(decision.field ? { field: decision.field } : {}),
    ...(decision.code ? { source_decision_code: decision.code } : {}),
    kind,
    label:
      decision.label ??
      (decision.signal
        ? `Resolve ${humanizeDecisionId(decision.signal)}`
        : humanizeDecisionId(decision.code ?? baseId)),
    description:
      decision.description ??
      decision.message ??
      "Choose how this decision should be resolved.",
    required: decision.required !== false,
    ...(kind === "multi-select"
      ? {
          min_selections: minSelections,
          ...(decision.max_selections != null
            ? { max_selections: decision.max_selections }
            : {})
        }
      : {}),
    options: normalizedOptions,
    current_value: clone(decision.current_value ?? null)
  };
  return question;
}

export function buildDecisionBundles(decisions, options = {}) {
  if (!Array.isArray(decisions) || decisions.length === 0) return [];
  if (
    options.submit_mode != null &&
    !["atomic", "incremental"].includes(options.submit_mode)
  ) {
    throw new Error(`unsupported decision submit mode: ${options.submit_mode}`);
  }
  if (
    options.state_revision != null &&
    (!Number.isInteger(options.state_revision) || options.state_revision < 1)
  ) {
    throw new Error("decision state_revision must be a positive integer");
  }
  const groups = new Map();
  for (const decision of decisions) {
    const authority =
      decision.required_authority ?? options.required_authority ?? "user";
    if (!groups.has(authority)) groups.set(authority, []);
    groups.get(authority).push(decision);
  }
  const multipleAuthorities = groups.size > 1;
  return [...groups.entries()].map(([authority, authorityDecisions]) => ({
    schema_version: 1,
    id: slug(
      multipleAuthorities
        ? `${options.id ?? "decision"}-${authority}`
        : options.id ?? "decision",
      "decision"
    ),
    title: options.title ?? "Decision required",
    context:
      options.context ?? "Resolve the following questions before work continues.",
    required_authority: authority,
    submit_mode: options.submit_mode ?? "atomic",
    ...(options.state_revision != null
      ? { state_revision: options.state_revision }
      : {}),
    questions: authorityDecisions.map(decisionQuestion),
    preview_required: options.preview_required !== false
  }));
}

export function projectDecisionInteraction(decisionBundles, options = {}) {
  if (!Array.isArray(decisionBundles)) {
    throw new Error("decision interaction requires a decision bundle array");
  }
  const preferred = options.preferred_presentation ?? "plain-text";
  if (!["form", "stepwise", "plain-text"].includes(preferred)) {
    throw new Error(`unsupported decision presentation: ${preferred}`);
  }
  if (decisionBundles.length === 0) {
    return {
      must_pause: false,
      presentation: "none",
      bundle_ids: [],
      visible_question_ids: []
    };
  }
  const presentation =
    preferred === "form"
      ? options.native_form_available === true
        ? "native-form"
        : "stepwise"
      : preferred;
  const questionIds = decisionBundles.flatMap((bundle) =>
    bundle.questions.map((question) => question.id)
  );
  return {
    must_pause: true,
    presentation,
    bundle_ids: decisionBundles.map((bundle) => bundle.id),
    visible_question_ids:
      presentation === "native-form" ? questionIds : questionIds.slice(0, 1)
  };
}

function userExperienceView(
  operation,
  status,
  decisions = [],
  catalogs = loadCatalogs(),
  options = {}
) {
  const experience = catalogs.experience;
  const phase = experience.operation_phase[operation];
  const normalizedStatus =
    status === "preview-ready" ? "preview-ready" : status;
  const mode =
    experience.status_interaction[normalizedStatus] ??
    (status === "ready" ? "silent" : "inform");
  const reasonCodes = unique(
    decisions
      .map((decision) => decision.code)
      .filter((code) => typeof code === "string" && code !== "")
  );
  const defaultPrompts = {
    initialize: "Review the setup preview and confirm it.",
    work: "Provide the required decision so work can continue.",
    complete: "Resolve the required completion decision."
  };
  return {
    phase,
    label: experience.public_phases[phase].label,
    interaction: {
      mode,
      reason_codes: reasonCodes,
      prompt:
        mode === "confirm"
          ? options.prompt ??
            decisions[0]?.message ??
            defaultPrompts[phase]
          : null
    },
    persistence:
      phase === "work"
        ? options.persistence_required === true
          ? "persistent"
          : "ephemeral"
        : null
  };
}

function l5Assurance(assurance) {
  return {
    mode:
      assurance.mode === "unavailable" ? "custom" : assurance.mode,
    limitations: clone(assurance.limitations)
  };
}

function l5Execution(nextAction) {
  if (!nextAction) return null;
  return {
    participant: {
      profile: nextAction.participant.profile,
      display_name: nextAction.participant.display_name,
      ...(nextAction.participant.role
        ? { role: nextAction.participant.role }
        : { function: nextAction.participant.function })
    },
    objective: nextAction.objective,
    requested_action: nextAction.requested_action,
    ...(nextAction.execution_profile
      ? { execution_profile: nextAction.execution_profile }
      : {}),
    instructions: clone(nextAction.instructions),
    required_outputs: clone(nextAction.required_outputs),
    exit_gate: clone(nextAction.exit_gate)
  };
}

const DISCOVERY_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".zipzap",
  "node_modules",
  "vendor",
  "dist",
  "build",
  "coverage"
]);

function hashFile(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

function projectFilePath(projectRoot, locator) {
  const resolved = path.resolve(projectRoot, locator);
  const relative = path.relative(projectRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source locator escapes project root: ${locator}`);
  }
  return resolved;
}

function inferredSourceMetadata(locator) {
  const normalized = locator.toLowerCase().replaceAll("\\", "/");
  const base = path.basename(normalized);
  const topics = [];
  let kind = "reference";
  let loading = "on-demand";
  if (base === "agents.md" || base === "agents.override.md") {
    topics.push("repository-instructions");
    kind = "instructions";
    loading = "host-managed";
  }
  if (/requirement|requirements|prd|product/.test(normalized)) {
    topics.push("product-strategy", "domain-and-business", "acceptance");
    kind = "requirement";
  }
  if (/architecture|architectural|(^|\/)adr(s)?(\/|$)/.test(normalized)) {
    topics.push("architecture");
    kind = "architecture";
  }
  if (/coding|development|developer|contributing/.test(normalized)) {
    topics.push("coding");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/test|testing|quality/.test(normalized)) {
    topics.push("testing", "quality-risk");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/security|privacy/.test(normalized)) {
    topics.push("security", "security-and-privacy");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/migration|database|(^|\/)data(\/|[-_.])/.test(normalized)) {
    topics.push("data-and-migration");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/documentation|docs-style|writing/.test(normalized)) {
    topics.push("documentation");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/release|deploy|delivery/.test(normalized)) {
    topics.push("release");
    kind = kind === "reference" ? "standard" : kind;
  }
  if (/decision|(^|\/)adr(s)?(\/|$)/.test(normalized)) {
    kind = "decision";
  }
  return {
    topics: unique(topics.length > 0 ? topics : ["project-reference"]),
    kind,
    loading
  };
}

function discoverProjectFiles(projectRoot) {
  const found = [];
  const visit = (directory, depth) => {
    if (depth > 8 || found.length >= 500) return;
    const entries = fs
      .readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (found.length >= 500) break;
      if (entry.isDirectory()) {
        if (
          DISCOVERY_IGNORED_DIRECTORIES.has(entry.name) ||
          (entry.name.startsWith(".") && entry.name !== ".github")
        ) {
          continue;
        }
        visit(path.join(directory, entry.name), depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = path
        .relative(projectRoot, path.join(directory, entry.name))
        .split(path.sep)
        .join("/");
      const lower = relative.toLowerCase();
      const isAgentInstruction =
        entry.name === "AGENTS.md" || entry.name === "AGENTS.override.md";
      const isKnownRootDocument =
        depth === 0 &&
        /^(readme|contributing|security|architecture|requirements)\.md$/i.test(
          entry.name
        );
      const isDocumentation = lower.startsWith("docs/") && lower.endsWith(".md");
      if (isAgentInstruction || isKnownRootDocument || isDocumentation) {
        found.push(relative);
      }
    }
  };
  visit(projectRoot, 0);
  return found;
}

function discoveredSource(projectRoot, locator) {
  const metadata = inferredSourceMetadata(locator);
  const normalizedLocator = locator.replaceAll("\\", "/");
  const readableId = slug(
    normalizedLocator.replace(/\.[^.]+$/, ""),
    "document"
  );
  const locatorHash = crypto
    .createHash("sha256")
    .update(normalizedLocator)
    .digest("hex")
    .slice(0, 12);
  const id =
    metadata.kind === "instructions" && normalizedLocator === "AGENTS.md"
      ? "repository-instructions"
      : `source-${readableId}-${locatorHash}`;
  const documentKind = inferDocumentKind(locator);
  return {
    id,
    locator,
    kind: metadata.kind,
    format: "markdown",
    loading: metadata.loading,
    topics: metadata.topics,
    priority: metadata.kind === "instructions" ? 100 : 0,
    version: hashFile(projectFilePath(projectRoot, locator)),
    ...(documentKind === "project-reference"
      ? {}
      : { document_kind: documentKind })
  };
}

function inspectRegisteredSource(projectRoot, source) {
  if (
    source.format === "external" ||
    source.loading === "external-resource" ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(source.locator)
  ) {
    return {
      source: clone(source),
      status: "unchanged"
    };
  }
  const filePath = projectFilePath(projectRoot, source.locator);
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return {
      source: clone(source),
      status: "unavailable"
    };
  }
  const version = hashFile(filePath);
  return {
    source: {
      ...clone(source),
      version
    },
    status:
      source.version != null && source.version !== version
        ? "stale"
        : "unchanged"
  };
}

function initializationCoverage(sources, enabledRoles, catalogs) {
  const availableTopics = new Set(
    sources
      .filter((source) => source.status !== "unavailable")
      .flatMap((source) => source.topics ?? [])
  );
  return enabledRoles.map((roleId) => {
    const required = catalogs.roles.roles[roleId]?.rule_selectors ?? [];
    return {
      role: roleId,
      covered_topics: required.filter((topic) => availableTopics.has(topic)),
      missing_topics: required.filter((topic) => !availableTopics.has(topic))
    };
  });
}

function initializationResponse(request, initialization, workflowStatus, catalogs) {
  return invokeL5(
    {
      schema_version: 1,
      request,
      context: {
        workflow_status: workflowStatus,
        summary:
          workflowStatus === "completed"
            ? "Project source initialization completed."
            : workflowStatus === "decision-required"
              ? "Project source initialization requires a decision."
              : "Project source initialization is blocked.",
        initialization
      }
    },
    catalogs
  );
}

function onboardingStorage(scope) {
  if (scope === "project") {
    return {
      scope,
      target: ".zipzap/project.json",
      application_required: false
    };
  }
  if (scope === "user") {
    return {
      scope,
      target: "host-user-state",
      application_required: true
    };
  }
  if (scope === "session") {
    return {
      scope,
      target: "session-state",
      application_required: true
    };
  }
  return {
    scope: null,
    target: null,
    application_required: false
  };
}

function onboardingConfiguration(raw, catalogs) {
  const defaults = catalogs.onboarding.defaults;
  const preferredPreset =
    raw?.preferred_preset ?? defaults.preferred_preset;
  if (!["auto", ...catalogs.teams.order].includes(preferredPreset)) {
    throw new Error(`unknown onboarding preferred preset: ${preferredPreset}`);
  }
  return {
    preferred_preset: preferredPreset,
    personalization: normalizePersonalization(
      {
        ...clone(defaults.personalization),
        ...(raw?.personalization ?? {}),
        agent_aliases: {
          ...clone(defaults.personalization.agent_aliases ?? {}),
          ...(raw?.personalization?.agent_aliases ?? {})
        }
      },
      catalogs
    )
  };
}

function projectOnboardingState(project, catalogs) {
  if (!project?.locator) {
    throw new Error("project onboarding requires project.locator");
  }
  const projectRoot = path.resolve(project.locator);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    throw new Error(`project is not an available directory: ${project.locator}`);
  }
  const manifestPath = path.join(projectRoot, ".zipzap", "project.json");
  if (!fs.existsSync(manifestPath)) {
    const configuration = onboardingConfiguration(null, catalogs);
    return {
      projectRoot,
      manifestPath,
      manifest: null,
      revision: 0,
      configuration
    };
  }
  const manifest = validateProjectManifest(readJson(manifestPath), catalogs);
  return {
    projectRoot,
    manifestPath,
    manifest,
    revision: manifest.revision ?? 0,
    configuration: onboardingConfiguration(
      {
        preferred_preset:
          manifest.collaboration?.preferred_preset ??
          catalogs.onboarding.defaults.preferred_preset,
        personalization: manifest.collaboration?.personalization
      },
      catalogs
    )
  };
}

function onboardingQuestionValue(question, state) {
  if (question.field === "scope") return state.scope;
  if (question.field === "preferred_preset") {
    return state.configuration.preferred_preset;
  }
  const [, field] = question.field.split(".");
  return state.configuration.personalization[field] ?? null;
}

function onboardingQuestionView(question, state) {
  return {
    id: question.id,
    field: question.field,
    group: question.group,
    label: question.label,
    description: question.description,
    kind: "single-select",
    options: question.options.map((option) => ({
      value: option.value,
      label: option.label,
      description: option.description,
      recommended: option.recommended === true
    })),
    current_value: onboardingQuestionValue(question, state)
  };
}

function onboardingQuestion(catalogs, questionId) {
  const question = catalogs.onboarding.questions.find(
    (candidate) => candidate.id === questionId
  );
  if (!question) {
    throw new Error(`unknown onboarding question: ${questionId}`);
  }
  return question;
}

function setOnboardingAnswer(state, question, value, catalogs) {
  if (!question.options.some((option) => option.value === value)) {
    throw new Error(
      `${question.id} must be one of: ${question.options
        .map((option) => option.value)
        .join(", ")}`
    );
  }
  if (question.field === "scope") {
    state.scope = value;
    return;
  }
  if (question.field === "preferred_preset") {
    state.configuration.preferred_preset = value;
    return;
  }
  const [, field] = question.field.split(".");
  state.configuration.personalization[field] = value;
  state.configuration = onboardingConfiguration(
    state.configuration,
    catalogs
  );
}

function onboardingChanges(base, current) {
  const fields = [
    "preferred_preset",
    "personalization.response_detail",
    "personalization.humor",
    "personalization.team_tone",
    "personalization.status_style",
    "personalization.signatures",
    "personalization.agent_aliases"
  ];
  const read = (configuration, field) => {
    if (!field.includes(".")) return configuration[field];
    const [, nested] = field.split(".");
    return configuration.personalization[nested];
  };
  return fields
    .map((field) => ({
      field,
      from: clone(read(base, field)),
      to: clone(read(current, field))
    }))
    .filter((change) => canonicalJson(change.from) !== canonicalJson(change.to));
}

function onboardingPreview(state) {
  return {
    scope: state.scope,
    configuration: clone(state.configuration),
    changes: onboardingChanges(
      state.base_configuration,
      state.configuration
    ),
    warnings: [
      "The preferred team is a preference; risk and assurance requirements may select a stronger topology.",
      "Personalization cannot change authority, project rules, gates, evidence, or independence."
    ]
  };
}

function onboardingChoiceBundles(state, questionViews) {
  return buildDecisionBundles(
    questionViews.map((question) => ({
      code: "onboarding-choice",
      question_id: question.id,
      field: question.field,
      kind: question.kind,
      label: question.label,
      description: question.description,
      required: true,
      current_value: question.current_value,
      required_authority: "user",
      options: question.options.map((option) => ({
        id: option.value,
        label: option.label,
        description: option.description,
        recommended: option.recommended
      }))
    })),
    {
      id: "onboarding-configuration",
      title: "Configure ZipZap collaboration",
      context:
        "Choose project collaboration preferences before reviewing the initialization preview.",
      submit_mode: state.presentation === "form" ? "atomic" : "incremental",
      state_revision: state.revision,
      preview_required: true
    }
  );
}

function onboardingConfirmationBundles(state) {
  return buildDecisionBundles(
    [
      {
        code: "confirm-onboarding",
        question_id: "confirm-onboarding",
        kind: "confirm",
        label: "Apply this configuration?",
        description:
          "Confirm the exact preview and revision before any configuration is written.",
        required_authority: "user",
        options: [
          {
            id: "confirm",
            label: "Confirm",
            description: "Apply the previewed configuration."
          },
          {
            id: "cancel",
            label: "Cancel",
            description: "Leave the current configuration unchanged."
          }
        ]
      }
    ],
    {
      id: "onboarding-confirmation",
      title: "Confirm ZipZap configuration",
      context: "Review the preview before applying collaboration preferences.",
      state_revision: state.revision,
      preview_required: false
    }
  );
}

function onboardingResponse(status, state, catalogs, additions = {}) {
  const questionViews = additions.form?.fields ??
    (additions.question ? [additions.question] : []);
  const decisionBundles =
    additions.decision_bundles ??
    (status === "decision-required" && questionViews.length > 0
      ? onboardingChoiceBundles(state, questionViews)
      : status === "preview-ready"
        ? onboardingConfirmationBundles(state)
        : []);
  const response = {
    schema_version: 1,
    status,
    state: clone(state),
    write_performed: additions.write_performed === true,
    storage: onboardingStorage(state.scope),
    decision_bundles: decisionBundles,
    decision_interaction: projectDecisionInteraction(decisionBundles, {
      preferred_presentation: state.presentation,
      native_form_available: state.presentation === "form"
    }),
    ...additions
  };
  if (response.write_performed) {
    response.storage.application_required = false;
  }
  return response;
}

function initializeOnboardingState(input, catalogs, mode = "configure") {
  const presentation = input.presentation ?? "form";
  if (!["form", "stepwise"].includes(presentation)) {
    throw new Error("onboarding presentation must be form or stepwise");
  }
  const scope = input.scope ?? null;
  if (
    scope != null &&
    !["session", "user", "project"].includes(scope)
  ) {
    throw new Error("onboarding scope must be session, user, or project");
  }
  let configuration = onboardingConfiguration(
    input.current_configuration,
    catalogs
  );
  let configurationRevision = 0;
  if (scope === "project") {
    const projectState = projectOnboardingState(input.project, catalogs);
    configuration = projectState.configuration;
    configurationRevision = projectState.revision;
  }
  const completedQuestions = scope ? ["scope"] : [];
  if (mode === "reset") {
    configuration = onboardingConfiguration(null, catalogs);
    completedQuestions.push(
      ...catalogs.onboarding.questions
        .map((question) => question.id)
        .filter((questionId) => questionId !== "scope")
    );
  }
  return {
    revision: 1,
    mode,
    presentation,
    scope,
    base_configuration_revision: configurationRevision,
    base_configuration:
      mode === "reset" && input.current_configuration
        ? onboardingConfiguration(input.current_configuration, catalogs)
        : clone(configuration),
    completed_questions: unique(completedQuestions),
    configuration
  };
}

function validateOnboardingState(input, catalogs) {
  assertObject(input.state, "onboarding state");
  if (
    !Number.isInteger(input.expected_revision) ||
    input.expected_revision !== input.state.revision
  ) {
    throw new Error(
      `onboarding revision mismatch: expected ${input.expected_revision}, state ${input.state.revision}`
    );
  }
  const state = clone(input.state);
  state.configuration = onboardingConfiguration(
    state.configuration,
    catalogs
  );
  state.base_configuration = onboardingConfiguration(
    state.base_configuration,
    catalogs
  );
  if (
    !["configure", "reset"].includes(state.mode) ||
    !["form", "stepwise"].includes(state.presentation) ||
    !Array.isArray(state.completed_questions) ||
    !Number.isInteger(state.base_configuration_revision) ||
    state.base_configuration_revision < 0
  ) {
    throw new Error("onboarding state is invalid");
  }
  return state;
}

function refreshProjectOnboardingBase(state, input, catalogs) {
  if (state.scope !== "project") return state;
  const projectState = projectOnboardingState(input.project, catalogs);
  state.base_configuration_revision = projectState.revision;
  state.base_configuration = clone(projectState.configuration);
  state.configuration = clone(projectState.configuration);
  return state;
}

function pendingOnboardingQuestions(state, catalogs) {
  const completed = new Set(state.completed_questions);
  return catalogs.onboarding.questions.filter(
    (question) => !completed.has(question.id)
  );
}

function writeProjectOnboarding(state, input, catalogs) {
  const projectState = projectOnboardingState(input.project, catalogs);
  if (projectState.revision !== state.base_configuration_revision) {
    throw new Error(
      `project configuration revision mismatch: expected ${state.base_configuration_revision}, stored ${projectState.revision}`
    );
  }
  const hasStoredOverrides = Boolean(
    projectState.manifest?.collaboration?.preferred_preset ||
    projectState.manifest?.collaboration?.personalization
  );
  if (state.mode === "reset" && !hasStoredOverrides) {
    return {
      revision: projectState.revision,
      write_performed: false
    };
  }
  const projectId = slug(
    input.project.id ?? path.basename(projectState.projectRoot),
    "project"
  );
  const manifest = projectState.manifest ?? {
    schema_version: 1,
    project_id: projectId,
    sources: [],
    persistence: {
      adapter: "local-json",
      locator: catalogs.taskPolicy.local_store.locator
    }
  };
  const collaboration = clone(manifest.collaboration ?? {});
  if (state.mode === "reset") {
    delete collaboration.preferred_preset;
    delete collaboration.personalization;
  } else {
    collaboration.preferred_preset = state.configuration.preferred_preset;
    collaboration.personalization = clone(
      state.configuration.personalization
    );
  }
  if (Object.keys(collaboration).length > 0) {
    manifest.collaboration = collaboration;
  } else {
    delete manifest.collaboration;
  }
  manifest.revision = projectState.revision + 1;
  validateProjectManifest(manifest, catalogs);
  fs.mkdirSync(path.dirname(projectState.manifestPath), { recursive: true });
  const temporaryPath = `${projectState.manifestPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
  fs.renameSync(temporaryPath, projectState.manifestPath);
  return {
    revision: manifest.revision,
    write_performed: true
  };
}

function confirmableOnboardingState(input, catalogs) {
  const state = validateOnboardingState(input, catalogs);
  const pending = pendingOnboardingQuestions(state, catalogs);
  if (pending.length > 0 && state.mode !== "reset") {
    throw new Error(
      `confirm requires completed onboarding questions: ${pending
        .map((question) => question.id)
        .join(", ")}`
    );
  }
  if (!state.scope) throw new Error("confirm requires a configuration scope");
  return state;
}

export function advanceOnboarding(input, catalogs = loadCatalogs()) {
  assertAllowedFields(
    input,
    [
      "schema_version",
      "operation",
      "presentation",
      "scope",
      "project",
      "state",
      "expected_revision",
      "answer",
      "answers",
      "current_configuration"
    ],
    "onboarding input"
  );
  if (input.schema_version !== 1) {
    throw new Error("onboarding schema_version must be 1");
  }
  const operation = input.operation;
  if (
    !["start", "answer", "submit", "confirm", "reset"].includes(operation)
  ) {
    throw new Error(`unsupported onboarding operation: ${operation}`);
  }

  if (operation === "start") {
    const state = initializeOnboardingState(input, catalogs);
    if (state.presentation === "form") {
      return onboardingResponse("decision-required", state, catalogs, {
        form: {
          fields: catalogs.onboarding.questions.map((question) =>
            onboardingQuestionView(question, state)
          )
        }
      });
    }
    const question = pendingOnboardingQuestions(state, catalogs)[0];
    return onboardingResponse("decision-required", state, catalogs, {
      question: onboardingQuestionView(question, state)
    });
  }

  if (operation === "reset") {
    const state = initializeOnboardingState(input, catalogs, "reset");
    if (!state.scope) throw new Error("reset requires a configuration scope");
    if (state.scope === "project") {
      const projectState = projectOnboardingState(input.project, catalogs);
      state.base_configuration_revision = projectState.revision;
      state.base_configuration = clone(projectState.configuration);
    }
    return onboardingResponse("preview-ready", state, catalogs, {
      preview: onboardingPreview(state)
    });
  }

  const state =
    operation === "confirm"
      ? confirmableOnboardingState(input, catalogs)
      : validateOnboardingState(input, catalogs);
  if (operation === "answer") {
    assertObject(input.answer, "onboarding answer");
    const pending = pendingOnboardingQuestions(state, catalogs);
    if (!pending[0] || pending[0].id !== input.answer.question_id) {
      throw new Error(
        `answer must target the next onboarding question: ${pending[0]?.id ?? "none"}`
      );
    }
    setOnboardingAnswer(state, pending[0], input.answer.value, catalogs);
    state.completed_questions.push(pending[0].id);
    if (pending[0].id === "scope" && state.scope === "project") {
      refreshProjectOnboardingBase(state, input, catalogs);
    }
    state.revision += 1;
    const next = pendingOnboardingQuestions(state, catalogs)[0];
    if (next) {
      return onboardingResponse("decision-required", state, catalogs, {
        question: onboardingQuestionView(next, state)
      });
    }
    return onboardingResponse("preview-ready", state, catalogs, {
      preview: onboardingPreview(state)
    });
  }

  if (operation === "submit") {
    assertObject(input.answers, "onboarding answers");
    for (const question of catalogs.onboarding.questions) {
      const key =
        question.field === "personalization.response_detail"
          ? "response_detail"
          : question.field === "personalization.team_tone"
            ? "team_tone"
            : question.field === "personalization.humor"
              ? "humor"
              : question.field === "personalization.signatures"
                ? "signatures"
                : question.field;
      if (input.answers[key] == null) continue;
      setOnboardingAnswer(state, question, input.answers[key], catalogs);
    }
    if (!state.scope) {
      throw new Error("form submission must select a configuration scope");
    }
    if (state.scope === "project") {
      const priorConfiguration = clone(state.configuration);
      refreshProjectOnboardingBase(state, input, catalogs);
      state.configuration = onboardingConfiguration(
        {
          ...priorConfiguration,
          personalization: {
            ...state.configuration.personalization,
            ...priorConfiguration.personalization
          }
        },
        catalogs
      );
    }
    state.completed_questions = catalogs.onboarding.questions.map(
      (question) => question.id
    );
    state.revision += 1;
    return onboardingResponse("preview-ready", state, catalogs, {
      preview: onboardingPreview(state)
    });
  }

  let configurationRevision = state.base_configuration_revision;
  let writePerformed = false;
  if (state.scope === "project") {
    const application = writeProjectOnboarding(state, input, catalogs);
    configurationRevision = application.revision;
    writePerformed = application.write_performed;
  }
  state.revision += 1;
  return onboardingResponse("completed", state, catalogs, {
    write_performed: writePerformed,
    configuration: clone(state.configuration),
    configuration_revision: configurationRevision,
    limitations:
      state.scope === "project"
        ? []
        : [
            `The host must apply this ${state.scope}-scoped configuration to ${onboardingStorage(state.scope).target}.`
          ]
  });
}

export function initializeProject(request, catalogs = loadCatalogs()) {
  if (
    request?.schema_version !== 1 ||
    request.operation !== "initialize" ||
    !request.project?.locator ||
    !request.initialization?.action
  ) {
    throw new Error("initialize requires a valid L5 initialize request");
  }
  const action = request.initialization.action;
  const projectRoot = path.resolve(request.project.locator);
  const requestedPersistence = request.initialization.persistence;
  const persistence =
    requestedPersistence === "session" || action === "discover"
      ? "session"
      : "project";
  const projectId = slug(
    request.project.id ?? path.basename(projectRoot),
    "project"
  );
  const manifestLocator = ".zipzap/project.json";
  const emptyInitialization = {
    action,
    persistence,
    project_id: projectId,
    manifest_locator: persistence === "project" ? manifestLocator : null,
    write_performed: false,
    sources: [],
    document_routing: null,
    coverage: [],
    changes: [],
    unresolved: []
  };
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    emptyInitialization.unresolved.push(
      `Project locator is not an available directory: ${request.project.locator}`
    );
    return initializationResponse(
      request,
      emptyInitialization,
      "blocked",
      catalogs
    );
  }

  const manifestPath = path.join(projectRoot, manifestLocator);
  let existingManifest = null;
  if (fs.existsSync(manifestPath)) {
    try {
      existingManifest = validateProjectManifest(readJson(manifestPath));
    } catch (error) {
      emptyInitialization.unresolved.push(
        `Existing project manifest is invalid: ${error.message}`
      );
      return initializationResponse(
        request,
        emptyInitialization,
        "blocked",
        catalogs
      );
    }
  }

  let selectedSources = [];
  let sourceStatuses = new Map();
  if (action === "discover") {
    selectedSources = discoverProjectFiles(projectRoot).map((locator) =>
      discoveredSource(projectRoot, locator)
    );
    sourceStatuses = new Map(
      selectedSources.map((source) => [source.id, "discovered"])
    );
  } else if (action === "configure") {
    selectedSources =
      request.initialization.sources?.map(clone) ??
      discoverProjectFiles(projectRoot).map((locator) =>
        discoveredSource(projectRoot, locator)
      );
    if (selectedSources.length === 0) {
      emptyInitialization.unresolved.push(
        "No project sources were supplied or discovered for configuration."
      );
      return initializationResponse(
        request,
        emptyInitialization,
        "decision-required",
        catalogs
      );
    }
    validateProjectManifest({
      schema_version: 1,
      project_id: projectId,
      sources: selectedSources
    });
    const inspected = selectedSources.map((source) =>
      inspectRegisteredSource(projectRoot, source)
    );
    selectedSources = inspected.map((item) => item.source);
    sourceStatuses = new Map(
      inspected.map((item) => [
        item.source.id,
        item.status === "unchanged" ? "registered" : item.status
      ])
    );
  } else if (action === "refresh") {
    if (!existingManifest) {
      emptyInitialization.unresolved.push(
        "Refresh requires an existing .zipzap/project.json manifest."
      );
      return initializationResponse(
        request,
        emptyInitialization,
        "decision-required",
        catalogs
      );
    }
    const inspected = existingManifest.sources.map((source) =>
      inspectRegisteredSource(projectRoot, source)
    );
    selectedSources = inspected.map((item) => item.source);
    sourceStatuses = new Map(
      inspected.map((item) => [item.source.id, item.status])
    );
  } else {
    throw new Error(`unsupported initialization action: ${action}`);
  }

  const enabledRoles =
    request.initialization.enabled_roles ??
    existingManifest?.collaboration?.enabled_roles ??
    Object.keys(catalogs.roles.roles);
  for (const roleId of enabledRoles) {
    if (!catalogs.roles.roles[roleId]) {
      throw new Error(`initialization references unknown role: ${roleId}`);
    }
  }
  const requestedPreferences = request.initialization.preferences
    ? onboardingConfiguration(request.initialization.preferences, catalogs)
    : null;
  const sourceResults = selectedSources.map((source) => ({
    id: source.id,
    locator: source.locator,
    topics: clone(source.topics),
    kind: source.kind ?? "reference",
    loading: source.loading ?? "on-demand",
    version: source.version ?? null,
    ...(source.document_kind
      ? { document_kind: source.document_kind }
      : {}),
    status: sourceStatuses.get(source.id)
  }));
  const inferredRoutes = inferDocumentRoutes(selectedSources);
  const documentRouting = existingManifest?.document_routing ??
    (inferredRoutes.length > 0
      ? {
          strategy: "preserve-existing",
          on_ambiguity: "decision-required",
          on_mismatch: "approval-required",
          routes: inferredRoutes
        }
      : null);
  emptyInitialization.document_routing = documentRouting;
  const manifest = {
    schema_version: 1,
    project_id: projectId,
    ...(existingManifest?.revision
      ? { revision: existingManifest.revision }
      : {}),
    sources: selectedSources,
    collaboration: {
      ...(existingManifest?.collaboration ?? {}),
      enabled_roles: enabledRoles,
      ...(requestedPreferences
        ? {
            preferred_preset: requestedPreferences.preferred_preset,
            personalization: requestedPreferences.personalization
          }
        : {})
    },
    persistence: {
      adapter: "local-json",
      locator:
        existingManifest?.persistence?.locator ??
        catalogs.taskPolicy.local_store.locator
    },
    ...(documentRouting ? { document_routing: clone(documentRouting) } : {}),
    ...(existingManifest?.extensions
      ? { extensions: clone(existingManifest.extensions) }
      : {})
  };
  validateProjectManifest(manifest);
  const coverage = initializationCoverage(
    sourceResults,
    enabledRoles,
    catalogs
  );
  const missingCount = coverage.reduce(
    (total, item) => total + item.missing_topics.length,
    0
  );
  const changes = [];
  if (action === "discover") {
    changes.push({
      action: "skip",
      target: manifestLocator,
      reason: "Discovery is read-only; confirm mappings before configuration."
    });
  } else if (persistence === "session") {
    changes.push({
      action: "skip",
      target: manifestLocator,
      reason: "Session persistence does not write project state."
    });
  } else {
    try {
      manifest.revision = (existingManifest?.revision ?? 0) + 1;
      validateProjectManifest(manifest, catalogs);
      const zipzapDirectory = path.dirname(manifestPath);
      const taskDirectory = projectFilePath(
        projectRoot,
        manifest.persistence.locator
      );
      const eventDirectory = projectFilePath(
        projectRoot,
        catalogs.taskPolicy.local_store.event_locator
      );
      const reviewDirectory = projectFilePath(
        projectRoot,
        catalogs.taskPolicy.local_store.review_locator
      );
      const feedbackDirectory = projectFilePath(
        projectRoot,
        catalogs.taskPolicy.local_store.feedback_locator
      );
      const reportDirectory = projectFilePath(
        projectRoot,
        catalogs.taskPolicy.local_store.report_locator
      );
      fs.mkdirSync(zipzapDirectory, { recursive: true });
      for (const directory of [
        taskDirectory,
        eventDirectory,
        reviewDirectory,
        feedbackDirectory,
        reportDirectory
      ]) {
        fs.mkdirSync(directory, { recursive: true });
      }
      const gitignorePath = path.join(zipzapDirectory, ".gitignore");
      if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, PROJECT_GITIGNORE);
      }
      const temporaryPath = `${manifestPath}.tmp`;
      fs.writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`);
      fs.renameSync(temporaryPath, manifestPath);
      changes.push({
        action: existingManifest ? "update" : "create",
        target: manifestLocator,
        reason: "Registered project source locators and project Task storage."
      });
      changes.push({
        action: "retain",
        target: manifest.persistence.locator,
        reason: "Persistent Tasks are maintained as project-local JSON."
      });
      changes.push({
        action: "retain",
        target: ".zipzap/{events,reviews,feedback,reports}",
        reason:
          "Git-shareable evidence and Feedback remain project-owned; reports are derived."
      });
    } catch (error) {
      const failed = {
        ...emptyInitialization,
        sources: sourceResults,
        coverage,
        changes,
        unresolved: [`Project initialization write failed: ${error.message}`]
      };
      return initializationResponse(request, failed, "blocked", catalogs);
    }
  }
  if (missingCount > 0) {
    changes.push({
      action: "skip",
      target: "project-owned-standards",
      reason:
        "Coverage gaps are reported only; create or map standards only with user authority."
    });
  }
  return initializationResponse(
    request,
    {
      ...emptyInitialization,
      write_performed: action !== "discover" && persistence === "project",
      manifest,
      sources: sourceResults,
      coverage,
      changes
    },
    "completed",
    catalogs
  );
}

function firstRunDiscovery(project, enabledRoles, catalogs) {
  return initializeProject(
    {
      schema_version: 1,
      operation: "initialize",
      project: clone(project),
      initialization: {
        action: "discover",
        persistence: "session",
        ...(enabledRoles?.length
          ? { enabled_roles: clone(enabledRoles) }
          : {})
      }
    },
    catalogs
  );
}

function firstRunDiscoveryFingerprint(discovery) {
  const sources = discovery.initialization.sources
    .map((source) => ({
      id: source.id,
      locator: source.locator,
      version: source.version
    }))
    .sort((left, right) => left.locator.localeCompare(right.locator));
  return `sha256:${crypto
    .createHash("sha256")
    .update(canonicalJson(sources))
    .digest("hex")}`;
}

function firstRunManifestPath(project) {
  return path.join(path.resolve(project.locator), ".zipzap", "project.json");
}

function firstRunState(input, catalogs) {
  assertObject(input.state, "first-run state");
  if (
    !Number.isInteger(input.expected_revision) ||
    input.expected_revision !== input.state.revision
  ) {
    throw new Error(
      `first-run revision mismatch: expected ${input.expected_revision}, state ${input.state.revision}`
    );
  }
  const state = clone(input.state);
  assertAllowedFields(
    state,
    [
      "revision",
      "stage",
      "project",
      "enabled_roles",
      "host",
      "discovery_fingerprint",
      "onboarding_state"
    ],
    "first-run state"
  );
  if (
    !Number.isInteger(state.revision) ||
    state.revision < 1 ||
    !["collecting", "preview-ready"].includes(state.stage) ||
    !state.project?.locator ||
    !Array.isArray(state.enabled_roles) ||
    !state.discovery_fingerprint
  ) {
    throw new Error("first-run state is invalid");
  }
  for (const roleId of state.enabled_roles) {
    if (!catalogs.roles.roles[roleId]) {
      throw new Error(`first-run references unknown role: ${roleId}`);
    }
  }
  if (state.host != null) {
    validateHostCapabilities(state.host);
  }
  validateOnboardingState(
    {
      state: state.onboarding_state,
      expected_revision: state.onboarding_state?.revision
    },
    catalogs
  );
  return state;
}

function firstRunCombinedPreview(discovery, onboardingState, catalogs) {
  return {
    discovery: clone(discovery.initialization),
    preferences: onboardingPreview(onboardingState),
    project_storage: {
      manifest: ".zipzap/project.json",
      tasks: catalogs.taskPolicy.local_store.locator,
      events: catalogs.taskPolicy.local_store.event_locator,
      reviews: catalogs.taskPolicy.local_store.review_locator,
      feedback: catalogs.taskPolicy.local_store.feedback_locator
    },
    warnings: [
      "No project files are written until this combined preview is confirmed.",
      "Project rules remain in their discovered source locations; ZipZap stores routing metadata only."
    ]
  };
}

function firstRunResponse(
  status,
  state,
  discovery,
  additions = {},
  catalogs = loadCatalogs()
) {
  const decisions =
    status === "preview-ready"
      ? [
          {
            code: "confirm-initialization",
            message: "Review the setup preview and confirm it.",
            kind: "confirm",
            options: [
              {
                id: "confirm",
                label: "Confirm initialization",
                description: "Write the exact previewed project configuration."
              },
              {
                id: "cancel",
                label: "Cancel",
                description: "Leave the project uninitialized."
              }
            ]
          }
        ]
      : status === "decision-required"
        ? [
            {
              code: "choose-initialization-preferences",
              message: "Choose preferences or accept the visible defaults.",
              options: [
                {
                  id: "configure",
                  label: "Configure initialization",
                  description: "Review and choose project preferences."
                },
                {
                  id: "recommended-defaults",
                  label: "Use recommended defaults",
                  description: "Preview the recommended configuration before writing."
                },
                {
                  id: "later",
                  label: "Not now",
                  description: "Keep the project uninitialized for now."
                }
              ]
            }
          ]
        : [];
  const decisionBundles =
    additions.decision_bundles ??
    (status === "preview-ready"
      ? buildDecisionBundles(decisions, {
          id: "first-run-confirmation",
          title: "Confirm project initialization",
          context:
            "Review discovered sources, selected preferences, project storage, and warnings before writing project state.",
          state_revision: state.revision,
          preview_required: false
        })
      : status === "decision-required"
        ? buildDecisionBundles(decisions, {
            id: "first-run-configuration",
            title: "Configure project initialization",
            context:
              "Choose initialization preferences before project state is written.",
            state_revision: state.revision
          })
        : []);
  return {
    schema_version: 1,
    status,
    state: clone(state),
    write_performed: additions.write_performed === true,
    discovery: clone(discovery.initialization),
    user_view: userExperienceView(
      "initialize",
      status,
      decisions,
      catalogs
    ),
    capability_matrix: buildHostCapabilityMatrix(state?.host ?? null),
    decision_bundles: decisionBundles,
    decision_interaction: projectDecisionInteraction(decisionBundles, {
      preferred_presentation:
        state?.onboarding_state?.presentation ?? "plain-text",
      native_form_available:
        additions.form != null ||
        state?.host?.capabilities?.includes("guided-form") === true
    }),
    ...additions
  };
}

function firstRunBlocked(
  discovery,
  message,
  actions,
  host = null,
  catalogs = loadCatalogs()
) {
  return {
    schema_version: 1,
    status: "blocked",
    state: null,
    write_performed: false,
    discovery: discovery ? clone(discovery.initialization) : null,
    user_view: userExperienceView(
      "initialize",
      "blocked",
      [{ code: "initialization-blocked", message }],
      catalogs
    ),
    capability_matrix: buildHostCapabilityMatrix(host),
    decision_bundles: [],
    decision_interaction: projectDecisionInteraction([]),
    required_actions: actions,
    limitations: [message]
  };
}

export function runFirstRun(input, catalogs = loadCatalogs()) {
  assertAllowedFields(
    input,
    [
      "schema_version",
      "operation",
      "presentation",
      "project",
      "enabled_roles",
      "host",
      "state",
      "expected_revision",
      "answer",
      "answers"
    ],
    "first-run input"
  );
  if (input.schema_version !== 1) {
    throw new Error("first-run schema_version must be 1");
  }
  if (!["start", "answer", "submit", "confirm"].includes(input.operation)) {
    throw new Error(`unsupported first-run operation: ${input.operation}`);
  }

  if (input.operation === "start") {
    if (!input.project?.locator) {
      throw new Error("first-run start requires project.locator");
    }
    if (input.host != null) {
      validateHostCapabilities(input.host);
    }
    const enabledRoles =
      input.enabled_roles ?? Object.keys(catalogs.roles.roles);
    const discovery = firstRunDiscovery(
      input.project,
      enabledRoles,
      catalogs
    );
    if (discovery.status === "blocked") {
      return firstRunBlocked(
        discovery,
        "Project discovery could not complete.",
        clone(discovery.initialization.unresolved),
        input.host ?? null,
        catalogs
      );
    }
    if (fs.existsSync(firstRunManifestPath(input.project))) {
      return firstRunBlocked(
        discovery,
        "This project is already initialized.",
        [
          "Use `zipzap onboard` to change preferences.",
          "Use `zipzap initialize` with action `refresh` to reconcile registered sources."
        ],
        input.host ?? null,
        catalogs
      );
    }
    const onboarding = advanceOnboarding(
      {
        schema_version: 1,
        operation: "start",
        presentation:
          input.presentation ??
          (input.host?.capabilities.includes("guided-form")
            ? "form"
            : "stepwise"),
        project: clone(input.project)
      },
      catalogs
    );
    const state = {
      revision: 1,
      stage: "collecting",
      project: clone(input.project),
      enabled_roles: clone(enabledRoles),
      ...(input.host ? { host: clone(input.host) } : {}),
      discovery_fingerprint: firstRunDiscoveryFingerprint(discovery),
      onboarding_state: clone(onboarding.state)
    };
    return firstRunResponse(
      "decision-required",
      state,
      discovery,
      onboarding.form
        ? {
            form: clone(onboarding.form),
            decision_bundles: clone(onboarding.decision_bundles)
          }
        : {
            question: clone(onboarding.question),
            decision_bundles: clone(onboarding.decision_bundles)
          },
      catalogs
    );
  }

  const state = firstRunState(input, catalogs);
  const discovery = firstRunDiscovery(
    state.project,
    state.enabled_roles,
    catalogs
  );
  if (discovery.status === "blocked") {
    return firstRunBlocked(
      discovery,
      "Project discovery could not be refreshed.",
      clone(discovery.initialization.unresolved),
      state.host ?? null,
      catalogs
    );
  }
  const currentFingerprint = firstRunDiscoveryFingerprint(discovery);

  if (input.operation === "confirm") {
    if (fs.existsSync(firstRunManifestPath(state.project))) {
      return firstRunBlocked(
        discovery,
        "Project configuration appeared after the first-run preview.",
        [
          "Inspect the current project configuration.",
          "Restart first-run only if the existing configuration should be replaced."
        ],
        state.host ?? null,
        catalogs
      );
    }
    const onboardingState = confirmableOnboardingState(
      {
        state: state.onboarding_state,
        expected_revision: state.onboarding_state.revision
      },
      catalogs
    );
    if (state.stage !== "preview-ready") {
      throw new Error("first-run confirm requires a combined preview");
    }
    if (currentFingerprint !== state.discovery_fingerprint) {
      state.revision += 1;
      state.discovery_fingerprint = currentFingerprint;
      return firstRunResponse("preview-ready", state, discovery, {
        preview: firstRunCombinedPreview(
          discovery,
          onboardingState,
          catalogs
        ),
        warnings: [
          "Project sources changed after the previous preview. Review the refreshed preview and confirm again."
        ]
      }, catalogs);
    }
    const projectPreferences =
      onboardingState.scope === "project"
        ? clone(onboardingState.configuration)
        : null;
    const configured = initializeProject(
      {
        schema_version: 1,
        operation: "initialize",
        project: clone(state.project),
        initialization: {
          action: "configure",
          persistence: "project",
          enabled_roles: clone(state.enabled_roles),
          sources: clone(discovery.initialization.manifest.sources),
          ...(projectPreferences
            ? { preferences: projectPreferences }
            : {})
        }
      },
      catalogs
    );
    if (configured.status !== "completed") {
      return firstRunBlocked(
        discovery,
        "Project configuration did not complete.",
        clone(configured.initialization.unresolved),
        state.host ?? null,
        catalogs
      );
    }
    state.revision += 1;
    return firstRunResponse("completed", state, discovery, {
      write_performed: configured.initialization.write_performed,
      initialization: clone(configured.initialization),
      configuration: clone(onboardingState.configuration),
      preference_storage: onboardingStorage(onboardingState.scope),
      limitations:
        onboardingState.scope === "project"
          ? []
          : [
              `The host must apply ${onboardingState.scope}-scoped preferences to ${onboardingStorage(onboardingState.scope).target}.`
            ],
      post_check: {
        manifest_present: fs.existsSync(firstRunManifestPath(state.project)),
        sources_registered:
          configured.initialization.sources.length,
        preferences_visible_before_write: true,
        single_manifest_write: true
      }
    }, catalogs);
  }

  const onboarding = advanceOnboarding(
    {
      schema_version: 1,
      operation: input.operation,
      project: clone(state.project),
      state: clone(state.onboarding_state),
      expected_revision: state.onboarding_state.revision,
      ...(input.answer ? { answer: clone(input.answer) } : {}),
      ...(input.answers ? { answers: clone(input.answers) } : {})
    },
    catalogs
  );
  state.revision += 1;
  state.discovery_fingerprint = currentFingerprint;
  state.onboarding_state = clone(onboarding.state);
  state.stage =
    onboarding.status === "preview-ready" ? "preview-ready" : "collecting";
  const additions = onboarding.form
    ? {
        form: clone(onboarding.form),
        decision_bundles: clone(onboarding.decision_bundles)
      }
    : onboarding.question
      ? {
          question: clone(onboarding.question),
          decision_bundles: clone(onboarding.decision_bundles)
        }
      : {
          preview: firstRunCombinedPreview(
            discovery,
            onboarding.state,
            catalogs
          )
        };
  return firstRunResponse(
    onboarding.status,
    state,
    discovery,
    additions,
    catalogs
  );
}

function invalidL5Response(envelope, error) {
  const request = envelope?.request;
  return {
    schema_version: 1,
    ...(request?.request_id ? { request_id: request.request_id } : {}),
    ...(request?.operation ? { operation: request.operation } : {}),
    ok: false,
    error: {
      code: "invalid-invocation",
      message: error.message,
      retryable: false
    }
  };
}

function invokeL5Detailed(envelope, catalogs) {
  try {
    assertAllowedFields(
      envelope,
      ["schema_version", "request", "context"],
      "L5 adapter invocation"
    );
    if (envelope.schema_version !== 1) {
      throw new Error("L5 adapter schema_version must be 1");
    }
    assertObject(envelope.request, "L5 invocation request");
    assertObject(envelope.context, "L5 invocation context");
    const request = envelope.request;
    const operation = request.operation;
    if (
      request.schema_version !== 1 ||
      !["initialize", "execute", "resume", "inspect"].includes(operation)
    ) {
      throw new Error("L5 request version or operation is invalid");
    }
    if (operation === "resume" && !request.context?.resume_from) {
      throw new Error("resume requires context.resume_from");
    }
    if (
      operation === "initialize" &&
      (!request.project?.locator || !request.initialization?.action)
    ) {
      throw new Error("initialize requires project and initialization input");
    }
    if (operation === "inspect" && !request.inspection?.target) {
      throw new Error("inspect requires an inspection target");
    }
    const base = {
      schema_version: 1,
      ...(request.request_id ? { request_id: request.request_id } : {}),
      operation,
      ok: true,
      decision_bundles: [],
      decision_interaction: projectDecisionInteraction([])
    };

    if (operation === "execute" || operation === "resume") {
      if (!envelope.context.risk_normalization) {
        throw new Error(`${operation} requires risk_normalization context`);
      }
      const assessmentInvocation =
        envelope.context.risk_normalization.assessment_input?.invocation;
      if (
        operation === "execute" &&
        canonicalJson(assessmentInvocation) !== canonicalJson(request)
      ) {
        throw new Error(
          "execute request must match the assessed L5 invocation"
        );
      }
      const normalization = normalizeRiskAssessment(
        envelope.context.risk_normalization,
        catalogs
      );
      if (normalization.status === "decision-required") {
        const decisions = normalization.decisions_required.map(l5Decision);
        return {
          response: {
            ...base,
            status: "decision-required",
            summary: "Risk assessment requires authorized clarification.",
            user_view: userExperienceView(
              operation,
              "decision-required",
              decisions,
              catalogs,
              {
                persistence_required:
                  normalization.derived_governance?.persistence_required === true
              }
            ),
            decisions_required: decisions,
            decision_bundles: clone(normalization.decision_bundles),
            decision_interaction: clone(normalization.decision_interaction),
            continuation: null,
            diagnostics_ref: null
          },
          normalization,
          kernel: null,
          diagnostics: null
        };
      }
      const evaluated = evaluateKernelDetailed(
        normalization.kernel_request,
        catalogs
      );
      const kernel = evaluated.response;
      const decisions = kernel.decisions_required.map(l5Decision);
      return {
        response: {
          ...base,
          status: kernel.status,
          summary:
            kernel.status === "ready"
              ? "The next accountable action is ready."
              : kernel.status === "decision-required"
                ? "A collaboration decision is required."
                : "The work is blocked by an unmet runtime condition.",
          user_view: userExperienceView(
            operation,
            kernel.status,
            decisions,
            catalogs,
            {
              persistence_required:
                normalization.derived_governance.persistence_required === true
            }
          ),
          ...(kernel.status === "ready"
            ? { execution: l5Execution(kernel.next_action) }
            : {}),
          assurance: l5Assurance(kernel.assurance),
          decisions_required: decisions,
          decision_bundles: clone(kernel.decision_bundles),
          decision_interaction: clone(kernel.decision_interaction),
          continuation: {
            work_id: kernel.continuation.work_id
          },
          diagnostics_ref: kernel.diagnostics_ref
        },
        normalization,
        kernel,
        diagnostics: evaluated.diagnostics
      };
    }

    if (operation === "initialize") {
      if (
        !envelope.context.initialization ||
        !["decision-required", "blocked", "completed"].includes(
          envelope.context.workflow_status
        ) ||
        (envelope.context.workflow_status === "decision-required" &&
          envelope.context.initialization.unresolved?.length === 0)
      ) {
        throw new Error(
          "initialize requires initialization data and a terminal workflow status"
        );
      }
      const decisions =
        envelope.context.workflow_status === "decision-required"
          ? envelope.context.initialization.unresolved.map(
              (message, index) => ({
                code: `initialization-decision-${index + 1}`,
                message
              })
            )
          : [];
      const decisionBundles =
        envelope.context.workflow_status === "decision-required"
          ? buildDecisionBundles(decisions, {
              id: "initialization-decision",
              title: "Resolve project initialization",
              context:
                "Resolve the reported initialization limitations before project state is written."
            })
          : [];
      return {
        response: {
          ...base,
          status: envelope.context.workflow_status,
          summary:
            envelope.context.summary ?? "Project initialization assessed.",
          user_view: userExperienceView(
            operation,
            envelope.context.workflow_status,
            decisions,
            catalogs
          ),
          initialization: clone(envelope.context.initialization),
          ...(envelope.context.workflow_status === "decision-required"
            ? {
                decisions_required: decisions,
                decision_bundles: decisionBundles,
                decision_interaction:
                  projectDecisionInteraction(decisionBundles)
              }
            : {}),
          diagnostics_ref: null
        },
        normalization: null,
        kernel: null,
        diagnostics: null
      };
    }

    if (operation === "inspect") {
      if (
        !envelope.context.inspection_result ||
        !["blocked", "completed"].includes(envelope.context.workflow_status)
      ) {
        throw new Error(
          "inspect requires inspection data and blocked or completed status"
        );
      }
      return {
        response: {
          ...base,
          status: envelope.context.workflow_status,
          summary: envelope.context.summary ?? "Inspection completed.",
          user_view: userExperienceView(
            operation,
            envelope.context.workflow_status,
            [],
            catalogs
          ),
          inspection_result: clone(envelope.context.inspection_result),
          diagnostics_ref: null
        },
        normalization: null,
        kernel: null,
        diagnostics: null
      };
    }
    throw new Error(`unsupported L5 operation: ${operation}`);
  } catch (error) {
    return {
      response: invalidL5Response(envelope, error),
      normalization: null,
      kernel: null,
      diagnostics: null
    };
  }
}

export function invokeL5(envelope, catalogs = loadCatalogs()) {
  return invokeL5Detailed(envelope, catalogs).response;
}

function validateTask(task) {
  assertObject(task, "task");
  if (
    task.schema_version !== 1 ||
    typeof task.task_id !== "string" ||
    task.task_id.trim() === "" ||
    !Number.isInteger(task.revision) ||
    task.revision < 1
  ) {
    throw new Error("task identity or revision is invalid");
  }
  if (
    task.assignee_id != null &&
    (typeof task.assignee_id !== "string" || task.assignee_id.trim() === "")
  ) {
    throw new Error("task.assignee_id must be a non-empty string when set");
  }
  assertObject(task.work, "task.work");
  if (
    typeof task.work.objective !== "string" ||
    task.work.objective.trim() === ""
  ) {
    throw new Error("task.work.objective must be a non-empty string");
  }
  if (!Array.isArray(task.evidence)) {
    throw new Error("task.evidence must be an array");
  }
  for (const field of [
    "dependencies",
    "blockers",
    "source_refs"
  ]) {
    if (!Array.isArray(task[field])) {
      throw new Error(`task.${field} must be an array`);
    }
  }
  for (const field of ["origin", "planning", "readiness_policy"]) {
    assertObject(task[field], `task.${field}`);
  }
  if (task.accountability != null) {
    assertObject(task.accountability, "task.accountability");
  }
  if (
    !Array.isArray(task.work.acceptance_criteria) ||
    task.work.acceptance_criteria.length === 0 ||
    task.work.acceptance_criteria.some(
      (criterion) =>
        !criterion ||
        !ID_PATTERN.test(criterion.id ?? "") ||
        typeof criterion.statement !== "string" ||
        criterion.statement.trim() === ""
    )
  ) {
    throw new Error("task.work.acceptance_criteria is invalid");
  }
  const evidenceIds = new Set();
  for (const evidence of task.evidence) {
    if (
      !evidence ||
      !ID_PATTERN.test(evidence.id ?? "") ||
      evidenceIds.has(evidence.id) ||
      typeof evidence.locator !== "string" ||
      evidence.locator.trim() === "" ||
      typeof evidence.statement !== "string" ||
      evidence.statement.trim() === ""
    ) {
      throw new Error(`task evidence is invalid: ${evidence?.id}`);
    }
    evidenceIds.add(evidence.id);
  }
}

function taskExecuteRequest(task) {
  const collaboration = task.collaboration ?? {};
  const hasCollaboration =
    collaboration.team_preference != null ||
    collaboration.persistence != null ||
    collaboration.personalization != null;
  return {
    schema_version: 1,
    operation: "execute",
    request_id: task.task_id,
    request: {
      ...(task.work.intent ? { intent: task.work.intent } : {}),
      ...(task.work.scope_depth
        ? { scope_depth: task.work.scope_depth }
        : {}),
      ...(task.work.assurance_target
        ? { assurance_target: task.work.assurance_target }
        : {}),
      ...(task.work.execution_budget
        ? { execution_budget: clone(task.work.execution_budget) }
        : {}),
      objective: task.work.objective,
      scope: clone(task.work.scope ?? []),
      requested_action: task.work.requested_action ?? "execute",
      constraints: clone(task.work.constraints ?? []),
      acceptance_criteria: (task.work.acceptance_criteria ?? []).map(
        (criterion) => criterion.statement
      )
    },
    ...(hasCollaboration
      ? {
          collaboration: {
            ...(collaboration.team_preference
              ? { team_preset: collaboration.team_preference }
              : {}),
            ...(collaboration.persistence
              ? { persistence: collaboration.persistence }
              : {}),
            ...(collaboration.personalization
              ? { personalization: clone(collaboration.personalization) }
              : {})
          }
        }
      : {})
  };
}

export function prepareTaskAssessment(task, catalogs = loadCatalogs()) {
  validateTask(task);
  return {
    schema_version: 1,
    taxonomy_version: catalogs.riskTaxonomy.schema_version,
    invocation: taskExecuteRequest(task),
    evidence: clone(task.evidence)
  };
}

function taskKernelState(task, state) {
  const previousRevisions = task.continuation?.kernel_revisions;
  if (!state && !previousRevisions) return undefined;
  return {
    ...(state ? clone(state) : {}),
    ...(previousRevisions
      ? { previous_revisions: clone(previousRevisions) }
      : {})
  };
}

function taskContinuation(kernel, task) {
  if (!kernel?.continuation) return null;
  return {
    work_id: kernel.continuation.work_id,
    ...(task.continuation?.resume_from
      ? { resume_from: task.continuation.resume_from }
      : {}),
    kernel_revisions: clone(kernel.continuation.revisions)
  };
}

export function adaptTask(input, catalogs = loadCatalogs()) {
  assertAllowedFields(
    input,
    [
      "schema_version",
      "action",
      "task",
      "assessment",
      "host",
      "project_sources",
      "state"
    ],
    "task adapter input"
  );
  if (
    input.schema_version !== 1 ||
    !["execute", "resume"].includes(input.action)
  ) {
    throw new Error("task adapter action must be execute or resume");
  }
  validateTask(input.task);
  if (["completed", "cancelled"].includes(input.task.status)) {
    throw new Error(`cannot ${input.action} ${input.task.status} task`);
  }
  if (
    input.action === "resume" &&
    !input.task.continuation?.resume_from
  ) {
    throw new Error("resume requires task.continuation.resume_from");
  }
  const assessmentInput = prepareTaskAssessment(input.task, catalogs);
  const normalizationInput = {
    schema_version: 1,
    work_id: input.task.task_id,
    work_type: input.task.work.work_type ?? null,
    affected_components: clone(
      input.task.work.affected_components ?? []
    ),
    assessment_input: assessmentInput,
    assessment: clone(input.assessment),
    host: clone(input.host),
    project_sources: clone(input.project_sources),
    ...(taskKernelState(input.task, input.state)
      ? { state: taskKernelState(input.task, input.state) }
      : {})
  };
  const publicRequest =
    input.action === "execute"
      ? assessmentInput.invocation
      : {
          schema_version: 1,
          operation: "resume",
          request_id: input.task.task_id,
          context: {
            resume_from: input.task.continuation.resume_from
          }
        };
  const invoked = invokeL5Detailed(
    {
      schema_version: 1,
      request: publicRequest,
      context: {
        risk_normalization: normalizationInput
      }
    },
    catalogs
  );
  if (!invoked.normalization) {
    throw new Error(
      invoked.response.error?.message ?? "task invocation normalization failed"
    );
  }
  const governanceSnapshot = {
    derived: true,
    taxonomy_version: catalogs.riskTaxonomy.schema_version,
    task_revision: input.task.revision,
    ...clone(invoked.normalization.derived_governance)
  };
  const effectiveTeam =
    invoked.diagnostics?.preset_resolution?.effective ?? null;
  const runtimeSnapshot =
    invoked.response.status === "ready" &&
    effectiveTeam &&
    invoked.kernel?.continuation?.revisions.binding
      ? {
          derived: true,
          effective_team: effectiveTeam,
          assurance_mode: invoked.kernel.assurance.mode,
          taxonomy_version: catalogs.riskTaxonomy.schema_version,
          runtime_policy_version: catalogs.runtimePolicy.schema_version,
          task_revision: input.task.revision,
          binding_revision:
            invoked.kernel.continuation.revisions.binding
        }
      : null;
  return {
    schema_version: 1,
    action: input.action,
    response: invoked.response,
    task_patch: {
      base_revision: input.task.revision,
      next_revision: input.task.revision + 1,
      status:
        catalogs.taskPolicy.response_status_to_task_status[
          invoked.response.status
        ],
      risk_assessment: clone(input.assessment),
      governance_snapshot: governanceSnapshot,
      runtime_snapshot: runtimeSnapshot,
      continuation: taskContinuation(invoked.kernel, input.task),
      invalidates_previous_runtime: input.task.runtime_snapshot != null
    }
  };
}

function validateHostCapabilities(host) {
  assertObject(host, "host capabilities");
  const allowedFields = new Set([
    "schema_version",
    "host_id",
    "surface",
    "capabilities",
    "limits",
    "runtimes",
    "tools",
    "interfaces"
  ]);
  for (const field of Object.keys(host)) {
    if (!allowedFields.has(field)) {
      throw new Error(`unknown host capabilities field: ${field}`);
    }
  }
  if (host.schema_version !== 1) {
    throw new Error("host capabilities schema_version must be 1");
  }
  if (typeof host.host_id !== "string" || !ID_PATTERN.test(host.host_id)) {
    throw new Error("host capabilities host_id must be kebab-case");
  }
  if (typeof host.surface !== "string" || host.surface.trim() === "") {
    throw new Error("host capabilities surface must be a non-empty string");
  }
  for (const field of ["capabilities", "runtimes"]) {
    if (
      !Array.isArray(host[field]) ||
      host[field].some(
        (value) => typeof value !== "string" || !ID_PATTERN.test(value)
      ) ||
      new Set(host[field]).size !== host[field].length
    ) {
      throw new Error(
        `host capabilities ${field} must contain unique kebab-case values`
      );
    }
  }
  if (
    host.tools != null &&
    (!Array.isArray(host.tools) ||
      host.tools.some(
        (value) => typeof value !== "string" || value.trim() === ""
      ) ||
      new Set(host.tools).size !== host.tools.length)
  ) {
    throw new Error("host capabilities tools must contain unique strings");
  }
  assertObject(host.limits, "host capabilities limits");
  for (const field of ["concurrency_limit", "distinct_context_limit"]) {
    if (!Number.isInteger(host.limits[field]) || host.limits[field] < 1) {
      throw new Error(`host capabilities limits.${field} must be positive`);
    }
  }
  if (
    host.limits.multi_agent_authorization != null &&
    !["unknown", "granted", "denied"].includes(
      host.limits.multi_agent_authorization
    )
  ) {
    throw new Error(
      "host capabilities limits.multi_agent_authorization must be unknown, granted, or denied"
    );
  }
  assertObject(host.interfaces, "host capabilities interfaces");
  for (const interfaceId of ["l5", "kernel"]) {
    const versions = host.interfaces[interfaceId];
    if (
      !Array.isArray(versions) ||
      versions.some((version) => !Number.isInteger(version) || version < 1) ||
      new Set(versions).size !== versions.length
    ) {
      throw new Error(
        `host capabilities interfaces.${interfaceId} must be a version array`
      );
    }
  }
}

function missingValues(available, required) {
  const values = new Set(available ?? []);
  return (required ?? []).filter((value) => !values.has(value));
}

export function buildHostCapabilityMatrix(host = null) {
  const unknownEntries = [
    [
      "multi-agent",
      "Multi-Agent contexts",
      "Assume Solo only; confirm host support before requiring independent Agent contexts."
    ],
    ["guided-form", "Guided form", "Use stepwise conversation."],
    [
      "exact-token-telemetry",
      "Exact token telemetry",
      "Record measurement as unavailable; do not estimate token counts."
    ],
    [
      "goal-budgeting",
      "Goal budgeting",
      "Keep an optional Task resource budget without creating a Goal."
    ],
    ["node-acceleration", "Node acceleration", "Use the direct JSON contract."],
    [
      "project-state",
      "Project state",
      "Keep work ephemeral until project access is confirmed."
    ]
  ].map(([id, label, fallback]) => ({
    id,
    label,
    status: "unknown",
    summary: "The host did not report this capability.",
    fallback
  }));
  if (host == null) {
    return {
      schema_version: 1,
      assessed: false,
      entries: unknownEntries,
      limitations: [
        "Host capabilities were not supplied; optional features remain unverified."
      ]
    };
  }

  validateHostCapabilities(host);
  const capabilities = new Set(host.capabilities);
  const runtimes = new Set(host.runtimes);
  const contextLimit = host.limits.distinct_context_limit;
  const authorization =
    host.limits.multi_agent_authorization ?? "unknown";
  let multiAgentStatus = "unavailable";
  let multiAgentSummary =
    "Only one distinct Agent context is available.";
  if (contextLimit > 1 && authorization === "granted") {
    multiAgentStatus = "available";
    multiAgentSummary =
      `Up to ${contextLimit} distinct Agent contexts are authorized.`;
  } else if (contextLimit > 1 && authorization === "unknown") {
    multiAgentStatus = "authorization-required";
    multiAgentSummary =
      `The host can provide ${contextLimit} contexts, but Multi-Agent use needs authorization.`;
  } else if (contextLimit > 1 && authorization === "denied") {
    multiAgentSummary =
      "The host can provide multiple contexts, but authorization was denied.";
  }

  const guidedForm = capabilities.has("guided-form");
  const tokenTelemetry = capabilities.has("token-usage-reporting");
  const goalBudgeting = capabilities.has("goal-budgeting");
  const nodeAcceleration =
    capabilities.has("script-execution") && runtimes.has("node");
  const projectRead = capabilities.has("project-read");
  const projectWrite = capabilities.has("project-write");
  const projectState =
    capabilities.has("project-state") || (projectRead && projectWrite);

  return {
    schema_version: 1,
    assessed: true,
    entries: [
      {
        id: "multi-agent",
        label: "Multi-Agent contexts",
        status: multiAgentStatus,
        summary: multiAgentSummary,
        fallback:
          multiAgentStatus === "available"
            ? null
            : "Run Solo where sufficient, or assign qualified humans to required independent gates."
      },
      {
        id: "guided-form",
        label: "Guided form",
        status: guidedForm ? "available" : "unavailable",
        summary: guidedForm
          ? "The host can render page-based onboarding."
          : "The host did not report page-based onboarding.",
        fallback: guidedForm ? null : "Use the stepwise conversation contract."
      },
      {
        id: "exact-token-telemetry",
        label: "Exact token telemetry",
        status: tokenTelemetry ? "available" : "unavailable",
        summary: tokenTelemetry
          ? "The host can report exact task token usage."
          : "Exact host token telemetry is unavailable.",
        fallback: tokenTelemetry
          ? null
          : "Record measurement as unavailable; do not estimate token counts."
      },
      {
        id: "goal-budgeting",
        label: "Goal budgeting",
        status: goalBudgeting ? "available" : "unavailable",
        summary: goalBudgeting
          ? "The host can create explicitly authorized budget Goals."
          : "The host did not report Goal budgeting.",
        fallback: goalBudgeting
          ? null
          : "Keep an optional Task resource budget without creating a Goal."
      },
      {
        id: "node-acceleration",
        label: "Node acceleration",
        status: nodeAcceleration ? "available" : "unavailable",
        summary: nodeAcceleration
          ? "The zero-dependency Node adapters are available."
          : "Node script acceleration is unavailable.",
        fallback: nodeAcceleration ? null : "Use the direct JSON contract."
      },
      {
        id: "project-state",
        label: "Project state",
        status: projectState
          ? "available"
          : projectRead
            ? "degraded"
            : "unavailable",
        summary: projectState
          ? "The host can read and write project-owned ZipZap state."
          : projectRead
            ? "The host can inspect project state but cannot persist changes."
            : "Project state access was not reported.",
        fallback: projectState
          ? null
          : "Keep work ephemeral or ask the host for project access."
      }
    ],
    limitations: []
  };
}

export function assessHost(
  host,
  operationId,
  action = null,
  catalogs = loadCatalogs()
) {
  validateHostCapabilities(host);
  const compatibility = catalogs.compatibility;
  const operation = compatibility.operations?.[operationId];
  if (!operation) {
    throw new Error(`unknown L5 operation: ${operationId}`);
  }
  const actions = operation.actions ?? null;
  if (actions && !action) {
    throw new Error(`${operationId} requires an action`);
  }
  if (action && (!actions || !Object.hasOwn(actions, action))) {
    throw new Error(`unknown ${operationId} action: ${action}`);
  }

  const checks = [];
  const limitations = [];
  const negotiated = {};
  let interfacesCompatible = true;
  for (const interfaceId of ["l5", "kernel"]) {
    const current = compatibility.interfaces[interfaceId].current;
    const supported = host.interfaces[interfaceId].includes(current);
    negotiated[interfaceId] = supported ? current : null;
    if ((operation.required_interfaces ?? []).includes(interfaceId)) {
      interfacesCompatible &&= supported;
      checks.push({
        id: `${interfaceId}-interface`,
        passed: supported,
        message: supported
          ? `${interfaceId} interface version ${current} is supported.`
          : `${interfaceId} interface version ${current} is required.`
      });
      if (!supported) {
        limitations.push(
          `Host does not support required ${interfaceId} interface version ${current}.`
        );
      }
    }
  }

  const requiredCapabilities = unique([
    ...(operation.required_capabilities ?? []),
    ...(actions?.[action] ?? [])
  ]);
  const missingOperationCapabilities = missingValues(
    host.capabilities,
    requiredCapabilities
  );
  const unsatisfiedGroups = (operation.any_capability_groups ?? []).filter(
    (group) => missingValues(host.capabilities, group).length === group.length
  );
  const operationCompatible =
    missingOperationCapabilities.length === 0 &&
    unsatisfiedGroups.length === 0;
  checks.push({
    id: "operation-capabilities",
    passed: operationCompatible,
    message: operationCompatible
      ? `${operationId}${action ? `/${action}` : ""} capabilities are available.`
      : `${operationId}${action ? `/${action}` : ""} capabilities are incomplete.`
  });
  for (const group of unsatisfiedGroups) {
    limitations.push(`One of ${group.join(", ")} is required.`);
  }

  let selectedAdapter = null;
  const adapterDiagnostics = [];
  for (const adapterId of compatibility.adapter_order) {
    const adapter = compatibility.adapters[adapterId];
    const missingCapabilities = missingValues(
      host.capabilities,
      adapter.required_capabilities
    );
    const missingRuntimes = missingValues(
      host.runtimes,
      adapter.required_runtimes
    );
    adapterDiagnostics.push({
      id: adapterId,
      missingCapabilities,
      missingRuntimes
    });
    if (
      !selectedAdapter &&
      missingCapabilities.length === 0 &&
      missingRuntimes.length === 0
    ) {
      selectedAdapter = adapterId;
    }
  }
  const adapterCompatible = selectedAdapter !== null;
  checks.push({
    id: "adapter-selection",
    passed: adapterCompatible,
    message: selectedAdapter
      ? `Selected ${selectedAdapter}.`
      : "No registered execution adapter is available."
  });

  const fallbackUsed =
    selectedAdapter !== null &&
    compatibility.adapter_order.indexOf(selectedAdapter) > 0;
  if (fallbackUsed) {
    limitations.push(
      `Using ${selectedAdapter} because a higher-priority adapter is unavailable.`
    );
  }
  if (
    selectedAdapter === "direct-json" &&
    !host.runtimes.includes("node")
  ) {
    limitations.push(
      "The optional Node accelerator is unavailable; direct JSON remains supported."
    );
  }

  const policiesPreserved = Object.values(compatibility.policies).every(
    (enabled) => enabled === true
  );
  const compatible =
    interfacesCompatible && operationCompatible && adapterCompatible;
  const governancePreserved = compatible && policiesPreserved;
  checks.push({
    id: "governance-preservation",
    passed: governancePreserved,
    message: governancePreserved
      ? "Adapter selection preserves ZipZap governance and public contracts."
      : "ZipZap governance cannot be claimed for this invocation."
  });

  const missingAdapterCapabilities = selectedAdapter
    ? []
    : adapterDiagnostics
        .find((item) => item.id === "direct-json")
        ?.missingCapabilities ?? [];
  const missingCapabilities = unique([
    ...missingOperationCapabilities,
    ...missingAdapterCapabilities,
    ...unsatisfiedGroups.map((group) => group.join("|"))
  ]);
  if (!adapterCompatible) {
    const runtimeGaps = unique(
      adapterDiagnostics.flatMap((item) => item.missingRuntimes)
    );
    if (runtimeGaps.length) {
      limitations.push(`Unavailable optional runtimes: ${runtimeGaps.join(", ")}.`);
    }
  }

  return {
    schema_version: 1,
    compatible,
    selected_adapter: selectedAdapter,
    fallback_used: fallbackUsed,
    interface_versions: negotiated,
    governance_preserved: governancePreserved,
    capability_matrix: buildHostCapabilityMatrix(host),
    checks,
    missing_capabilities: missingCapabilities,
    limitations: unique(limitations)
  };
}

function safePackagePath(rootDir, relativePath) {
  if (
    typeof relativePath !== "string" ||
    relativePath === "" ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(`invalid package path: ${relativePath}`);
  }
  const absolutePath = path.resolve(rootDir, relativePath);
  if (
    absolutePath !== rootDir &&
    !absolutePath.startsWith(`${rootDir}${path.sep}`)
  ) {
    throw new Error(`package path escapes the Skill root: ${relativePath}`);
  }
  return absolutePath;
}

function collectPackageFiles(rootDir, includeRoots) {
  const files = [];
  const seen = new Set();
  const visit = (absolutePath) => {
    const stat = fs.lstatSync(absolutePath);
    if (stat.isSymbolicLink()) {
      throw new Error(
        `release packages cannot contain symbolic links: ${path.relative(rootDir, absolutePath)}`
      );
    }
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(absolutePath).sort()) {
        visit(path.join(absolutePath, entry));
      }
      return;
    }
    if (!stat.isFile()) {
      throw new Error(
        `release packages support regular files only: ${path.relative(rootDir, absolutePath)}`
      );
    }
    const content = fs.readFileSync(absolutePath);
    const relativePath = path
      .relative(rootDir, absolutePath)
      .split(path.sep)
      .join("/");
    if (seen.has(relativePath)) {
      throw new Error(`package include roots overlap: ${relativePath}`);
    }
    seen.add(relativePath);
    files.push({
      path: relativePath,
      sha256: crypto.createHash("sha256").update(content).digest("hex"),
      size: content.length
    });
  };

  for (const relativePath of includeRoots) {
    const absolutePath = safePackagePath(rootDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`package include root is unavailable: ${relativePath}`);
    }
    visit(absolutePath);
  }
  return files.sort((left, right) =>
    left.path === right.path ? 0 : left.path < right.path ? -1 : 1
  );
}

function catalogVersions(rootDir) {
  const versions = {};
  const configDir = path.join(rootDir, "config");
  for (const fileName of fs.readdirSync(configDir).sort()) {
    if (!fileName.endsWith(".json")) continue;
    const catalog = readJson(path.join(configDir, fileName));
    if (!Number.isInteger(catalog.schema_version) || catalog.schema_version < 1) {
      throw new Error(`${fileName} must define a positive schema_version`);
    }
    versions[fileName.replace(/\.json$/, "")] = catalog.schema_version;
  }
  return versions;
}

export function buildReleaseManifest(catalogs = loadCatalogs()) {
  const lifecycle = catalogs.lifecycle;
  return {
    schema_version: 1,
    skill: {
      name: lifecycle.skill.name,
      version: lifecycle.skill.current_version,
      channel: lifecycle.skill.channel
    },
    package_format: lifecycle.package.format,
    interfaces: {
      l5: catalogs.compatibility.interfaces.l5.current,
      kernel: catalogs.compatibility.interfaces.kernel.current
    },
    catalogs: catalogVersions(catalogs.rootDir),
    runtime_dependencies: clone(lifecycle.runtime_dependencies),
    release_requirements: clone(lifecycle.release_gates),
    files: collectPackageFiles(
      catalogs.rootDir,
      lifecycle.package.include_roots
    )
  };
}

function validateReleaseManifest(manifest) {
  assertObject(manifest, "release manifest");
  if (manifest.schema_version !== 1) {
    throw new Error("release manifest schema_version must be 1");
  }
  assertObject(manifest.skill, "release manifest skill");
  if (
    manifest.skill.name !== "zipzap" ||
    !SEMVER_PATTERN.test(manifest.skill.version ?? "")
  ) {
    throw new Error("release manifest must identify a semantic ZipZap version");
  }
  if (
    !RELEASE_CHANNELS.has(manifest.skill.channel) ||
    manifest.skill.channel !== releaseChannelForVersion(manifest.skill.version)
  ) {
    throw new Error(
      `release manifest channel ${manifest.skill.channel ?? "missing"} does not match version ${manifest.skill.version}`
    );
  }
  if (!Array.isArray(manifest.runtime_dependencies)) {
    throw new Error("release manifest runtime_dependencies must be an array");
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error("release manifest files must be a non-empty array");
  }
  const paths = new Set();
  for (const file of manifest.files) {
    assertObject(file, "release manifest file");
    const normalizedPath = path.posix.normalize(file.path ?? "");
    if (
      normalizedPath !== file.path ||
      normalizedPath === ".." ||
      normalizedPath.startsWith("../") ||
      normalizedPath.startsWith("/") ||
      paths.has(file.path) ||
      !/^[a-f0-9]{64}$/.test(file.sha256 ?? "") ||
      !Number.isInteger(file.size) ||
      file.size < 0
    ) {
      throw new Error(`invalid release manifest file: ${file.path}`);
    }
    paths.add(file.path);
  }
}

function verifyReleaseManifest(manifest, catalogs) {
  validateReleaseManifest(manifest);
  const current = buildReleaseManifest(catalogs);
  const expectedFiles = new Map(
    current.files.map((file) => [file.path, file])
  );
  const actualFiles = new Map(
    manifest.files.map((file) => [file.path, file])
  );
  const missing = [...expectedFiles.keys()].filter(
    (filePath) => !actualFiles.has(filePath)
  );
  const unexpected = [...actualFiles.keys()].filter(
    (filePath) => !expectedFiles.has(filePath)
  );
  const changed = [...expectedFiles.keys()].filter((filePath) => {
    const actual = actualFiles.get(filePath);
    const expected = expectedFiles.get(filePath);
    return (
      actual &&
      (actual.sha256 !== expected.sha256 || actual.size !== expected.size)
    );
  });
  const requiredMissing = catalogs.lifecycle.package.required_files.filter(
    (filePath) => !actualFiles.has(filePath)
  );
  return {
    versionMatches:
      manifest.skill.version === catalogs.lifecycle.skill.current_version,
    metadataMatches:
      manifest.package_format === current.package_format &&
      manifest.skill.channel === current.skill.channel &&
      canonicalJson(manifest.catalogs) === canonicalJson(current.catalogs) &&
      canonicalJson(manifest.release_requirements) ===
        canonicalJson(current.release_requirements),
    interfacesMatch:
      manifest.interfaces?.l5 === current.interfaces.l5 &&
      manifest.interfaces?.kernel === current.interfaces.kernel,
    dependencyPolicyPreserved:
      manifest.runtime_dependencies.length === 0 &&
      catalogs.lifecycle.runtime_dependencies.length === 0,
    inventoryMatches:
      missing.length === 0 &&
      unexpected.length === 0 &&
      changed.length === 0,
    requiredFilesPresent: requiredMissing.length === 0,
    details: {
      missing,
      unexpected,
      changed,
      requiredMissing
    }
  };
}

function parseSemver(version) {
  if (!SEMVER_PATTERN.test(version ?? "")) {
    throw new Error(`invalid semantic version: ${version}`);
  }
  const coreAndPre = version.split("+", 1)[0];
  const separator = coreAndPre.indexOf("-");
  const core =
    separator === -1 ? coreAndPre : coreAndPre.slice(0, separator);
  const prerelease =
    separator === -1 ? null : coreAndPre.slice(separator + 1).split(".");
  return {
    parts: core.split(".").map(Number),
    prerelease
  };
}

function releaseChannelForVersion(version) {
  const { prerelease } = parseSemver(version);
  if (prerelease === null) return "stable";
  const family = prerelease[0];
  if (family === "dev" || family === "development") return "development";
  if (["alpha", "beta", "rc"].includes(family)) return family;
  return null;
}

function compareSemver(left, right) {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.parts[index] !== rightVersion.parts[index]) {
      return Math.sign(leftVersion.parts[index] - rightVersion.parts[index]);
    }
  }
  if (leftVersion.prerelease === rightVersion.prerelease) return 0;
  if (leftVersion.prerelease === null) return 1;
  if (rightVersion.prerelease === null) return -1;
  const length = Math.max(
    leftVersion.prerelease.length,
    rightVersion.prerelease.length
  );
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart == null) return -1;
    if (rightPart == null) return 1;
    if (leftPart === rightPart) continue;
    const leftNumeric = /^[0-9]+$/.test(leftPart);
    const rightNumeric = /^[0-9]+$/.test(rightPart);
    if (leftNumeric && rightNumeric) {
      return Math.sign(Number(leftPart) - Number(rightPart));
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

function lifecycleCheck(checks, id, passed, success, failure) {
  checks.push({
    id,
    passed,
    message: passed ? success : failure
  });
}

function checkHostConformance(checks, conformance) {
  const passed =
    conformance?.compatible === true &&
    conformance?.governance_preserved === true;
  lifecycleCheck(
    checks,
    "host-conformance",
    passed,
    "The target host is compatible and preserves governance.",
    "Obtain a compatible L6 host result with governance preserved."
  );
}

function knownRelease(lifecycle, version) {
  return lifecycle.known_releases.find((release) => release.version === version);
}

function migrationFor(lifecycle, fromVersion, toVersion) {
  return lifecycle.migrations.find(
    (migration) =>
      migration.from_version === fromVersion &&
      migration.to_version === toVersion
  );
}

function migrationRequired(lifecycle, fromRelease, toRelease) {
  if (!fromRelease || !toRelease) return true;
  const majorChanged =
    parseSemver(fromRelease.version).parts[0] !==
    parseSemver(toRelease.version).parts[0];
  const interfacesChanged =
    fromRelease.interfaces.l5 !== toRelease.interfaces.l5 ||
    fromRelease.interfaces.kernel !== toRelease.interfaces.kernel;
  return (
    interfacesChanged ||
    (majorChanged &&
      lifecycle.policies.major_interface_change_requires_migration)
  );
}

function inspectUpgradeProject(project, catalogs) {
  if (!project?.locator) return null;
  const projectRoot = path.resolve(project.locator);
  if (!fs.existsSync(projectRoot) || !fs.statSync(projectRoot).isDirectory()) {
    return {
      status: "blocked",
      manifest_present: false,
      manifest_compatible: false,
      manifest_sha256: "absent",
      preferences_status: "unknown",
      source_status: {
        unchanged: 0,
        stale: 0,
        unavailable: 0
      },
      next_route: null,
      limitations: [
        `Project locator is not an available directory: ${project.locator}`
      ]
    };
  }
  const manifestPath = path.join(projectRoot, ".zipzap", "project.json");
  if (!fs.existsSync(manifestPath)) {
    return {
      status: "first-run-required",
      manifest_present: false,
      manifest_compatible: true,
      manifest_sha256: "absent",
      preferences_status: "missing",
      source_status: {
        unchanged: 0,
        stale: 0,
        unavailable: 0
      },
      next_route: "first-run",
      limitations: []
    };
  }
  let manifest;
  try {
    manifest = validateProjectManifest(readJson(manifestPath), catalogs);
  } catch (error) {
    return {
      status: "blocked",
      manifest_present: true,
      manifest_compatible: false,
      manifest_sha256: hashFile(manifestPath),
      preferences_status: "unknown",
      source_status: {
        unchanged: 0,
        stale: 0,
        unavailable: 0
      },
      next_route: null,
      limitations: [`Project manifest is incompatible: ${error.message}`]
    };
  }
  const personalization = manifest.collaboration?.personalization;
  const configuredCorePreferences =
    Boolean(manifest.collaboration?.preferred_preset) &&
    Boolean(personalization?.response_detail) &&
    Boolean(personalization?.humor);
  const refresh = initializeProject(
    {
      schema_version: 1,
      operation: "initialize",
      project: {
        id: manifest.project_id,
        locator: projectRoot
      },
      initialization: {
        action: "refresh",
        persistence: "session"
      }
    },
    catalogs
  );
  const sourceStatus = {
    unchanged: 0,
    stale: 0,
    unavailable: 0
  };
  for (const source of refresh.initialization.sources) {
    if (source.status === "stale") sourceStatus.stale += 1;
    else if (source.status === "unavailable") sourceStatus.unavailable += 1;
    else sourceStatus.unchanged += 1;
  }
  const sourcesNeedAttention =
    sourceStatus.stale > 0 || sourceStatus.unavailable > 0;
  return {
    status: configuredCorePreferences
      ? sourcesNeedAttention
        ? "refresh-required"
        : "ready"
      : "onboarding-required",
    manifest_present: true,
    manifest_compatible: true,
    manifest_sha256: hashFile(manifestPath),
    preferences_status: configuredCorePreferences
      ? "configured"
      : "missing",
    source_status: sourceStatus,
    next_route: configuredCorePreferences
      ? sourcesNeedAttention
        ? "initialize-refresh"
        : null
      : "onboard",
    limitations: clone(refresh.initialization.unresolved)
  };
}

function validateLifecycleRequest(request) {
  assertObject(request, "lifecycle request");
  const allowedFields = new Set([
    "schema_version",
    "operation",
    "release_manifest",
    "evidence",
    "host_conformance",
    "installed_version",
    "target_version",
    "backup_available",
    "project_state_preserved",
    "project",
    "previous_project_manifest_sha256"
  ]);
  for (const field of Object.keys(request)) {
    if (!allowedFields.has(field)) {
      throw new Error(`unknown lifecycle request field: ${field}`);
    }
  }
  if (request.schema_version !== 1) {
    throw new Error("lifecycle request schema_version must be 1");
  }
  const operations = new Set([
    "build-release",
    "verify-release",
    "publish",
    "install",
    "upgrade",
    "verify-upgrade",
    "rollback"
  ]);
  if (!operations.has(request.operation)) {
    throw new Error(`unknown lifecycle operation: ${request.operation}`);
  }
  const requiredByOperation = {
    "build-release": [],
    "verify-release": ["release_manifest"],
    publish: ["release_manifest", "evidence"],
    install: ["target_version", "host_conformance"],
    upgrade: ["installed_version", "target_version", "host_conformance"],
    "verify-upgrade": [
      "installed_version",
      "target_version",
      "host_conformance",
      "release_manifest"
    ],
    rollback: [
      "installed_version",
      "target_version",
      "host_conformance",
      "backup_available",
      "project_state_preserved"
    ]
  };
  for (const field of requiredByOperation[request.operation]) {
    if (request[field] == null) {
      throw new Error(`${request.operation} requires ${field}`);
    }
  }
  if (request.project) {
    assertAllowedFields(request.project, ["id", "locator"], "lifecycle project");
    if (!request.project.locator) {
      throw new Error("lifecycle project requires locator");
    }
  }
  if (
    request.previous_project_manifest_sha256 != null &&
    !/^(?:absent|sha256:[a-f0-9]{64})$/.test(
      request.previous_project_manifest_sha256
    )
  ) {
    throw new Error(
      "previous_project_manifest_sha256 must be absent or a SHA-256 reference"
    );
  }
}

export function assessLifecycle(request, catalogs = loadCatalogs()) {
  validateLifecycleRequest(request);
  const lifecycle = catalogs.lifecycle;
  const checks = [];
  const requiredActions = [];
  const migrationPlan = [];
  const nextActions = [];
  let releaseManifest = null;
  let projectCheck = null;

  if (request.operation === "build-release") {
    const catalogValidation = validateCatalogs(catalogs);
    lifecycleCheck(
      checks,
      "catalog-valid",
      catalogValidation.valid,
      "Catalogs and lifecycle policy are internally valid.",
      "Resolve catalog validation errors before building a release."
    );
    releaseManifest = buildReleaseManifest(catalogs);
    lifecycleCheck(
      checks,
      "runtime-dependencies",
      releaseManifest.runtime_dependencies.length === 0,
      "The release has no runtime package dependencies.",
      "Remove runtime package dependencies from the release."
    );
  } else if (
    request.operation === "verify-release" ||
    request.operation === "publish"
  ) {
    const verification = verifyReleaseManifest(
      request.release_manifest,
      catalogs
    );
    lifecycleCheck(
      checks,
      "release-version",
      verification.versionMatches,
      "The release version matches the current lifecycle version.",
      "Build the manifest from the current lifecycle version."
    );
    lifecycleCheck(
      checks,
      "release-metadata",
      verification.metadataMatches,
      "Package format, catalogs, and release requirements match.",
      "Rebuild the release manifest from current lifecycle metadata."
    );
    lifecycleCheck(
      checks,
      "interface-versions",
      verification.interfacesMatch,
      "Release interface versions match the current contracts.",
      "Rebuild the release manifest with current interface versions."
    );
    lifecycleCheck(
      checks,
      "runtime-dependencies",
      verification.dependencyPolicyPreserved,
      "The release preserves the zero-dependency runtime policy.",
      "Remove undeclared runtime dependencies."
    );
    lifecycleCheck(
      checks,
      "package-inventory",
      verification.inventoryMatches,
      "Package paths, sizes, and hashes match the current Skill.",
      `Rebuild the manifest; package differences: ${JSON.stringify(verification.details)}`
    );
    lifecycleCheck(
      checks,
      "required-files",
      verification.requiredFilesPresent,
      "All required Skill files are present.",
      `Restore required files: ${verification.details.requiredMissing.join(", ")}`
    );

    if (request.operation === "publish") {
      const evidence = new Map(
        (request.evidence ?? []).map((item) => [item.gate, item])
      );
      for (const gate of lifecycle.release_gates) {
        const passed = evidence.get(gate)?.status === "passed";
        lifecycleCheck(
          checks,
          `gate-${gate}`,
          passed,
          `${gate} has passing evidence.`,
          `Provide passing evidence for ${gate}.`
        );
      }
    }
  } else {
    checkHostConformance(checks, request.host_conformance);
    if (request.operation !== "rollback") {
      lifecycleCheck(
        checks,
        "target-version",
        request.target_version === lifecycle.skill.current_version,
        "The target is the current ZipZap release.",
        `Use current target version ${lifecycle.skill.current_version}.`
      );
    }
    lifecycleCheck(
      checks,
      "runtime-dependencies",
      lifecycle.runtime_dependencies.length === 0,
      "Installation requires no runtime package dependencies.",
      "Runtime dependency installation is forbidden."
    );

    if (
      request.operation === "upgrade" ||
      request.operation === "verify-upgrade"
    ) {
      const fromRelease = knownRelease(lifecycle, request.installed_version);
      const toRelease = knownRelease(lifecycle, request.target_version);
      lifecycleCheck(
        checks,
        "source-version-known",
        Boolean(fromRelease),
        "The installed version is registered.",
        "Register or inspect the installed version before upgrading."
      );
      lifecycleCheck(
        checks,
        "version-direction",
        compareSemver(request.target_version, request.installed_version) > 0,
        "The target version is newer than the installed version.",
        "Upgrade requires a newer target version."
      );
      const required = migrationRequired(lifecycle, fromRelease, toRelease);
      const migration = required
        ? migrationFor(
            lifecycle,
            request.installed_version,
            request.target_version
          )
        : null;
      lifecycleCheck(
        checks,
        "migration-coverage",
        !required || Boolean(migration),
        required
          ? "A required migration is registered."
          : "No migration is required for this transition.",
        "Register a migration for this interface or major-version transition."
      );
      if (migration) migrationPlan.push(clone(migration));
    }

    if (request.operation === "verify-upgrade") {
      const verification = verifyReleaseManifest(
        request.release_manifest,
        catalogs
      );
      const catalogValidation = validateCatalogs(catalogs);
      lifecycleCheck(
        checks,
        "post-upgrade-catalog-valid",
        catalogValidation.valid,
        "Installed catalogs and schemas are valid after upgrade.",
        "Repair the installed Skill before using the upgraded version."
      );
      lifecycleCheck(
        checks,
        "post-upgrade-release-version",
        verification.versionMatches,
        "Installed release metadata matches the target version.",
        "The installed version or channel does not match the target release."
      );
      lifecycleCheck(
        checks,
        "post-upgrade-package-inventory",
        verification.inventoryMatches,
        "Installed package bytes match the expected release manifest.",
        `Reinstall the target package; differences: ${JSON.stringify(verification.details)}`
      );
      lifecycleCheck(
        checks,
        "post-upgrade-required-files",
        verification.requiredFilesPresent,
        "All required Skill files remain available after upgrade.",
        `Restore required files: ${verification.details.requiredMissing.join(", ")}`
      );
      lifecycleCheck(
        checks,
        "post-upgrade-interface-versions",
        verification.interfacesMatch,
        "Installed interfaces match the target contracts.",
        "Reinstall a package with the expected interface contracts."
      );
      lifecycleCheck(
        checks,
        "post-upgrade-runtime-dependencies",
        verification.dependencyPolicyPreserved,
        "The upgrade preserved the zero-dependency runtime policy.",
        "Remove undeclared runtime dependencies from the installed Skill."
      );
    }

    if (
      request.project &&
      ["install", "upgrade", "verify-upgrade"].includes(request.operation)
    ) {
      projectCheck = inspectUpgradeProject(request.project, catalogs);
      lifecycleCheck(
        checks,
        "project-manifest-compatible",
        projectCheck.manifest_compatible,
        "Project state is absent or compatible with the installed Skill.",
        projectCheck.limitations.join(" ") ||
          "Repair or migrate the project manifest before continuing."
      );
      if (request.operation === "verify-upgrade") {
        lifecycleCheck(
          checks,
          "project-state-preserved",
          request.previous_project_manifest_sha256 != null &&
            request.previous_project_manifest_sha256 ===
              projectCheck.manifest_sha256,
          "Project-owned state was preserved byte-for-byte during upgrade.",
          request.previous_project_manifest_sha256 == null
            ? "Provide the pre-upgrade project manifest SHA-256 snapshot."
            : "Restore or explicitly migrate the changed project manifest."
        );
      }
      if (projectCheck.next_route === "first-run") {
        nextActions.push(
          "Run `node scripts/zipzap.mjs first-run` for this project."
        );
      } else if (projectCheck.next_route === "onboard") {
        nextActions.push(
          "Run `node scripts/zipzap.mjs onboard` to review and store visible core preferences."
        );
      } else if (projectCheck.next_route === "initialize-refresh") {
        nextActions.push(
          "Review the reported source changes, then run `initialize` with action `refresh` after authorization."
        );
      }
    }

    if (request.operation === "rollback") {
      const targetKnown = Boolean(
        knownRelease(lifecycle, request.target_version)
      );
      lifecycleCheck(
        checks,
        "rollback-target-known",
        targetKnown,
        "The rollback target is registered.",
        "Rollback only to a registered release."
      );
      lifecycleCheck(
        checks,
        "version-direction",
        compareSemver(request.target_version, request.installed_version) < 0,
        "The rollback target is older than the installed version.",
        "Rollback requires an older target version."
      );
      lifecycleCheck(
        checks,
        "backup-available",
        request.backup_available === true,
        "A recoverable installation backup is available.",
        "Create or locate a recoverable installation backup."
      );
      lifecycleCheck(
        checks,
        "project-state-preserved",
        request.project_state_preserved === true,
        "Project registration remains outside the installed Skill.",
        "Preserve .zipzap/project.json and project-owned state."
      );
    }
  }

  if (request.operation === "install" && !request.project) {
    nextActions.push(
      "Run `node scripts/zipzap.mjs first-run` when initializing a project."
    );
  }
  if (request.operation === "upgrade") {
    nextActions.push(
      "After installer-managed mutation, run lifecycle operation `verify-upgrade` with the expected release manifest."
    );
  }
  if (request.operation === "verify-upgrade" && !request.project) {
    nextActions.push(
      "Verify each active project's manifest snapshot, source status, and onboarding completeness separately."
    );
  }

  for (const check of checks) {
    if (!check.passed) requiredActions.push(check.message);
  }
  const allowed = checks.every((check) => check.passed);
  return {
    schema_version: 1,
    operation: request.operation,
    status: allowed ? "ready" : "blocked",
    allowed,
    release_manifest: releaseManifest,
    checks,
    required_actions: unique(requiredActions),
    migration_plan: migrationPlan,
    project_check: projectCheck,
    next_actions: unique(nextActions)
  };
}

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === "-h" || args[0] === "--help") {
    return { command: null, help: true };
  }
  if (args[0] === "help") {
    args.shift();
    return { command: args.shift() ?? null, help: true };
  }
  const command = args.shift() ?? null;
  let inputPath = null;
  let rootDir = DEFAULT_ROOT;
  let pretty = true;
  let kind = null;
  let id = null;
  let section = null;
  let operation = null;
  let action = null;
  let help = command == null;
  let example = false;
  while (args.length) {
    const flag = args.shift();
    if (flag === "--input") inputPath = optionValue(args, flag);
    else if (flag === "--root") rootDir = path.resolve(optionValue(args, flag));
    else if (flag === "--kind") kind = optionValue(args, flag);
    else if (flag === "--id") id = optionValue(args, flag);
    else if (flag === "--section") section = optionValue(args, flag);
    else if (flag === "--operation") operation = optionValue(args, flag);
    else if (flag === "--action") action = optionValue(args, flag);
    else if (flag === "-h" || flag === "--help") help = true;
    else if (flag === "--example") example = true;
    else if (flag === "--compact") pretty = false;
    else {
      throw new CliUsageError(
        "unknown-argument",
        `Unknown argument for ${command}: ${flag}`,
        `Run \`node scripts/zipzap.mjs ${command} --help\` to see supported options.`
      );
    }
  }
  return {
    command,
    inputPath,
    rootDir,
    pretty,
    kind,
    id,
    section,
    operation,
    action,
    help,
    example
  };
}

function readInput(inputPath, command) {
  if (inputPath) {
    const resolved = path.resolve(inputPath);
    let text;
    try {
      text = fs.readFileSync(resolved, "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new CliUsageError(
          "input-file-not-found",
          `Input file does not exist: ${inputPath}`,
          `Create the file from \`node scripts/zipzap.mjs ${command} --example\` or correct the path.`
        );
      }
      throw error;
    }
    return parseInputJson(text, inputPath, command);
  }
  if (!process.stdin.isTTY) {
    return parseInputJson(fs.readFileSync(0, "utf8"), "stdin", command);
  }
  throw new CliUsageError(
    "input-required",
    `Command ${command} requires JSON input.`,
    `Use --input <file>, pipe JSON on stdin, or run \`node scripts/zipzap.mjs ${command} --example\`.`
  );
}

function outputForCommand(command, result) {
  if (command === "compose") return result;
  if (command === "resolve") return result.preset_resolution;
  if (command === "bind") {
    return {
      preset_resolution: result.preset_resolution,
      team_binding: result.team_binding
    };
  }
  if (command === "project") {
    return {
      runtime_projection: result.runtime_projection,
      projection_manifest: result.projection_manifest
    };
  }
  if (command === "reconcile") return result.reconciliation_result;
  throw new Error(`unknown command: ${command}`);
}

async function main() {
  const {
    command,
    inputPath,
    rootDir,
    pretty,
    kind,
    id,
    section,
    operation,
    action,
    help,
    example
  } = parseArgs(process.argv.slice(2));
  if (help) {
    process.stdout.write(command ? commandHelp(command) : globalHelp());
    return;
  }
  if (!ZIPZAP_COMMANDS[command]) {
    throw new CliUsageError(
      "unknown-command",
      `Unknown ZipZap command: ${command}`,
      "Run `node scripts/zipzap.mjs --help` to list available commands."
    );
  }
  if (example) {
    const examplePath = ZIPZAP_COMMANDS[command].example;
    if (!examplePath) {
      throw new CliUsageError(
        "example-unavailable",
        `Command ${command} does not have a standalone input example.`,
        `Run \`node scripts/zipzap.mjs ${command} --help\` for its input schema and options.`
      );
    }
    const result = readJson(path.join(rootDir, examplePath));
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  const catalogs = loadCatalogs(rootDir);
  if (command === "validate") {
    const validation = validateCatalogs(catalogs);
    process.stdout.write(
      `${JSON.stringify(validation, null, pretty ? 2 : 0)}\n`
    );
    process.exitCode = validation.valid ? 0 : 1;
    return;
  }
  if (command === "catalog") {
    if (!kind) {
      throw new CliUsageError(
        "missing-option",
        "Command catalog requires --kind <kind>.",
        "Run `node scripts/zipzap.mjs catalog --help` for command usage."
      );
    }
    process.stdout.write(
      `${JSON.stringify(queryCatalog(catalogs, kind, id, section), null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "release-plan") {
    const result = assessLifecycle(
      {
        schema_version: 1,
        operation: "build-release"
      },
      catalogs
    );
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  const input = readInput(inputPath, command);
  if (command === "initialize") {
    const result = initializeProject(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "first-run") {
    const result = runFirstRun(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "onboard") {
    const result = advanceOnboarding(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "source-resolve") {
    const result = resolveSources(input);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "document-route") {
    const result = resolveDocumentRoute(input);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "rule-health") {
    let result;
    if (input.operation === "diagnose") {
      result = diagnoseRuleHealth(input);
    } else if (input.operation === "list-ignored") {
      result = {
        schema_version: 1,
        status: "completed",
        ignored: listIgnoredRuleFindings(input)
      };
    } else {
      result = applyRuleHealthDisposition({
        ...input,
        zipzap_version: catalogs.lifecycle.skill.current_version
      });
    }
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "invoke") {
    const result = invokeL5(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "task-prepare") {
    const result = prepareTaskAssessment(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "task-adapt") {
    const result = adaptTask(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "install-check") {
    const result = assessLifecycle(
      {
        schema_version: 1,
        operation: "install",
        target_version: catalogs.lifecycle.skill.current_version,
        host_conformance: input
      },
      catalogs
    );
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "lifecycle") {
    const result = assessLifecycle(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "normalize-risk") {
    const result = normalizeRiskAssessment(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "conform") {
    if (!operation) {
      throw new CliUsageError(
        "missing-option",
        "Command conform requires --operation <operation>.",
        "Run `node scripts/zipzap.mjs conform --help` for command usage."
      );
    }
    const result = assessHost(input, operation, action, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  if (command === "evaluate") {
    const result = evaluateKernel(input, catalogs);
    process.stdout.write(
      `${JSON.stringify(result, null, pretty ? 2 : 0)}\n`
    );
    return;
  }
  const diagnosticCommands = new Set([
    "compose",
    "resolve",
    "bind",
    "project",
    "reconcile"
  ]);
  if (!diagnosticCommands.has(command)) {
    throw new Error(`unknown command: ${command}`);
  }
  validateKernelRequest(input);
  const result = compose(kernelToRuntimeInput(input), catalogs);
  process.stdout.write(
    `${JSON.stringify(outputForCommand(command, result), null, pretty ? 2 : 0)}\n`
  );
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  main().catch((error) => {
    const command = process.argv[2]?.startsWith("-")
      ? null
      : process.argv[2] === "help"
        ? process.argv[3] ?? null
        : process.argv[2] ?? null;
    process.stderr.write(
      `${JSON.stringify(structuredCliError(error, command), null, 2)}\n`
    );
    process.exitCode = 1;
  });
}
