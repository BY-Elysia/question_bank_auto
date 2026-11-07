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
