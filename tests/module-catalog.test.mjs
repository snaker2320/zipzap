import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  loadModuleCatalog,
  validateModuleCatalog
} from "../scripts/lib/module-catalog.mjs";
import { queryCatalogAtRoot } from "../scripts/zipzap.mjs";

const root = path.resolve(".");

test("loads role and policy modules through declared locators", () => {
  const catalog = loadModuleCatalog();

  assert.equal(catalog.modules["role:developer"].kind, "role");
  assert.equal(
    catalog.modules["role:developer"].value.purpose,
    "Produce a scoped, project-conforming, verified implementation."
  );
  assert.equal(catalog.modules["policy:runtime"].kind, "policy");
  assert.equal(
    catalog.modules["policy:runtime"].value.event_actions["role-transitioned"],
    "rebuild-projection"
  );
});

test("reuses a shared module source and narrow catalog queries read one file", () => {
  const original = fs.readFileSync;
  const reads = [];
  fs.readFileSync = function instrumentedRead(filePath, ...args) {
    reads.push(path.resolve(filePath));
    return original.call(this, filePath, ...args);
  };
  try {
    loadModuleCatalog(root);
    assert.equal(
      reads.filter((filePath) => filePath.endsWith("/config/roles.json")).length,
      1
    );
    reads.length = 0;
    const capsule = queryCatalogAtRoot(
      root,
      "execution-profiles",
      "design-diagnostic",
      "capsule"
    );
    assert.equal(typeof capsule, "object");
    assert.deepEqual(
      reads.map((filePath) => path.relative(root, filePath)),
      ["config/execution-profiles.json"]
    );
    reads.length = 0;
    const route = queryCatalogAtRoot(root, "intent-routes", "implement");
    assert.equal(route.work_path, "host-direct");
    assert.deepEqual(
      reads.map((filePath) => path.relative(root, filePath)),
      ["config/execution-profiles.json"]
    );
  } finally {
    fs.readFileSync = original;
  }
});

test("rejects authority-bearing capability modules", () => {
  assert.throws(
    () =>
      validateModuleCatalog({
        schema_version: 1,
        modules: {
          "capability:unsafe": {
            kind: "capability",
            value: { authority: { may: ["approve"] } }
          }
        }
      }),
    /capability.*authority/i
  );
});

test("rejects a module id whose prefix disagrees with its kind", () => {
  assert.throws(
    () =>
      validateModuleCatalog({
        schema_version: 1,
        modules: {
          "role:developer": {
            kind: "policy",
            value: {}
          }
        }
      }),
    /module id.*kind/i
  );
});
