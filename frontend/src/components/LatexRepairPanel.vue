<template>
  <GlassPanel
    eyebrow="LaTeX Repair"
    title="LaTeX 格式修复"
    description="对已有题库 JSON 做确定性 LaTeX 修复，重点修反斜杠命令和未闭合块公式，输出到 latex_repair_json。"
    tone="clear"
    prominent
  >
    <div class="field-grid">
      <div class="field field-span-2">
        <span>目标 JSON 文件</span>
        <div class="action-row inline-row">
          <button class="secondary-button" @click="actions.chooseJsonSessionFile">选择 JSON 文件</button>
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.chapterSessionJsonLabel) }">
            {{ state.chapterSessionJsonLabel || '尚未选择文件' }}
          </span>
        </div>
      </div>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="state.latexRepairProcessing || !state.chapterSessionServerJsonPath"
        @click="actions.repairJsonLatex"
      >
        {{ state.latexRepairProcessing ? '修复中...' : '执行 LaTeX 修复' }}
      </button>
    </div>

    <p v-if="state.latexRepairStatus" class="panel-status" :class="{ 'is-error': state.latexRepairError }">
      {{ state.latexRepairStatus }}
    </p>

    <div v-if="state.latexRepairResult" class="process-panel">
      <article class="process-card" :class="{ 'is-success': !state.latexRepairError }">
        <div class="process-card__header">
          <div>
            <strong>LaTeX 修复输出已生成</strong>
            <p>latex_repair_json 输出目录</p>
          </div>
          <span class="process-badge is-done">完成</span>
        </div>

        <div class="process-key-grid">
          <div>
            <span>输出文件</span>
            <strong>{{ state.latexRepairResult.repairedFileName }}</strong>
          </div>
          <div>
            <span>输出路径</span>
            <strong>{{ state.latexRepairResult.repairedFilePath }}</strong>
          </div>
          <div>
            <span>题目总数</span>
            <strong>{{ state.latexRepairResult.questionCount }}</strong>
          </div>
          <div>
            <span>扫描文本块</span>
            <strong>{{ state.latexRepairResult.visitedTextBlockCount }}</strong>
          </div>
          <div>
            <span>修复文本块</span>
            <strong>{{ state.latexRepairResult.changedTextBlockCount }}</strong>
          </div>
          <div>
            <span>涉及题目数</span>
            <strong>{{ state.latexRepairResult.changedQuestionCount }}</strong>
          </div>
        </div>
      </article>
    </div>
  </GlassPanel>
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
</script>
