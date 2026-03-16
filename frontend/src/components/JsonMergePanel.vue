<template>
  <GlassPanel
    eyebrow="Merge"
    title="多章节 JSON 合并"
    description="选择多个拆开的章节 JSON，按 chapterId 和 questionId 去重拼接，输出到 merged_json 新文件夹。"
    tone="clear"
    prominent
  >
    <div class="field-grid compact-grid">
      <label class="field">
        <span>输出文件名</span>
        <input
          v-model.trim="state.mergeOutputFileName"
          class="glass-input"
          type="text"
          placeholder="merged_textbook.json"
        />
      </label>
      <label class="file-shell">
        <span>添加 JSON 文件</span>
        <input type="file" multiple accept="application/json,.json" @change="actions.onMergeJsonFilesChange" />
      </label>
    </div>

    <div class="action-row inline-row">
      <span class="glass-pill" :class="{ 'is-active': state.mergeJsonFiles.length > 0 }">
        {{ state.mergeJsonFiles.length ? `当前已加入 ${state.mergeJsonFiles.length} 个 JSON 文件` : '至少选择 2 个 JSON 文件，可分多次添加' }}
      </span>
      <button class="ghost-button" :disabled="!state.mergeJsonFiles.length" @click="actions.clearMergeJsonFiles">
        清空列表
      </button>
    </div>

    <div v-if="state.mergeJsonFiles.length" class="merge-file-list">
      <article v-for="(file, index) in state.mergeJsonFiles" :key="`${file.name}-${file.size}-${file.lastModified}`" class="merge-file-item">
        <div>
          <strong>{{ index + 1 }}. {{ file.name }}</strong>
          <p>{{ formatFileSize(file.size) }}</p>
        </div>
        <button class="ghost-button" @click="actions.removeMergeJsonFile(index)">移除</button>
      </article>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="state.mergeProcessing || state.mergeJsonFiles.length < 2"
        @click="actions.mergeJsonFiles"
      >
        {{ state.mergeProcessing ? '合并中...' : '执行合并' }}
      </button>
    </div>

    <p v-if="state.mergeStatus" class="panel-status" :class="{ 'is-error': state.mergeError }">
      {{ state.mergeStatus }}
    </p>

    <div v-if="state.mergeResult" class="process-panel">
      <article class="process-card" :class="{ 'is-success': !state.mergeError }">
        <div class="process-card__header">
          <div>
            <strong>合并文件已生成</strong>
            <p>merged_json 输出目录</p>
          </div>
          <span class="process-badge is-done">完成</span>
        </div>

        <div class="process-key-grid">
          <div>
            <span>输出文件</span>
            <strong>{{ state.mergeResult.mergedFileName }}</strong>
          </div>
          <div>
            <span>输出路径</span>
            <strong>{{ state.mergeResult.mergedFilePath }}</strong>
          </div>
          <div>
            <span>输入文件数</span>
            <strong>{{ state.mergeResult.inputCount }}</strong>
          </div>
          <div>
            <span>章节总数</span>
            <strong>{{ state.mergeResult.chaptersCount }}</strong>
          </div>
          <div>
            <span>题目总数</span>
            <strong>{{ state.mergeResult.questionsCount }}</strong>
          </div>
          <div>
            <span>重复章节</span>
            <strong>{{ state.mergeResult.duplicateChapterCount }}</strong>
          </div>
          <div>
            <span>重复题目</span>
            <strong>{{ state.mergeResult.duplicateQuestionCount }}</strong>
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

function formatFileSize(size) {
  if (!Number.isFinite(size)) return '-'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / (1024 * 1024)).toFixed(2)} MB`
}
</script>
