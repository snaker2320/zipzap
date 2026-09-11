import fs from "node:fs";
import path from "node:path";

const SLOT_BY_NAME = new Map([
  ["build", "build.execute"],
  ["verify-artifact", "build.verify-artifact"],
  ["artifact-verify", "build.verify-artifact"],
  ["predeploy", "deploy.precheck"],
  ["deploy-precheck", "deploy.precheck"],
  ["deploy", "deploy.apply"],
  ["start", "deploy.apply"],
  ["dev", "deploy.apply"],
  ["probe", "deploy.probe"],
  ["health", "deploy.probe"],
  ["healthcheck", "deploy.probe"],
  ["smoke", "deploy.smoke"],
  ["test-smoke", "deploy.smoke"],
  ["diagnose", "deploy.diagnose"],
  ["logs", "deploy.diagnose"],
  ["rollback", "deploy.rollback"],
  ["stop", "deploy.rollback"]
]);

function projectRoot(input) {
  const locator = input.project?.locator;
  if (!locator) throw new Error("delivery requires a project locator");
  const root = path.resolve(locator);
  if (!fs.existsSync(root)) throw new Error(`delivery project is unavailable: ${root}`);
  return root;
}

function packageRunner(root) {
  if (fs.existsSync(path.join(root, "pnpm-lock.yaml"))) return "pnpm";
  if (fs.existsSync(path.join(root, "yarn.lock"))) return "yarn";
  return "npm run";
}

function packageCommand(runner, name) {
  return runner === "npm run" ? `${runner} ${name}` : `${runner} ${name}`;
}

function normalizedName(value) {
  return value
    .toLowerCase()
    .replace(/\.(?:sh|mjs|js|cjs|py)$/, "")
    .replace(/[:_.]+/g, "-");
}

function slotForName(name) {
  const normalized = normalizedName(name);
  if (SLOT_BY_NAME.has(normalized)) return SLOT_BY_NAME.get(normalized);
  for (const [candidate, slot] of SLOT_BY_NAME) {
    if (normalized.endsWith(`-${candidate}`)) return slot;
  }
  return null;
}

function candidateCommand(locator) {
  if (locator.endsWith(".sh")) return `bash ${locator}`;
  if (/\.(?:mjs|js|cjs)$/.test(locator)) return `node ${locator}`;
  if (locator.endsWith(".py")) return `python3 ${locator}`;
  return `./${locator}`;
}

function addCandidate(result, candidate) {
  if (!candidate.slot) return;
  const duplicate = result.some(
    (item) => item.slot === candidate.slot && item.command === candidate.command
  );
  if (!duplicate) result.push({ ...candidate, requires_confirmation: true });
}

function discoverPackageScripts(root, result) {
  const locator = path.join(root, "package.json");
  if (!fs.existsSync(locator)) return;
  let metadata;
  try {
    metadata = JSON.parse(fs.readFileSync(locator, "utf8"));
  } catch {
    return;
  }
  const runner = packageRunner(root);
  for (const name of Object.keys(metadata.scripts ?? {}).sort()) {
    const slot = slotForName(name);
    addCandidate(result, {
      slot,
      command: packageCommand(runner, name),
      source: "package.json",
      confidence: ["build", "verify-artifact", "artifact-verify", "probe", "health", "healthcheck", "smoke", "test-smoke", "rollback"].includes(normalizedName(name))
        ? "high"
        : "medium"
    });
  }
}

function discoverNamedScripts(root, result) {
  for (const directory of ["scripts", "bin", "ops"]) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute) || !fs.statSync(absolute).isDirectory()) continue;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const slot = slotForName(entry.name);
      const locator = `${directory}/${entry.name}`;
      addCandidate(result, {
        slot,
        command: candidateCommand(locator),
        source: locator,
        confidence: "medium"
      });
    }
  }
}

