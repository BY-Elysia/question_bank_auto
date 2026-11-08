import {ReviewTools} from '../../dist/app/modules/assistant/application/tools/review-tools.js';
import { questionReference } from '../../dist/app/modules/catalog/domain/question-reference.js';
import { CatalogTools } from '../../dist/app/modules/assistant/application/tools/catalog-tools.js';
import { InteractionTools } from '../../dist/app/modules/assistant/application/tools/interaction-tools.js';
let knowledge, actions;
export const bindKnowledge = (value,reviewActions) => {knowledge = value;actions=reviewActions;};
import { setTimeout as delay } from 'node:timers/promises';
export const assistantRuntime = {
  history: (messages) => structuredClone(messages),
  async step(i) {
    const text = i.checkpoint.filter((x) => x.role === 'user').at(-1)?.content ?? '';
    const result = (text, extra = {}) => ({
      checkpoint: [...i.checkpoint, { role: 'assistant', content: text }],
      text,
      interactions: [],
      model: 'browser-test',
      usage: { input_tokens: 10, output_tokens: 8, total_tokens: 18 },
      stop: 'complete',
      ...extra,
    });
    if(text.startsWith('系统后台操作结果：'))return result('已完成修改，可查看差异或撤销。');
    if(i.execution?.scope.allowEdits && /修复|补全/.test(text)) {
      const tools=new ReviewTools(new CatalogTools(knowledge,new InteractionTools()),actions,knowledge).tools(i.execution);
      const img=await tools.find(t=>t.name==='read_question_page').execute('read-page',{page:1},i.signal);
      if(!img.images?.length)throw Error('Missing source image');
      const output=await tools.find(t=>t.name==='run_question_action').execute('edit',{kind:text.includes('补全')?'answers':'repair',instruction:text},i.signal);
      if(!output.deferred)return result(output.text);
      return result('正在处理选中题目',{stop:'continue',deferred:[output.deferred]});
    }
    if (i.execution?.scope.workspaceIds.length) {
      const tools = new CatalogTools(knowledge, new InteractionTools()).tools(i.execution);
      const call = async (name, args) =>
        JSON.parse(
          (await tools.find((t) => t.name === name).execute(crypto.randomUUID(), args, i.signal))
            .text,
        );
      const found = await call('search_questions', {});
      if (!found.data?.items.length) return result('没有匹配题目');
      const full = await call('get_question', i.execution.scope.focus ? {questionRef: questionReference(i.execution.scope.focus)} : found.data.items[0]);
      if (!full.ok) return result(full.error);
      return result(`这道题的计算结果为 $11$。[来源:${full.data.evidence.id}]`);
    }
    if (text.includes('询问测试') && !i.answers.length) {
      return result('我需要确认你的学科。', {
        stop: 'continue',
        interactions: [
          {
            id: 'question',
            toolCallId: 'call',
            question: '选择学习学科',
            options: ['数学', '英语'],
            kind: 'confirmation',
            status: 'pending',
            answer: null,
          },
        ],
      });
    }
    if (i.answers.some((q) => q.status === 'answered'))
      return result(
        '收到你的选择：' +
          i.answers.find((q) => q.status === 'answered').answer +
          '，现在继续原来的学习计划。',
      );
    const slow = text.includes('慢速测试');
    const output = slow
      ? '正在逐步整理学习计划，接下来会继续补充内容。'
      : '你好，这是 AI 助手回复 $x^2$。';
    for (const part of output.match(/.{1,4}/g)) {
      i.delta(part);
      await delay(slow ? 700 : 100, undefined, { signal: i.signal });
    }
    return result(output);
  },
};
