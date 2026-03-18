<template>
  <div class="stack-column">
    <GlassPanel
      eyebrow="Assistant"
      title="题库 AI 助手"
      description="这个助手会通过 MCP 工具查询 PostgreSQL 题库 schema，再根据数据库结果回答。默认使用服务端 ARK_API_KEY，也支持在页面临时覆盖。"
      tone="berry"
      prominent
    >
      <div class="field-grid">
        <label class="field field-span-2">
          <span>火山 Ark API Key</span>
          <input
            v-model="state.assistantArkApiKey"
            class="glass-input"
            type="password"
            placeholder="可选，留空则使用后端环境变量 ARK_API_KEY"
          />
        </label>

        <label class="field field-span-2">
          <span>你的问题</span>
          <textarea
            v-model="state.assistantInput"
            class="glass-input assistant-input"
            rows="5"
            placeholder="例如：帮我查一下高二数学里包含不定积分的题有哪些，按教材和章节整理。"
            @keydown.enter.exact.prevent="actions.sendQuestionBankAssistantMessage"
          />
        </label>
      </div>

      <div class="action-row wrap-top">
        <button
          class="primary-button"
          :disabled="state.assistantProcessing || !state.assistantInput.trim()"
          @click="actions.sendQuestionBankAssistantMessage"
        >
          {{ state.assistantProcessing ? '查询中...' : '发送提问' }}
        </button>
        <button class="secondary-button" :disabled="state.assistantProcessing" @click="actions.fillAssistantPrompt('帮我概览一下当前数据库里有哪些教材，并给出每本教材的题目数量。')">
          示例 1
        </button>
        <button class="secondary-button" :disabled="state.assistantProcessing" @click="actions.fillAssistantPrompt('查一下第八章不定积分相关的题目，按章节列出题号和题目标题。')">
          示例 2
        </button>
        <button class="ghost-button" :disabled="state.assistantProcessing" @click="actions.clearQuestionBankAssistantChat">
          清空对话
        </button>
      </div>

      <p v-if="state.assistantStatus" class="panel-status" :class="{ 'is-error': state.assistantError }">
        {{ state.assistantStatus }}
      </p>
    </GlassPanel>

    <GlassPanel
      eyebrow="Conversation"
      title="问答记录"
      description="这里显示用户问题、助手回答，以及本轮 MCP 工具调用摘要。"
      tone="ice"
    >
      <div v-if="state.assistantMessages.length" class="assistant-chat">
        <article
          v-for="(message, index) in state.assistantMessages"
          :key="`${message.role}_${index}_${message.createdAt || ''}`"
          class="assistant-message"
          :class="`assistant-message--${message.role}`"
        >
          <div class="assistant-message__meta">
            <strong>{{ message.role === 'assistant' ? 'AI 助手' : '你' }}</strong>
            <span>{{ formatDate(message.createdAt) }}</span>
          </div>
          <p class="assistant-message__content">{{ message.content }}</p>
          <p v-if="message.role === 'assistant' && message.usedTools?.length" class="assistant-message__tools">
            调用工具：{{ message.usedTools.join('、') }}
          </p>
        </article>
      </div>
      <p v-else class="panel-status">还没有开始对话，可以直接问教材、章节、题型和题目检索问题。</p>

      <div v-if="state.assistantToolTraces.length" class="assistant-trace-list">
        <article v-for="trace in state.assistantToolTraces" :key="`${trace.step}_${trace.tool}`" class="assistant-trace-item">
          <div class="assistant-trace-item__head">
            <strong>步骤 {{ trace.step }} · {{ trace.tool }}</strong>
            <span :class="{ 'is-error': trace.isError }">{{ trace.isError ? '失败' : '完成' }}</span>
          </div>
          <p>原因：{{ trace.reason || '未填写' }}</p>
          <p>参数：{{ formatJson(trace.arguments) }}</p>
          <pre class="code-surface assistant-trace-preview">{{ trace.resultPreview }}</pre>
        </article>
      </div>
    </GlassPanel>
  </div>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

defineProps({
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})

function formatDate(value) {
  if (!value) return '刚刚'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}

function formatJson(value) {
  try {
    return JSON.stringify(value || {}, null, 2)
  } catch (_error) {
    return '{}'
  }
}
</script>
