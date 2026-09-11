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
  assert.equal(output.collaboration.selected_mode, "solo");
  assert.equal(output.collaboration.decision_required, false);
});

test("CLI exposes delivery planning without executing project commands", () => {
  const output = JSON.parse(
    execute(["delivery", "--action", "plan", "--input", "examples/zipzap/delivery.yml", "--compact"])
  );
  assert.equal(output.operation, "plan");
  assert.equal(output.allowed, true);
  assert.equal(output.environment.kind, "development");
});
