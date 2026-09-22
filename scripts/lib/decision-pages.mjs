export function projectDecisionPages(input) {
  const questions = input.questions ?? [];
  if (!Array.isArray(questions) || questions.some((item) => !item?.id || !item?.question)) {
    throw new Error("decision questions require id and question");
  }
  const tool = ["request_user_input", "request_user_input_async"]
    .find((name) => input.host?.[name]?.callable === true) ?? null;
  const hostMax = input.host?.[tool]?.max_questions ?? 3;
  const pageSize = Math.max(1, Math.min(3, hostMax, input.page_size ?? hostMax));
  const pages = [];
  for (let index = 0; index < questions.length; index += pageSize) {
    pages.push({
      page: pages.length + 1,
      questions: questions.slice(index, index + pageSize)
    });
  }
  return {
    schema_version: 1,
    must_pause: questions.length > 0,
    presentation: tool ? "native-form" : "stepwise-text",
    tool,
    atomic: true,
    page_size: pageSize,
    pages,
    fallback: tool ? null : "逐页询问并保存临时答案；全部页面完成前不得执行决策。"
  };
}
