export const QUESTION_TYPE_OPTIONS = [
  {
    value: 'SHORT_ANSWER',
    label: '填空/简答题',
    aliases: ['填空题', '简答题'],
  },
  {
    value: 'PROOF',
    label: '证明题',
    aliases: ['证明题'],
  },
  {
    value: 'CALCULATION',
    label: '计算题',
    aliases: ['计算题', '解答题'],
  },
  {
    value: 'CODE',
    label: '编程题',
    aliases: ['编程题', '程序题', '代码题'],
  },
  {
    value: 'SINGLE_CHOICE',
    label: '单选题',
    aliases: ['单选题', '单项选择题', '选择题'],
  },
  {
    value: 'MULTI_CHOICE',
    label: '多选题',
    aliases: ['多选题', '多项选择题', '不定项选择题'],
  },
  {
    value: 'JUDGE',
    label: '判断题',
    aliases: ['判断题'],
  },
] as const

export function normalizeQuestionType(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) {
    return 'SHORT_ANSWER'
  }
  const upper = raw.toUpperCase()
  if (upper === 'PROGRAMMING' || upper === 'CODE') {
    return 'CODE'
  }
  if (QUESTION_TYPE_OPTIONS.some((option) => option.value === upper)) {
    return upper
  }
  if (/编程|程序|代码/.test(raw)) return 'CODE'
  if (/多项|多选|不定项/.test(raw)) return 'MULTI_CHOICE'
  if (/单项|单选|选择/.test(raw)) return 'SINGLE_CHOICE'
  if (/判断/.test(raw)) return 'JUDGE'
  if (/证明/.test(raw)) return 'PROOF'
  if (/计算|解答|求解|求/.test(raw)) return 'CALCULATION'
  if (/填空|简答|问答/.test(raw)) return 'SHORT_ANSWER'
  return 'SHORT_ANSWER'
}
