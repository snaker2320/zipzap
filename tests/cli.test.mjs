import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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
  assert.equal(Object.hasOwn(output, "collaboration"), false);
});

test("CLI exposes delivery planning without executing project commands", () => {
  const output = JSON.parse(
    execute(["delivery", "--action", "plan", "--input", "examples/zipzap/delivery.yml", "--compact"])
  );
  assert.equal(output.operation, "plan");
  assert.equal(output.allowed, true);
  assert.equal(output.environment.kind, "development");
});

test("CLI accepts contextual standards routing and explains matches", () => {
  const output = JSON.parse(
    execute(["standards", "--action", "route", "--input", "examples/zipzap/standards-route.yml", "--compact"])
  );
  assert.equal(output.index.mode, "derived");
  assert.equal(output.index.persisted, false);
  assert.ok(output.selected.some((item) =>
    item.matched_by.some((match) => match.dimension === "paths")
  ));
  assert.ok(output.diagnostics.some((item) => item.code === "unmatched-domains"));
  assert.ok(output.diagnostics.some((item) => item.code === "unmatched-artifacts"));
});

test("CLI preserves the existing action risk and path routing contract", (context) => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-legacy-route-"));
  context.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const input = path.join(temporaryRoot, "route.yml");
  fs.writeFileSync(
    input,
    `schema_version: 1\nproject:\n  locator: ${root}\ncontext:\n  action: implement\n  risk: medium\n  paths: [scripts/zipzap.mjs]\n`
  );

  const output = JSON.parse(
    execute(["standards", "--action", "route", "--input", input, "--compact"])
  );
  assert.ok(output.selected.some((item) => item.locator === "standards/engineering/node.md"));
  assert.equal(output.diagnostics.some((item) => item.code === "unmatched-domains"), false);
  assert.equal(output.diagnostics.some((item) => item.code === "unmatched-artifacts"), false);
});
