import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function walk(directory, result = []) {
  if (!fs.existsSync(directory)) return result;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const locator = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(locator, result);
    else if (entry.isFile()) result.push(locator);
  }
  return result;
}

function fingerprint(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
}

export function previewLegacyCleanup(projectRoot) {
  const root = path.resolve(projectRoot);
  const stateRoot = path.join(root, ".zipzap");
  const files = walk(stateRoot).map((locator) => ({
    locator: path.relative(root, locator).split(path.sep).join("/"),
    bytes: fs.statSync(locator).size
  })).sort((left, right) => left.locator.localeCompare(right.locator));
  const preview = {
    schema_version: 1,
    target: ".zipzap/",
    present: fs.existsSync(stateRoot),
    file_count: files.length,
    total_bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    files,
    recoverable: false,
    reason: "Task-bound project state is obsolete; Git Checkpoint and user-cache loop state replace it."
  };
  preview.preview_fingerprint = fingerprint(preview);
  return preview;
}

export function applyLegacyCleanup(input) {
  const preview = previewLegacyCleanup(input.project.locator);
  if (input.confirmation?.preview_fingerprint !== preview.preview_fingerprint) {
    throw new Error("legacy cleanup requires the current preview_fingerprint");
  }
  if (preview.present) {
    fs.rmSync(path.join(path.resolve(input.project.locator), ".zipzap"), {
      recursive: true,
      force: false
    });
  }
  return { ...preview, deleted: preview.present };
}
