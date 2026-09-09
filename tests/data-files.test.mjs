import assert from "node:assert/strict";
import test from "node:test";

import { canonicalData, parseData } from "../scripts/lib/data-files.mjs";

test("strict YML input is JSON-compatible and canonical", () => {
  const value = parseData("b: 2\na: 1\n", "input.yml");
  assert.deepEqual(value, { b: 2, a: 1 });
  assert.equal(canonicalData(value), '{"a":1,"b":2}');
});

test("strict YML rejects duplicate keys and alias expansion", () => {
  assert.throws(() => parseData("a: 1\na: 2\n", "duplicate.yml"), /Map keys must be unique/);
  const aliases = `root: &root [1, 2]\n${Array.from({ length: 40 }, (_, index) => `a${index}: *root`).join("\n")}\n`;
  assert.throws(() => parseData(aliases, "aliases.yml"), /Excessive alias count/);
});
