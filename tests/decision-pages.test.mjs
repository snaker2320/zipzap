import assert from "node:assert/strict";
import test from "node:test";

import { projectDecisionPages } from "../scripts/lib/decision-pages.mjs";

test("native decisions are paged at the host maximum and remain atomic", () => {
  const result = projectDecisionPages({
    host: { request_user_input: { callable: true, max_questions: 3 } },
    questions: Array.from({ length: 7 }, (_, index) => ({ id: `q_${index}`, question: `Q${index}` }))
  });
  assert.equal(result.presentation, "native-form");
  assert.deepEqual(result.pages.map((page) => page.questions.length), [3, 3, 1]);
  assert.equal(result.atomic, true);
});

test("unavailable native form falls back to stepwise text", () => {
  const result = projectDecisionPages({
    host: { request_user_input: { callable: false } },
    questions: [{ id: "q", question: "Q" }]
  });
  assert.equal(result.presentation, "stepwise-text");
  assert.match(result.fallback, /全部页面完成前不得执行决策/);
});
