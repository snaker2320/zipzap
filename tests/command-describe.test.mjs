import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { describeCommands } from "../scripts/lib/command-describe.mjs";

const root = path.resolve(".");

test("describe reads only the selected command Schema closure", () => {
  const original = fs.readFileSync;
  const reads = [];
  fs.readFileSync = function instrumentedRead(filePath, ...args) {
    reads.push(path.resolve(filePath));
    return original.call(this, filePath, ...args);
  };
  try {
    const description = describeCommands({
      commands: {
        invoke: {
          summary: "Invoke the stable L5 collaboration interface.",
          usage: "invoke --input <file> [--compact]",
          schema: "schemas/l5-adapter-input.schema.json",
          example: "examples/zipzap/invoke.json"
        }
      },
      subject: "invoke",
      rootDir: root,
      executable: "node scripts/zipzap.mjs",
      filters: { operation: "execute" }
    });
    const schemaReads = reads
      .map((filePath) => path.relative(root, filePath))
      .filter((filePath) => filePath.startsWith("schemas/"));
    assert.equal(description.input_contract.projection, "filtered");
    assert.equal(schemaReads.includes("schemas/l5-adapter-input.schema.json"), true);
    assert.equal(schemaReads.includes("schemas/l5-input.schema.json"), true);
    assert.equal(schemaReads.includes("schemas/task.schema.json"), false);
    assert.equal(schemaReads.length < 20, true);
  } finally {
    fs.readFileSync = original;
  }
});

test("describe explains nested required fields and selects a filtered example", () => {
  const description = describeCommands({
    commands: {
      initialize: {
        summary: "Discover, configure, or refresh project collaboration.",
        usage: "initialize --input <file> [--compact]",
        schema: "schemas/l5-input.schema.json",
        example: "examples/zipzap/initialize.json",
        examples: [
          {
            path: "examples/zipzap/initialize-configure.json",
            filters: { operation: "initialize", action: "configure" }
          }
        ]
      }
    },
    subject: "initialize",
    rootDir: root,
    executable: "node scripts/zipzap.mjs",
    filters: { operation: "initialize", action: "configure" }
  });

  const operation = description.input_contract.fields.find(
    (field) => field.path === "operation"
  );
  const action = description.input_contract.fields.find(
    (field) => field.path === "initialization.action"
  );
  assert.equal(operation.required_scope, "document");
  assert.equal(action.required_scope, "parent-present");
  assert.equal(description.example_source, "examples/zipzap/initialize-configure.json");
  assert.equal(description.example.initialization.action, "configure");
});
