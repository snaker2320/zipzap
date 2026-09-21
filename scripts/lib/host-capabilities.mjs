import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function hostCapabilitiesPath(cacheRoot = null) {
  return path.join(cacheRoot ?? path.join(os.homedir(), ".cache", "zipzap"), "host-capabilities.json");
}

export function defaultHostCapabilities() {
  return {
    schema_version: 1,
    multi_agent: {
      available: false,
      default_allowed: false,
      stable_identity: false,
      handoff_acknowledgement: false
    },
    source: "unknown",
    host_version: null,
    updated_at: null
  };
}

export function readHostCapabilities(cacheRoot = null) {
  const locator = hostCapabilitiesPath(cacheRoot);
  if (!fs.existsSync(locator)) return { locator, profile: defaultHostCapabilities() };
  return { locator, profile: JSON.parse(fs.readFileSync(locator, "utf8")) };
}

export function writeHostCapabilities(mode, { cacheRoot = null, hostVersion = null } = {}) {
  const modes = new Set(["full", "disabled", "unavailable", "unknown"]);
  if (!modes.has(mode)) throw new Error(`unsupported Host multi-Agent mode: ${mode}`);
  const available = mode === "full" || mode === "disabled";
  const identitiesAvailable = available;
  const profile = {
    schema_version: 1,
    multi_agent: {
      available,
      default_allowed: mode === "full",
      stable_identity: identitiesAvailable,
      handoff_acknowledgement: identitiesAvailable
    },
    source: "installer",
    host_version: hostVersion,
    updated_at: new Date().toISOString()
  };
  const locator = hostCapabilitiesPath(cacheRoot);
  fs.mkdirSync(path.dirname(locator), { recursive: true });
  const temporary = `${locator}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(profile)}\n`);
  fs.renameSync(temporary, locator);
  return { locator, profile };
}