function discoverMakeTargets(root, result) {
  const locator = path.join(root, "Makefile");
  if (!fs.existsSync(locator)) return;
  const content = fs.readFileSync(locator, "utf8");
  for (const match of content.matchAll(/^([A-Za-z0-9_.-]+):(?:\s|$)/gm)) {
    const name = match[1];
    addCandidate(result, {
      slot: slotForName(name),
      command: `make ${name}`,
      source: "Makefile",
      confidence: "high"
    });
  }
}

function discoverInfrastructure(root, result) {
  if (fs.existsSync(path.join(root, "devctl"))) {
    for (const [slot, command] of [
      ["deploy.apply", "./devctl start"],
      ["deploy.probe", "./devctl status"],
      ["deploy.diagnose", "./devctl logs"],
      ["deploy.rollback", "./devctl stop"]
    ]) {
      addCandidate(result, {
        slot,
        command,
        source: "devctl",
        confidence: "low"
      });
    }
  }
  const compose = ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"]
    .find((name) => fs.existsSync(path.join(root, name)));
  if (compose) {
    addCandidate(result, {
      slot: "deploy.apply",
      command: `docker compose -f ${compose} up -d`,
      source: compose,
      confidence: "medium"
    });
    addCandidate(result, {
      slot: "deploy.diagnose",
      command: `docker compose -f ${compose} logs --tail 200`,
      source: compose,
      confidence: "medium"
    });
    addCandidate(result, {
      slot: "deploy.rollback",
      command: `docker compose -f ${compose} down`,
      source: compose,
      confidence: "medium"
    });
  }
}

export function discoverDeliveryCandidates(input) {
  const root = projectRoot(input);
  const candidates = [];
  discoverPackageScripts(root, candidates);
  discoverNamedScripts(root, candidates);
  discoverMakeTargets(root, candidates);
  discoverInfrastructure(root, candidates);
  return candidates.sort(
    (left, right) => left.slot.localeCompare(right.slot) || left.command.localeCompare(right.command)
  );
}

function deliveryRequirements(input, catalog) {
  const policy = catalog.environments[input.environment.kind];
  if (!policy) throw new Error(`unsupported delivery environment: ${input.environment.kind}`);
  const requiredMappings = new Set(policy.required_mappings);
  if (input.environment.shared === true) requiredMappings.add("deploy.rollback");
  return {
    requiredMappings: [...requiredMappings],
    requiredEvidence: [...policy.required_evidence],
    recommended: policy.recommended_slots.filter((slot) => !requiredMappings.has(slot))
  };
}

function standardTarget(input, slot) {
  const locator = slot.startsWith("build.")
    ? "standards/engineering/build.md"
    : "standards/delivery/deployment.md";
  return fs.existsSync(path.join(projectRoot(input), locator)) ? locator : null;
}

function issueFor(input, slot, reason, severity = "medium") {
  const target = standardTarget(input, slot);
  const returnStage = slot.startsWith("build.") || slot === "deploy.smoke"
    ? "build"
    : "deploy";
  return {
    fingerprint: `delivery:${slot}:${reason}`,
    checkpoint: input.checkpoint ?? input.artifact?.commit_sha ?? "unbound-delivery",
    title: `${slot} ${reason.replaceAll("-", " ")}`,
    severity,
    status: "open",
    return_stage: returnStage,
    ...(target ? { standard_target: target } : {})
  };
}

export function planDelivery(input, catalog) {
  projectRoot(input);
  const { requiredMappings, requiredEvidence, recommended } = deliveryRequirements(input, catalog);
  const commands = input.commands ?? {};
  const missingRequired = requiredMappings.filter((slot) => !commands[slot]);
  const missingRecommended = recommended.filter((slot) => !commands[slot]);
  const checks = requiredMappings.map((slot) => ({
    id: `mapping:${slot}`,
    passed: Boolean(commands[slot]),
    message: commands[slot]
      ? `${slot} is explicitly mapped.`
      : `${slot} requires a confirmed project command.`
  }));
  const issues = missingRequired.map((slot) => issueFor(input, slot, "mapping-missing"));
  return {
    schema_version: 1,
    operation: "plan",
    status: missingRequired.length ? "blocked" : "ready",
    allowed: missingRequired.length === 0,
    environment: {
      kind: input.environment.kind,
      target: input.environment.target,
      shared: input.environment.shared === true
    },
    required_mappings: requiredMappings,
    required_evidence: requiredEvidence,
    recommended_slots: recommended,
    commands,
    candidates: discoverDeliveryCandidates(input),
    missing_required: missingRequired,
    missing_recommended: missingRecommended,
    checks,
    issues,
    next_actions: missingRequired.length
      ? ["Confirm project-owned commands for every missing required slot."]
      : ["Execute the confirmed commands through the Host, then assess bound evidence."]
  };
}

