import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { canonicalData } from "./data-files.mjs";

export function evidenceDigest(value) {
  return `sha256:${crypto.createHash("sha256").update(canonicalData(value)).digest("hex")}`;
}

export function evidenceReferenceExists(reference, projectRoot = process.cwd()) {
  if (!reference?.trim()) return false;
  // Opaque Host references are attestations, not locally verified tool results.
  if (!reference.startsWith("file:")) return true;
  const locator = reference.slice(5);
  return Boolean(locator) && fs.existsSync(path.resolve(projectRoot, locator));
}

export function inspectArtifact(projectRoot, artifact, { current = false } = {}) {
  const run = (...args) => execFileSync("git", args, {
    cwd: projectRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"]
  }).trim();
  try {
    const locator = artifact.locator;
    if (!locator || path.isAbsolute(locator) || locator.split(/[\\/]/).includes("..") || locator.includes(":")) {
      throw new Error("artifact locator must be a repository-relative path");
    }
    if (!/^[a-f0-9]{40}$/.test(artifact.commit_sha)) throw new Error("artifact requires a full commit SHA");
    run("cat-file", "-e", `${artifact.commit_sha}^{commit}`);
    const object = locator === "." ? `${artifact.commit_sha}^{tree}` : `${artifact.commit_sha}:${locator}`;
    const kind = run("cat-file", "-t", object);
    if (!["blob", "tree"].includes(kind)) throw new Error("artifact is not a file or directory");
    const objectId = run("rev-parse", object);
    if (artifact.sha256) {
      const content = execFileSync("git", ["cat-file", kind, object], { cwd: projectRoot, stdio: ["ignore", "pipe", "pipe"] });
      const digest = `sha256:${crypto.createHash("sha256").update(content).digest("hex")}`;
      if (digest !== artifact.sha256) throw new Error("artifact digest mismatch");
    }
    if (current) {
      const headObject = locator === "." ? "HEAD^{tree}" : `HEAD:${locator}`;
      if (run("rev-parse", headObject) !== objectId) throw new Error("artifact differs from HEAD");
      if (run("status", "--porcelain", "--untracked-files=all", "--", locator)) {
        throw new Error("artifact has uncommitted changes");
      }
    }
    return { passed: true, object_id: objectId };
  } catch (error) {
    return { passed: false, reason: error.message.split("\n")[0] };
  }
}
