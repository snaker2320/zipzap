import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FINGERPRINT_PATTERN = /^sha256:[a-f0-9]{64}$/;
const SEMANTIC_CATEGORIES = [
  "semantic-duplicate",
  "semantic-conflict",
  "unclear-precedence",
  "mixed-responsibilities",
  "project-structure-mismatch",
  "missing-applicability",
  "likely-superseded",
  "duplicated-business-rule",
  "excessive-design-sources",
  "whole-document-reference",
  "archived-design-authority"
];

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

function projectRoot(input) {
  if (!input?.project?.locator) {
    throw new Error("rule health requires project.locator");
  }
  const root = path.resolve(input.project.locator);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`project locator is not an available directory: ${root}`);
  }
  return root;
}

function projectPath(root, locator) {
  const resolved = path.resolve(root, locator);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`source locator escapes project root: ${locator}`);
  }
  return resolved;
}

function sourceRef(source, evidence = null) {
  return {
    source_id: source.id,
    locator: source.locator,
    version: source.version ?? null,
    ...(evidence ? { evidence } : {})
  };
}

function finding(category, severity, confidence, sources, impact, recommendation, evidenceIds = []) {
  const sourceRefs = sources.map((source) => sourceRef(source));
  const identity = {
    category,
    source_ids: sourceRefs.map((item) => item.source_id).sort(),
    evidence_ids: [...evidenceIds].sort(),
    source_versions: sourceRefs
      .map((item) => [item.source_id, item.version])
      .sort(([left], [right]) => left.localeCompare(right))
  };
  return {
    fingerprint: digest(canonical(identity)),
    category,
    severity,
    confidence,
    source_refs: sourceRefs,
    evidence: evidenceIds,
    impact,
    recommendation,
    migration_proposal: null,
    disposition: "open"
  };
}

function contentHash(filePath) {
  return `sha256:${crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex")}`;
}

function ignoreDirectory(root) {
  return path.join(root, ".zipzap", "rule-health", "ignores");
}

function ignorePath(root, fingerprint) {
  if (!FINGERPRINT_PATTERN.test(fingerprint ?? "")) {
    throw new Error("rule health fingerprint is invalid");
  }
  return path.join(ignoreDirectory(root), `${fingerprint.slice(7)}.json`);
}

export function listIgnoredRuleFindings(input) {
  const root = projectRoot(input);
  const directory = ignoreDirectory(root);
  if (!fs.existsSync(directory)) return [];
  return fs
    .readdirSync(directory)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), "utf8")));
}

function duplicateLocatorFindings(sources) {
  const groups = new Map();
  for (const source of sources) {
    const locator = source.locator.replaceAll("\\", "/");
    if (!groups.has(locator)) groups.set(locator, []);
    groups.get(locator).push(source);
  }
  return [...groups.values()]
    .filter((group) => group.length > 1)
    .map((group) =>
      finding(
        "duplicate-locator",
        "high",
        "high",
        group,
        "Multiple source IDs govern the same locator.",
        "Keep one registration or assign distinct authoritative locators.",
        [group[0].locator]
      )
    );
}

function availabilityFindings(root, sources) {
  const findings = [];
  for (const source of sources) {
    if (
      source.format === "external" ||
      source.loading === "external-resource" ||
      /^[a-z][a-z0-9+.-]*:\/\//i.test(source.locator)
    ) {
      continue;
    }
    const filePath = projectPath(root, source.locator);
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      findings.push(
        finding(
          "unavailable-source",
          "high",
          "high",
          [source],
          "A registered governing source is unavailable.",
          "Restore the source, update its locator, or remove the registration."
        )
      );
      continue;
    }
    const actual = contentHash(filePath);
    if (source.version != null && source.version !== actual) {
      findings.push(
        finding(
          "source-version-mismatch",
          "medium",
          "high",
          [source],
          "Registered source metadata does not match current content.",
          "Review the change and refresh the registered source version.",
          [actual]
        )
      );
    }
  }
  return findings;
}

