import assert from "node:assert/strict";
import test from "node:test";

import { selectReconciliationAction } from "../scripts/lib/loop-controller.mjs";

test("selects the registered deterministic reconciliation action", () => {
  assert.equal(
    selectReconciliationAction("role-transitioned", {
      "role-transitioned": "rebuild-projection"
    }),
    "rebuild-projection"
  );
});

test("rejects an event without a reconciliation action", () => {
  assert.throws(
    () => selectReconciliationAction("unknown", {}),
    /unsupported event/i
  );
});
