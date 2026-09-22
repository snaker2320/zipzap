import assert from "node:assert/strict";
import test from "node:test";

import { projectDecisionPages } from "../scripts/lib/decision-pages.mjs";

test("native decisions are paged at the host maximum and remain atomic", () => {
  const result = projectDecisionPages({
    host: { request_user_input: { callable: true, max_questions: 3 } },
    questions: Array.from({ length: 7 }, (_, index) => ({ id: `q_${index}`, question: `Q${index}` }))
  });
  assert.equal(result.presentation, "native-form");
  assert.equal(result.tool, "request_user_input");
  assert.deepEqual(result.pages.map((page) => page.questions.length), [3, 3, 1]);
  assert.equal(result.atomic, true);
});

test("unavailable native form falls back to stepwise text", () => {
  const result = projectDecisionPages({
    host: { request_user_input: { callable: false } },
    questions: [{ id: "q", question: "Q" }]
  });
  assert.equal(result.presentation, "stepwise-text");
  assert.equal(result.tool, null);
  assert.match(result.fallback, /全部页面完成前不得执行决策/);
});

test("non-Plan sessions select async forms and preserve choices and the pending boundary", () => {
  const questions = [{ id: "scope", question: "Which scope?", options: ["Local", "Shared"] }];
  const result = projectDecisionPages({
    host: {
      request_user_input: { callable: false },
      request_user_input_async: { callable: true }
    },
    questions
  });
  assert.equal(result.presentation, "native-form");
  assert.equal(result.tool, "request_user_input_async");
  assert.equal(result.must_pause, true);
  assert.equal(result.atomic, true);
  assert.equal(result.fallback, null);
  assert.deepEqual(result.pages[0].questions, questions);
});

test("synchronous forms retain precedence when both tools are callable", () => {
  const result = projectDecisionPages({
    host: {
      request_user_input: { callable: true },
      request_user_input_async: { callable: true }
    },
    questions: [{ id: "q", question: "Q" }]
  });
  assert.equal(result.tool, "request_user_input");
});

for (const tool of ["request_user_input", "request_user_input_async"]) {
  test(`${tool} respects a smaller Host limit even with an explicit larger page size`, () => {
    const result = projectDecisionPages({
      host: { [tool]: { callable: true, max_questions: 1 } },
      page_size: 3,
      questions: Array.from({ length: 3 }, (_, index) => ({ id: `q_${index}`, question: `Q${index}` }))
    });
    assert.equal(result.tool, tool);
    assert.equal(result.page_size, 1);
    assert.deepEqual(result.pages.map((page) => page.questions.length), [1, 1, 1]);
  });
}

test("async hosts allowing larger bundles still receive at most three questions per page", () => {
  const result = projectDecisionPages({
    host: { request_user_input_async: { callable: true, max_questions: 10 } },
    questions: Array.from({ length: 4 }, (_, index) => ({ id: `q_${index}`, question: `Q${index}` }))
  });
  assert.deepEqual(result.pages.map((page) => page.questions.length), [3, 1]);
});

test("missing or unavailable capabilities fall back without inventing a decision", () => {
  for (const host of [{}, { request_user_input_async: { callable: false } }]) {
    const result = projectDecisionPages({ host, questions: [{ id: "q", question: "Q" }] });
    assert.equal(result.tool, null);
    assert.equal(result.presentation, "stepwise-text");
    assert.equal(result.must_pause, true);
  }
});

test("no unresolved questions require no pause or pages", () => {
  const result = projectDecisionPages({ host: {}, questions: [] });
  assert.equal(result.must_pause, false);
  assert.deepEqual(result.pages, []);
});