function metadataFindings(sources) {
  return sources
    .filter((source) => !source.owner || !source.authority)
    .map((source) =>
      finding(
        "missing-source-metadata",
        "advisory",
        "high",
        [source],
        "Ownership or authority is not explicit for this source.",
        "Record the accountable owner and authority when known.",
        [!source.owner ? "owner" : "", !source.authority ? "authority" : ""].filter(Boolean)
      )
    );
}

function selectorFindings(sources, selectorCatalog = {}) {
  const findings = [];
  for (const source of sources) {
    for (const [selector, values] of Object.entries(source.selectors ?? {})) {
      const known = selectorCatalog[selector];
      if (!Array.isArray(known)) continue;
      const invalid = values.filter((value) => !known.includes(value));
      if (invalid.length === 0) continue;
      findings.push(
        finding(
          "invalid-selector",
          "high",
          "high",
          [source],
          `The ${selector} selector references unsupported values.`,
          "Replace or remove selector values that are not in the project catalog.",
          invalid
        )
      );
    }
  }
  return findings;
}

function coverageFindings(sources, requiredTopics = []) {
  const covered = new Set(sources.flatMap((source) => source.topics ?? []));
  return requiredTopics
    .filter((topic) => !covered.has(topic))
    .map((topic) =>
      finding(
        "missing-topic-coverage",
        "medium",
        "high",
        [],
        `No registered source covers required topic ${topic}.`,
        "Register an authoritative source or disclose the limitation.",
        [topic]
      )
    );
}

function routeFindings(sources, routing) {
  if (!routing?.routes?.length) return [];
  const findings = [];
  for (const source of sources) {
    if (!source.document_kind || /^https?:\/\//i.test(source.locator)) continue;
    const routes = routing.routes
      .filter((route) => route.document_kinds?.includes(source.document_kind))
      .sort(
        (left, right) =>
          (right.priority ?? 0) - (left.priority ?? 0) ||
          left.id.localeCompare(right.id)
      );
    if (routes.length === 0) continue;
    const highest = routes[0].priority ?? 0;
    const targets = new Set(
      routes
        .filter((route) => (route.priority ?? 0) === highest)
        .map((route) => route.target.replaceAll("\\", "/").replace(/\/$/, ""))
    );
    if (targets.size !== 1) continue;
    const [target] = targets;
    const directory = path.posix.dirname(source.locator.replaceAll("\\", "/"));
    if (directory === target) continue;
    const result = finding(
      "document-route-mismatch",
      "low",
      "high",
      [source],
      "The document is outside its confirmed route.",
      "Keep the existing location or approve a migration to the configured target.",
      [target]
    );
    result.migration_proposal = {
      current_path: source.locator,
      proposed_path: `${target}/${path.posix.basename(source.locator)}`,
      reason: "The registered document route targets another directory."
    };
    findings.push(result);
  }
  return findings;
}

function candidateFindings(root, sources, maxInstructionLines = 400) {
  const findings = [];
  for (const source of sources) {
    const topicRoots = new Set(
      (source.topics ?? []).map((topic) => topic.split("-")[0])
    );
    if (topicRoots.size >= 4) {
      findings.push(
        finding(
          "unrelated-topic-concentration",
          "advisory",
          "medium",
          [source],
          "One source governs many unrelated topic families.",
          "Review whether the source should be split by cohesive responsibility."
        )
      );
    }
    if (source.kind !== "instructions") continue;
    const filePath = projectPath(root, source.locator);
    if (!fs.existsSync(filePath)) continue;
    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).length;
    if (lines <= maxInstructionLines) continue;
    findings.push(
      finding(
        "broad-instructions-candidate",
        "advisory",
        "high",
        [source],
        "A host-managed instruction file is large enough to increase context cost.",
        "Review whether detailed rules can remain authoritative in routed documents.",
        [`lines:${lines}`]
      )
    );
  }
  return findings;
}

