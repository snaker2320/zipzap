import assert from "node:assert/strict";
import test from "node:test";

import {
  loadModuleCatalog,
  validateModuleCatalog
} from "../scripts/lib/module-catalog.mjs";

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
