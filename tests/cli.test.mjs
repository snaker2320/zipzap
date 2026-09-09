import assert from "node:assert/strict";
import path from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(".");
const cli = path.join(root, "scripts", "zipzap.mjs");

function execute(args) {
  return execFileSync(process.execPath, [cli, ...args], { cwd: root, encoding: "utf8" });
}

test("CLI validates YML authority and exposes no Task command", () => {
  const validation = JSON.parse(execute(["validate", "--compact"]));
  assert.equal(validation.valid, true);
  const help = execute(["--help"]);
  assert.match(help, /Git-native collaboration/);
  assert.doesNotMatch(help, /task-prepare|task-adapt|Task CLI/);
});

test("CLI accepts YML input and emits JSON", () => {
  const output = JSON.parse(
    execute(["gate", "--input", "examples/zipzap/gate.yml", "--compact"])
  );
  assert.equal(output.allowed, true);
});
