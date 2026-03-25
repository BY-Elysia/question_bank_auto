<template>
  <GlassPanel
    eyebrow="Step 01"
    title="选择生成类型"
    description="先确定当前要走教材生成还是试卷生成，后续面板会按选择切换到对应流程。"
    tone="mint"
  >
    <div class="subpanel-head">
      <h3>流程入口</h3>
      <p>教材生成沿用现在这套结构化处理流程；试卷生成先预留独立入口，后面再接试卷专属逻辑。</p>
    </div>

    <div class="mode-switch" role="tablist" aria-label="生成类型">
      <button
        type="button"
        class="mode-switch__button"
        :class="{ 'is-active': pipelineKind === 'textbook' }"
        @click="$emit('select', 'textbook')"
      >
        <strong>教材生成</strong>
        <span>沿用基础教材 JSON、章节会话和按页结构化提取这套现有流程。</span>
      </button>

      <button
        type="button"
        class="mode-switch__button"
        :class="{ 'is-active': pipelineKind === 'exam' }"
        @click="$emit('select', 'exam')"
      >
        <strong>试卷生成</strong>
        <span>切到试卷专属分支，后续会接入另一套处理逻辑和页面编排。</span>
      </button>
    </div>

    <p class="mode-switch__hint">
      当前选择：{{ pipelineKind === 'exam' ? '试卷生成' : '教材生成' }}。
      {{ pipelineKind === 'exam' ? '现在先把分支入口搭起来。' : '选择后会继续进入原有教材流程。' }}
    </p>
  </GlassPanel>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

defineProps({
  pipelineKind: {
    type: String,
    default: 'textbook',
  },
})

defineEmits(['select'])
</script>