function semanticReviewRequest(depth, sources, structuralFindings, budgetInput) {
  if (depth === "quick") return null;
  let maxSourceFiles = 8;
  if (depth === "deep") {
    maxSourceFiles = budgetInput?.max_source_files;
    if (
      !Number.isInteger(maxSourceFiles) ||
      maxSourceFiles < 1 ||
      maxSourceFiles > 100
    ) {
      throw new Error("deep rule health requires semantic_budget.max_source_files from 1 to 100");
    }
  } else if (budgetInput?.max_source_files != null) {
    if (
      !Number.isInteger(budgetInput.max_source_files) ||
      budgetInput.max_source_files < 1 ||
      budgetInput.max_source_files > 100
    ) {
      throw new Error("semantic_budget.max_source_files must be from 1 to 100");
    }
    maxSourceFiles = budgetInput.max_source_files;
  }
  const candidateSourceIds = new Set(
    structuralFindings
      .filter((item) =>
        [
          "broad-instructions-candidate",
          "unrelated-topic-concentration",
          "document-route-mismatch"
        ].includes(item.category)
      )
      .flatMap((item) => item.source_refs.map((ref) => ref.source_id))
  );
  const ordered = [...sources].sort((left, right) => {
    const leftCandidate = candidateSourceIds.has(left.id) ? 1 : 0;
    const rightCandidate = candidateSourceIds.has(right.id) ? 1 : 0;
    return (
      rightCandidate - leftCandidate ||
      (right.priority ?? 0) - (left.priority ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });
  const selected = ordered.slice(0, maxSourceFiles);
  return {
    depth,
    claim_limit: "advisory",
    budget: {
      max_source_files: maxSourceFiles
    },
    categories: [...SEMANTIC_CATEGORIES],
    selected_sources: selected.map((source) => ({
      ...sourceRef(source),
      load_required: true
    })),
    omitted_sources: Math.max(0, ordered.length - selected.length),
    instructions: [
      "Inspect only selected sources and cited heading ranges.",
      "Return advisory Findings with source-bound evidence.",
      "Do not modify, migrate, approve, or persist project content."
    ]
  };
}

function semanticFindings(assessment, request, sources) {
  if (assessment == null) return [];
  if (!request) {
    throw new Error("semantic_assessment requires standard or deep diagnosis");
  }
  if (!Array.isArray(assessment.findings)) {
    throw new Error("semantic_assessment.findings must be an array");
  }
  const candidates = new Set(
    request.selected_sources.map((source) => source.source_id)
  );
  const byId = new Map(sources.map((source) => [source.id, source]));
  return assessment.findings.map((assessed) => {
    if (!SEMANTIC_CATEGORIES.includes(assessed.category)) {
      throw new Error(`unsupported semantic category: ${assessed.category}`);
    }
    if (!["blocker", "high", "medium", "low", "advisory"].includes(assessed.severity)) {
      throw new Error(`invalid semantic severity: ${assessed.severity}`);
    }
    if (!["high", "medium", "low"].includes(assessed.confidence)) {
      throw new Error(`invalid semantic confidence: ${assessed.confidence}`);
    }
    if (!Array.isArray(assessed.source_refs) || assessed.source_refs.length === 0) {
      throw new Error("semantic Finding requires source_refs");
    }
    const refs = assessed.source_refs.map((ref) => {
      if (!candidates.has(ref.source_id) || !byId.has(ref.source_id)) {
        throw new Error(`semantic Finding references non-candidate source: ${ref.source_id}`);
      }
      const source = byId.get(ref.source_id);
      return {
        ...sourceRef(source),
        ...(ref.heading ? { heading: ref.heading } : {})
      };
    });
    if (!Array.isArray(assessed.evidence) || assessed.evidence.length === 0) {
      throw new Error("semantic Finding requires evidence");
    }
    const evidenceIds = assessed.evidence.map((evidence) => {
      if (!evidence?.id || !candidates.has(evidence.source_id)) {
        throw new Error(`semantic evidence references non-candidate source: ${evidence?.source_id}`);
      }
      return `${evidence.source_id}:${evidence.id}:${evidence.heading ?? ""}`;
    });
    if (!assessed.impact || !assessed.recommendation) {
      throw new Error("semantic Finding requires impact and recommendation");
    }
    const identity = {
      category: assessed.category,
      source_ids: refs.map((ref) => ref.source_id).sort(),
      evidence_ids: [...evidenceIds].sort(),
      source_versions: refs
        .map((ref) => [ref.source_id, ref.version])
        .sort(([left], [right]) => left.localeCompare(right))
    };
    return {
      fingerprint: digest(canonical(identity)),
      category: assessed.category,
      severity: assessed.severity,
      confidence: assessed.confidence,
      source_refs: refs,
      evidence: structuredClone(assessed.evidence),
      impact: assessed.impact,
      recommendation: assessed.recommendation,
      migration_proposal: assessed.migration_proposal ?? null,
      disposition: "open"
    };
  });
}

export function diagnoseRuleHealth(input) {
  if (input?.schema_version !== 1 || input.operation !== "diagnose") {
    throw new Error("rule health diagnose requires schema_version 1 and operation diagnose");
  }
  const depth = input.depth ?? "quick";
  if (!["quick", "standard", "deep"].includes(depth)) {
    throw new Error(`unsupported rule health depth: ${depth}`);
  }
  const root = projectRoot(input);
  const sources = input.manifest?.sources;
  if (!Array.isArray(sources)) {
    throw new Error("rule health diagnosis requires manifest.sources");
  }
  const structuralFindings = [
    ...duplicateLocatorFindings(sources),
    ...availabilityFindings(root, sources),
    ...metadataFindings(sources),
    ...selectorFindings(sources, input.selector_catalog),
    ...coverageFindings(sources, input.required_topics),
    ...routeFindings(sources, input.manifest.document_routing),
    ...candidateFindings(root, sources, input.max_instruction_lines)
  ];
  const semanticRequest = semanticReviewRequest(
    depth,
    sources,
    structuralFindings,
    input.semantic_budget
  );
  const openFindings = [
    ...structuralFindings,
    ...semanticFindings(input.semantic_assessment, semanticRequest, sources)
  ].sort(
    (left, right) =>
      left.category.localeCompare(right.category) ||
      left.fingerprint.localeCompare(right.fingerprint)
  );
  const ignored = new Set(
    listIgnoredRuleFindings({ project: input.project }).map(
      (record) => record.fingerprint
    )
  );
  const ignoredCount = openFindings.filter((item) =>
    ignored.has(item.fingerprint)
  ).length;
  const findings = openFindings
    .filter((item) => input.include_ignored || !ignored.has(item.fingerprint))
    .map((item) =>
      ignored.has(item.fingerprint)
        ? { ...item, disposition: "ignored" }
        : item
    );
  return {
    schema_version: 1,
    status: "completed",
    depth,
    findings,
    ignored_count: ignoredCount,
    semantic_review_request: semanticRequest,
    limitations: []
  };
}

export function applyRuleHealthDisposition(input) {
  if (input?.schema_version !== 1) {
    throw new Error("rule health disposition schema_version must be 1");
  }
  const root = projectRoot(input);
  if (input.operation === "ignore") {
    const current = input.finding;
    if (!current || !FINGERPRINT_PATTERN.test(current.fingerprint ?? "")) {
      throw new Error("ignore requires a valid finding");
    }
    const directory = ignoreDirectory(root);
    fs.mkdirSync(directory, { recursive: true });
    const locator = ignorePath(root, current.fingerprint);
    const record = {
      schema_version: 1,
      fingerprint: current.fingerprint,
      category: current.category,
      source_ids: current.source_refs.map((item) => item.source_id),
      source_versions: Object.fromEntries(
        current.source_refs.map((item) => [item.source_id, item.version])
      ),
      actor: input.actor,
      ignored_at: input.timestamp ?? new Date().toISOString(),
      ...(input.reason ? { reason: input.reason } : {}),
      zipzap_version: input.zipzap_version ?? "unknown"
    };
    const temporary = `${locator}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`);
    fs.renameSync(temporary, locator);
    return { schema_version: 1, status: "ignored", locator, record };
  }
  if (input.operation === "restore") {
    const locator = ignorePath(root, input.fingerprint);
    if (fs.existsSync(locator)) fs.unlinkSync(locator);
    return {
      schema_version: 1,
      status: "restored",
      locator,
      fingerprint: input.fingerprint
    };
  }
  throw new Error(`unsupported rule health disposition: ${input.operation}`);
}
