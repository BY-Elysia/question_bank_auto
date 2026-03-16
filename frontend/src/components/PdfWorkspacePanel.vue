<template>
  <GlassPanel
    eyebrow="Step 03"
    title="PDF 转图工作台"
    description="上传一个或多个教材 PDF，按前端指定顺序连续切页成 JPG，为后续章节和题目识别准备标准输入。"
    tone="sun"
    prominent
  >
    <div class="field-grid compact-grid">
      <label class="field">
        <span>输出文件夹名</span>
        <input
          v-model.trim="state.folderName"
          class="glass-input"
          type="text"
          placeholder="math_book_1"
        />
      </label>
      <label class="file-shell">
        <span>选择 PDF 文件</span>
        <input type="file" accept="application/pdf" multiple @change="actions.onFileChange" />
      </label>
    </div>

    <div class="action-row">
      <button
        class="primary-button"
        :disabled="state.loading || !state.selectedPdfFiles.length || !state.folderName"
        @click="actions.uploadPdf"
      >
        {{ state.loading ? '转换中...' : '上传并转换' }}
      </button>
      <button
        class="ghost-button"
        :disabled="state.loading || !state.selectedPdfFiles.length"
        @click="actions.clearSelectedPdfs"
      >
        清空待转换列表
      </button>
      <span class="glass-pill" :class="{ 'is-active': state.selectedPdfFiles.length > 0 }">
        {{ state.selectedPdfFiles.length ? `待转换 ${state.selectedPdfFiles.length} 个 PDF` : '尚未选择 PDF' }}
      </span>
      <span class="glass-pill" :class="{ 'is-active': state.pages.length > 0 }">
        {{ state.pages.length ? `已生成 ${state.pages.length} 页` : '尚未生成页图' }}
      </span>
    </div>

    <p class="panel-status" :class="{ 'is-error': state.isError }">{{ state.statusText }}</p>

    <div v-if="state.selectedPdfFiles.length" class="pdf-order-panel">
      <div class="pdf-order-panel__head">
        <strong>PDF 顺序</strong>
        <span>生成页图时会按这里从上到下连续编号</span>
      </div>
      <div class="pdf-order-list">
        <article
          v-for="(item, index) in state.selectedPdfFiles"
          :key="item.id"
          class="pdf-order-item"
        >
          <div class="pdf-order-item__meta">
            <strong>{{ index + 1 }}. {{ item.file.name }}</strong>
            <span>{{ formatFileSize(item.file.size) }}</span>
          </div>
          <div class="pdf-order-item__actions">
            <button
              class="secondary-button"
              :disabled="state.loading || index === 0"
              @click="actions.moveSelectedPdf(index, -1)"
            >
              上移
            </button>
            <button
              class="secondary-button"
              :disabled="state.loading || index === state.selectedPdfFiles.length - 1"
              @click="actions.moveSelectedPdf(index, 1)"
            >
              下移
            </button>
            <button
              class="ghost-button"
              :disabled="state.loading"
              @click="actions.removeSelectedPdf(index)"
            >
              移除
            </button>
          </div>
        </article>
      </div>
    </div>

    <div v-if="state.pages.length" class="info-grid">
      <div class="info-card">
        <span class="info-label">页数</span>
        <strong>{{ state.pages.length }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">批次号</span>
        <strong>{{ state.batchId }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">文件夹</span>
        <strong>{{ state.outputFolder }}</strong>
      </div>
    </div>
  </GlassPanel>
</template>

<script setup>
import GlassPanel from './GlassPanel.vue'

function formatFileSize(size) {
  const bytes = Number(size || 0)
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

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