function evidenceCheck(input, slot, command) {
  const evidence = input.evidence?.[slot];
  const deploySlot = slot.startsWith("deploy.");
  const reasons = [];
  if (!evidence) reasons.push("evidence-missing");
  else {
    if (evidence.status !== "passed") reasons.push(`evidence-${evidence.status}`);
    if (evidence.command !== command.command) reasons.push("command-mismatch");
    if (evidence.artifact_sha256 !== input.artifact?.sha256) reasons.push("artifact-mismatch");
    if (deploySlot && evidence.target !== input.environment.target) reasons.push("target-mismatch");
  }
  return {
    id: `evidence:${slot}`,
    passed: reasons.length === 0,
    message: reasons.length ? `${slot}: ${reasons.join(", ")}` : `${slot} evidence is bound and passed.`,
    reasons
  };
}

function nextAction(check) {
  if (check.id === "artifact") return "Rebuild and verify an immutable artifact identity.";
  if (check.id === "authorization") return "Obtain authorization for the shared or destructive target.";
  if (check.id.includes("build.")) return "Return to Produce, then build a new artifact.";
  if (check.id.includes("deploy.probe")) return "Run bounded readiness retry, then diagnose or roll back.";
  if (check.id.includes("deploy.smoke")) return "Record a problem item, fix it, and restart from Build.";
  if (check.id.includes("deploy.")) return "Diagnose the deployment and roll back when required.";
  return "Resolve the failed delivery check.";
}

export function assessDelivery(input, catalog) {
  const plan = planDelivery(input, catalog);
  const checks = [...plan.checks];
  const artifactPassed = Boolean(input.artifact);
  checks.push({
    id: "artifact",
    passed: artifactPassed,
    message: artifactPassed
      ? "Artifact locator, commit SHA, and SHA-256 are present."
      : "Assessment requires an immutable artifact identity."
  });
  if (plan.allowed) {
    for (const slot of plan.required_evidence) {
      checks.push(evidenceCheck(input, slot, plan.commands[slot]));
    }
  }
  const requiresAuthorization =
    input.environment.shared === true ||
    Object.entries(input.commands ?? {}).some(
      ([slot, command]) => command.destructive === true &&
        input.evidence?.[slot] && input.evidence[slot].status !== "not-run"
    );
  if (requiresAuthorization) {
    const passed = input.authorization?.status === "passed";
    checks.push({
      id: "authorization",
      passed,
      message: passed
        ? "Shared or destructive deployment is authorized."
        : "Shared or destructive deployment requires authorization evidence."
    });
  }
  const failed = checks.filter((check) => !check.passed);
  const issues = [...plan.issues];
  for (const check of failed) {
    if (!check.id.startsWith("evidence:")) continue;
    const slot = check.id.slice("evidence:".length);
    for (const reason of check.reasons) {
      issues.push(issueFor(
        input,
        slot,
        reason,
        input.environment.shared === true && slot.startsWith("deploy.") ? "high" : "medium"
      ));
    }
  }
  return {
    schema_version: 1,
    operation: "assess",
    status: failed.length ? "blocked" : "passed",
    allowed: failed.length === 0,
    environment: plan.environment,
    artifact: input.artifact ?? null,
    required_mappings: plan.required_mappings,
    required_evidence: plan.required_evidence,
    commands: plan.commands,
    checks,
    issues,
    next_actions: [...new Set(failed.map(nextAction))]
  };
}
