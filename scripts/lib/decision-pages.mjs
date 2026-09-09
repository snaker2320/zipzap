export function projectDecisionPages(input) {
  const questions = input.questions ?? [];
  if (!Array.isArray(questions) || questions.some((item) => !item?.id || !item?.question)) {
    throw new Error("decision questions require id and question");
  }
  const callable = input.host?.request_user_input?.callable === true;
  const hostMax = input.host?.request_user_input?.max_questions ?? 3;
  const pageSize = Math.max(1, Math.min(3, input.page_size ?? hostMax));
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
    presentation: callable ? "native-form" : "stepwise-text",
    atomic: true,
    page_size: pageSize,
    pages,
    fallback: callable ? null : "逐页询问并保存临时答案；全部页面完成前不得执行决策。"
  };
}
