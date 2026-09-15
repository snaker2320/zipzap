import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyLegacyCleanup,
  previewLegacyCleanup
} from "../scripts/lib/legacy-cleanup.mjs";
import { assessLifecycle } from "../scripts/zipzap.mjs";

test("upgrade reports exact obsolete state and cleanup requires its fingerprint", (context) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-legacy-"));
  context.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, ".zipzap", "tasks"), { recursive: true });
  fs.writeFileSync(path.join(root, ".zipzap", "tasks", "one.json"), "{}\n");
  const lifecycle = assessLifecycle({
    schema_version: 1,
    operation: "upgrade",
    installed_version: "0.1.1-beta.7",
    target_version: "0.2.0-beta.2",
    host_conformance: { compatible: true },
    project: { locator: root }
  });
  const legacyCheck = lifecycle.checks.find((item) => item.id === "legacy-task-state");
  assert.equal(lifecycle.allowed, false);
  assert.equal(legacyCheck.details.file_count, 1);
  assert.equal(legacyCheck.details.total_bytes, 3);
  assert.throws(
    () => applyLegacyCleanup({ project: { locator: root }, confirmation: { preview_fingerprint: "sha256:dead" } }),
    /current preview_fingerprint/
  );
  const preview = previewLegacyCleanup(root);
  const result = applyLegacyCleanup({
    project: { locator: root },
    confirmation: { preview_fingerprint: preview.preview_fingerprint }
  });
  assert.equal(result.deleted, true);
  assert.equal(fs.existsSync(path.join(root, ".zipzap")), false);
});
