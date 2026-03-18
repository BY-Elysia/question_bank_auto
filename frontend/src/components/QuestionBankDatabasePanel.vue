<template>
  <div class="stack-column">
    <GlassPanel
      eyebrow="Database"
      title="题库数据库导入"
      description="这个功能只负责把已经生成好的题库 JSON 导入 PostgreSQL 新 schema，不会写进 public。先在终端执行迁移，再从这里上传 JSON。"
      tone="berry"
    >
      <label class="file-shell">
        <span>选择题库 JSON</span>
        <input type="file" accept=".json,application/json" multiple @change="actions.onDbImportFilesChange" />
      </label>

      <div v-if="state.dbImportFiles.length" class="upload-file-list">
        <div
          v-for="(file, index) in state.dbImportFiles"
          :key="`${file.name}_${file.size}_${file.lastModified}_${index}`"
          class="upload-file-item"
        >
          <div class="upload-file-item__meta">
            <strong>{{ file.name }}</strong>
            <span>{{ formatSize(file.size) }}</span>
          </div>
          <button class="ghost-button" @click="actions.removeDbImportFile(index)">移除</button>
        </div>
      </div>

      <div class="action-row">
        <button class="primary-button" :disabled="state.dbImportProcessing" @click="actions.importQuestionBankDbJsonFiles">
          {{ state.dbImportProcessing ? '导入中...' : '上传并导入数据库' }}
        </button>
        <button class="secondary-button" :disabled="state.dbImportProcessing || !state.dbImportFiles.length" @click="actions.clearDbImportFiles">
          清空文件
        </button>
        <button class="ghost-button" :disabled="state.dbSummaryLoading" @click="actions.loadQuestionBankDbSummary">
          刷新数据库摘要
        </button>
      </div>

      <p v-if="state.dbImportStatus" class="panel-status" :class="{ 'is-error': state.dbImportError }">
        {{ state.dbImportStatus }}
      </p>

      <div v-if="state.dbImportResult?.items?.length" class="db-result-list">
        <div v-for="item in state.dbImportResult.items" :key="`${item.fileName}_${item.textbookId}`" class="db-result-item">
          <strong>{{ item.title }}</strong>
          <span>{{ item.fileName }}</span>
          <span>章节 {{ item.chapters }} / 题目行 {{ item.questionRows }}</span>
        </div>
      </div>
    </GlassPanel>

    <GlassPanel
      eyebrow="Schema"
      title="数据库摘要"
      description="这里显示当前题库 schema 的导入结果，便于确认 JSON 是否已经落入新库。"
      tone="ice"
    >
      <p v-if="state.dbSummaryStatus" class="panel-status" :class="{ 'is-error': state.dbSummaryError }">
        {{ state.dbSummaryStatus }}
      </p>

      <template v-if="state.dbSummary">
        <div class="summary-stats">
          <article class="summary-stat">
            <span>Schema</span>
            <strong>{{ state.dbSummary.schema }}</strong>
            <small>{{ state.dbSummary.database || '使用当前 PostgreSQL 环境变量连接' }}</small>
          </article>
          <article class="summary-stat">
            <span>教材</span>
            <strong>{{ state.dbSummary.counts.textbookCount }}</strong>
            <small>已导入教材数</small>
          </article>
          <article class="summary-stat">
            <span>章节</span>
            <strong>{{ state.dbSummary.counts.chapterCount }}</strong>
            <small>章节树节点总数</small>
          </article>
          <article class="summary-stat">
            <span>题目行</span>
            <strong>{{ state.dbSummary.counts.questionRowCount }}</strong>
            <small>含大题、独立题和子题</small>
          </article>
        </div>

        <div v-if="state.dbSummary.textbooks.length" class="db-summary-list">
          <article v-for="item in state.dbSummary.textbooks" :key="`${item.courseId}_${item.textbookId}`" class="db-summary-item">
            <div class="db-summary-item__head">
              <div>
                <h3>{{ item.title }}</h3>
                <p>{{ item.subject }} · {{ item.courseId }} · {{ item.textbookId }}</p>
              </div>
              <span class="db-summary-item__stamp">{{ formatDate(item.updatedAt) }}</span>
            </div>
            <div class="db-summary-item__metrics">
              <span>章节 {{ item.chapters }}</span>
              <span>题目行 {{ item.questionRows }}</span>
              <span>大题 {{ item.groupQuestions }}</span>
              <span>独立题 {{ item.leafQuestions }}</span>
              <span>子题 {{ item.childQuestions }}</span>
            </div>
            <p class="db-summary-item__source">来源文件：{{ item.sourceFileName }}</p>
          </article>
        </div>
      </template>
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

function formatSize(size) {
  const value = Number(size || 0)
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`
  }
  return `${value} B`
}

function formatDate(value) {
  if (!value) return '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)
  return date.toLocaleString('zh-CN', { hour12: false })
}
</script>
