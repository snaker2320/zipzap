import crypto from "node:crypto";

import { matchCapabilityProfiles } from "./capability-profiles.mjs";

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

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

export function buildExecutionSpec(input) {
  const work = input.work ?? {};
  const participant = input.participant ?? {};
  const sourcesById = Object.fromEntries(
    (input.sources ?? []).map((source) => [source.id, source])
  );
  const matches = matchCapabilityProfiles(input.profiles ?? [], {
    explicit: work.capabilities ?? [],
    role: participant.role,
    stage: participant.stage,
    action: work.action,
    components: work.components ?? [],
    files: work.files ?? [],
    risk_flags: input.governance?.risk_flags ?? []
  });
  const assessments = input.assessments ?? {};
  const overlays = input.overlays ?? {};
  const limitations = [];
  const unresolved = [];
  const moduleIds = [];
  const facts = [];
  const sourceRefs = new Map();
  const selectedProfiles = [];

  for (const storedProfile of matches.selected) {
    const assessment = assessments[storedProfile.id] ?? { status: "current" };
    const profile = overlays[storedProfile.id] ?? storedProfile;
    selectedProfiles.push({
      id: profile.id,
      revision: profile.revision,
      profile_digest: profile.profile_digest,
      source_status: assessment.status,
      ephemeral: overlays[storedProfile.id] != null
    });
    moduleIds.push(...(profile.module_ids ?? []));
    if (assessment.status === "missing-source" || assessment.status === "invalid") {
      unresolved.push(
        `${profile.id} is ${assessment.status}; explicit Refresh or source repair is required`
      );
      continue;
    }
    if (assessment.status === "stale") {
      limitations.push(
        `${profile.id} was rebuilt ephemerally from current sources; explicit Refresh is recommended`
      );
    }
    if (assessment.status !== "stale" || overlays[storedProfile.id]) {
      facts.push(...profile.facts.map((fact) => structuredClone(fact)));
    }
    const requiredRefs = [
      ...profile.source_refs.map((sourceRef) => structuredClone(sourceRef)),
      ...profile.facts.map((fact) => ({ source_id: fact.source_id }))
    ];
    for (const sourceRef of requiredRefs) {
      const source = sourcesById[sourceRef.source_id];
      if (!source) {
        unresolved.push(
          `${profile.id} requires missing source ${sourceRef.source_id}`
        );
        continue;
      }
      const prior = sourceRefs.get(sourceRef.source_id) ?? {};
      sourceRefs.set(sourceRef.source_id, {
        source_id: sourceRef.source_id,
        locator: source.locator,
        version: source.version ?? null,
        ...prior,
        ...sourceRef
      });
    }
    if (
      profile.context_budget &&
      (profile.facts.length > profile.context_budget.max_facts ||
        profile.source_refs.length > profile.context_budget.max_source_refs)
    ) {
      unresolved.push(`${profile.id} exceeds its declared context budget`);
    }
  }

  const spec = {
    schema_version: 1,
    objective: String(work.objective ?? ""),
    scope: [...(work.scope ?? [])],
    requested_action: String(work.action ?? "execute"),
    affected_components: uniqueSorted(work.components ?? []),
    affected_files: uniqueSorted(work.files ?? []),
    participant: structuredClone(participant),
    module_ids: uniqueSorted(moduleIds),
    capability_profile_ids: selectedProfiles.map((profile) => profile.id).sort(),
    capability_profiles: selectedProfiles.sort((left, right) =>
      left.id.localeCompare(right.id)
    ),
    facts: facts.sort(
      (left, right) =>
        left.key.localeCompare(right.key) ||
        left.source_id.localeCompare(right.source_id)
    ),
    source_refs: [...sourceRefs.values()].sort((left, right) =>
      left.source_id.localeCompare(right.source_id)
    ),
    governance: {
      risk_flags: uniqueSorted(input.governance?.risk_flags ?? []),
      required_gates: uniqueSorted(input.governance?.required_gates ?? []),
      required_evidence: uniqueSorted(
        input.governance?.required_evidence ?? []
      ),
      authority_boundaries: [...(input.governance?.authority_boundaries ?? [])],
      assurance: input.governance?.assurance ?? null
    },
    budget: structuredClone(input.budget ?? null),
    revisions: structuredClone(input.revisions ?? {}),
    limitations: uniqueSorted(limitations),
    unresolved: uniqueSorted(unresolved)
  };
  spec.spec_digest = digest(canonical(spec));
  return spec;
}
