import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { profileProjectCapabilities } from "../scripts/lib/project-capability-profiler.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(HERE, "fixtures/capabilities");

function factMap(profile) {
  return Object.fromEntries(profile.facts.map((fact) => [fact.key, fact.value]));
}

function source(locator, version = `sha256:${"a".repeat(64)}`) {
  return {
    id: locator === "pom.xml" ? "maven-project" : "gradle-project",
    locator,
    topics: ["coding", "testing"],
    version
  };
}

test("derives Java facts only from a Maven fixture", () => {
  const root = path.join(FIXTURES, "java-maven");
  const [candidate] = profileProjectCapabilities(root, [source("pom.xml")]);

  assert.equal(candidate.id, "java-development");
  assert.deepEqual(factMap(candidate), {
    "build-tool": "maven",
    "java-version": "17"
  });
  assert.deepEqual(
    candidate.facts.map((fact) => fact.source_id),
    ["maven-project", "maven-project"]
  );
});

test("derives the declared Gradle toolchain version", () => {
  const root = path.join(FIXTURES, "java-gradle");
  const [candidate] = profileProjectCapabilities(root, [
    source("build.gradle")
  ]);

  assert.deepEqual(factMap(candidate), {
    "build-tool": "gradle",
    "java-version": "21"
  });
});

test("does not invent a Java version when the project does not declare one", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-java-no-version-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "pom.xml"), "<project />\n");

  const [candidate] = profileProjectCapabilities(root, [source("pom.xml")]);

  assert.deepEqual(factMap(candidate), { "build-tool": "maven" });
});

test("rejects conflicting Maven and Gradle Java declarations", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "zipzap-java-conflict-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(
    path.join(root, "pom.xml"),
    "<project><properties><maven.compiler.release>17</maven.compiler.release></properties></project>\n"
  );
  fs.writeFileSync(
    path.join(root, "build.gradle"),
    "sourceCompatibility = '21'\n"
  );

  assert.throws(
    () =>
      profileProjectCapabilities(root, [
        source("pom.xml"),
        source("build.gradle")
      ]),
    /conflicting Java versions/i
  );
});
