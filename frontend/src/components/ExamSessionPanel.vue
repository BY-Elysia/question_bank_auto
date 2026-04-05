<template>
  <GlassPanel
    eyebrow="Step 03"
    title="试卷整卷生成"
    description="前端只负责上传源文件和展示结果。后端会统一判断图片或 PDF；如果是 PDF，会先自动切图，再完成整卷识别，并按最终 JSON 的 chapters 结构展示各部分和题目。"
    tone="ice"
    prominent
  >
    <div class="subpanel">
      <div class="subpanel-head">
        <h3>目标文件</h3>
        <p>先绑定试卷 JSON。后续整卷生成结果会直接写回这份工作副本，并自动刷新当前展示。</p>
      </div>

      <div class="field-grid compact-grid">
        <label class="field field-span-2">
          <span>ARK API Key</span>
          <input
            v-model.trim="state.chapterArkApiKey"
            class="glass-input"
            type="password"
            autocomplete="off"
            spellcheck="false"
            placeholder="请输入图片识别所需的 API Key"
          />
        </label>

        <div class="field field-span-2">
          <span>目标试卷 JSON</span>
          <div class="action-row inline-row">
            <button class="secondary-button" @click="actions.chooseExamJsonSessionFile">选择试卷 JSON</button>
            <button
              class="ghost-button"
              :disabled="!state.examSessionServerJsonPath"
              @click="actions.downloadCurrentExamJson"
            >
              下载当前最新 JSON
            </button>
            <span class="glass-pill" :class="{ 'is-active': Boolean(state.examSessionJsonLabel) }">
              {{ state.examSessionJsonLabel || '尚未选择文件' }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <p v-if="state.examSessionStatus" class="panel-status" :class="{ 'is-error': state.examSessionError }">
      {{ state.examSessionStatus }}
    </p>

    <div v-if="state.examSessionJsonLabel" class="info-grid">
      <div class="info-card">
        <span class="info-label">试卷标题</span>
        <strong>{{ state.examSessionTitle || '未命名试卷' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">考试类型</span>
        <strong>{{ examTypeLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">答案模式</span>
        <strong>{{ state.examSessionHasAnswer === false ? '无答案' : '有答案' }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">当前结构</span>
        <strong>{{ currentStructureLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">结构节点数</span>
        <strong>{{ model?.totalChapters || 0 }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">题目数</span>
        <strong>{{ model?.totalQuestions || 0 }}</strong>
      </div>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>源文件</h3>
        <p>支持图片和 PDF。检测到 PDF 后，会在后端自动切图后再继续生成；如果上传的是图片，则直接按顺序处理。</p>
      </div>

      <div class="action-row wrap-top">
        <label class="file-shell">
          <span>上传图片或 PDF</span>
          <input
            type="file"
            multiple
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            @change="actions.onExamAutoFilesChange"
          />
        </label>

        <button class="secondary-button" @click="actions.chooseExamAutoImageFolder">选择图片文件夹</button>

        <button
          class="ghost-button"
          :disabled="!hasSourceFiles || state.examAutoRunning"
          @click="actions.clearExamAutoFiles"
        >
          清空源文件
        </button>

        <span class="glass-pill" :class="{ 'is-active': hasSourceFiles, 'is-error': sourceKind === 'mixed' }">
          {{ sourceSummary }}
        </span>
      </div>
    </div>

    <div class="subpanel">
      <div class="subpanel-head">
        <h3>开始生成</h3>
        <p>初始化后可以反复重跑。生成完成后，前端会根据完整 JSON 的 chapters 树自动展示各部分和对应题目。</p>
      </div>

      <div class="action-row">
        <button
          class="secondary-button"
          :disabled="!state.examSessionJsonLabel || state.examAutoRunning"
          @click="actions.initExamSession"
        >
          初始化会话
        </button>
        <button
          class="primary-button"
          :disabled="!canRunAuto || state.examAutoRunning"
          @click="actions.runExamAuto"
        >
          {{ state.examAutoRunning ? '生成中...' : '开始生成试卷' }}
        </button>
        <button class="ghost-button" :disabled="!state.examAutoRunning" @click="actions.stopExamAuto">停止</button>
      </div>

      <p v-if="state.examAutoStatus" class="panel-status" :class="{ 'is-error': state.examAutoError }">
        {{ state.examAutoStatus }}
      </p>
    </div>

    <div v-if="state.examAutoLive || state.examAutoSummary" class="info-grid">
      <div class="info-card">
        <span class="info-label">最新进度</span>
        <strong>{{ liveProgressLabel }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">成功页数</span>
        <strong>{{ liveSuccessCount }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">失败页数</span>
        <strong>{{ liveFailedCount }}</strong>
      </div>
      <div class="info-card">
        <span class="info-label">最新结构</span>
        <strong>{{ liveStructureLabel }}</strong>
      </div>
    </div>

    <div v-if="state.examAutoLogs" class="subpanel">
      <div class="subpanel-head">
        <h3>运行日志</h3>
        <p>这里会记录后端切图和整卷识别过程，方便查看当前已经跑到哪一页。</p>
      </div>
      <pre class="chapter-task-log">{{ state.examAutoLogs }}</pre>
    </div>

    <div v-if="examParts.length" class="subpanel">
      <div class="subpanel-head">
        <h3>生成结果</h3>
        <p>以下内容直接来自当前完整 JSON，并按 chapters 结构自动分组显示。</p>
      </div>

      <div class="chapter-task-list">
        <article v-for="part in examParts" :key="part.chapterId" class="process-card chapter-task-card">
          <div class="process-card__header">
            <div>
              <strong>{{ part.title }}</strong>
              <p>{{ part.chapterId }} · 共 {{ part.totalQuestions }} 题</p>
            </div>
            <span class="process-badge is-done">{{ part.groups.length }} 个分组</span>
          </div>

          <div class="process-panel">
            <article v-for="group in part.groups" :key="group.chapterId" class="process-card">
              <div class="process-card__header">
                <div>
                  <strong>{{ group.title }}</strong>
                  <p>{{ group.chapterId }} · {{ group.questions.length }} 题</p>
                </div>
              </div>

              <div class="process-panel">
                <article v-for="question in group.questions" :key="question.questionId" class="process-card">
                  <div class="process-card__header">
                    <div>
                      <strong>{{ question.title || question.questionId }}</strong>
                      <p>{{ question.questionId }} · {{ questionTypeLabel(question.questionType) }}</p>
                    </div>
                    <span class="glass-pill is-active">{{ questionScore(question) }} 分</span>
                  </div>

                  <template v-if="question.nodeType === 'GROUP'">
                    <QuestionTextBlock label="题干" :value="question.stem" />

                    <div class="process-panel">
                      <article v-for="child in question.children || []" :key="child.questionId" class="process-card">
                        <div class="process-card__header">
                          <div>
                            <strong>{{ child.title || child.questionId }}</strong>
                            <p>{{ child.questionId }} · {{ questionTypeLabel(child.questionType) }}</p>
                          </div>
                          <span class="glass-pill">{{ Number(child.defaultScore || 0) }} 分</span>
                        </div>
                        <QuestionTextBlock label="题目" :value="child.prompt" />
                      </article>
                    </div>
                  </template>

                  <template v-else>
                    <QuestionTextBlock label="题目" :value="question.prompt" />
                  </template>
                </article>
              </div>
            </article>
          </div>
        </article>
      </div>
    </div>

    <div v-else-if="state.examSessionPayload" class="empty-state">
      <strong>当前试卷 JSON 里还没有可展示的结构部分</strong>
      <span>可以继续上传源文件生成，或检查当前 JSON 的 chapters 和 questions 是否已经写入。</span>
    </div>
  </GlassPanel>
</template>

<script setup>
import { computed } from 'vue'
import GlassPanel from './GlassPanel.vue'
import QuestionTextBlock from './QuestionTextBlock.vue'
import { buildTextbookVisualizerModel, collectQuestionGroups } from '../utils/textbookVisualizer'

const props = defineProps({
  state: {
    type: Object,
    required: true,
  },
  actions: {
    type: Object,
    required: true,
  },
})

const hasArkApiKey = computed(() => Boolean(String(props.state.chapterArkApiKey || '').trim()))
const hasSourceFiles = computed(() => Array.isArray(props.state.examAutoFiles) && props.state.examAutoFiles.length > 0)

const sourceKind = computed(() => {
  const files = Array.isArray(props.state.examAutoFiles) ? props.state.examAutoFiles : []
  if (!files.length) {
    return ''
  }
  const hasPdf = files.some((item) => /\.pdf$/i.test(String(item?.name || item?.file?.name || '').trim()))
  const hasImage = files.some((item) => /\.(png|jpe?g|webp)$/i.test(String(item?.name || item?.file?.name || '').trim()))
  if (hasPdf && hasImage) return 'mixed'
  if (hasPdf) return 'pdf'
  if (hasImage) return 'image'
  return ''
})

const sourceSummary = computed(() => {
  const files = Array.isArray(props.state.examAutoFiles) ? props.state.examAutoFiles : []
  if (!files.length) {
    return '尚未选择源文件'
  }
  if (sourceKind.value === 'pdf') {
    return `已选 ${files.length} 个 PDF`
  }
  if (sourceKind.value === 'mixed') {
    return `已选 ${files.length} 个文件，但当前不支持图片与 PDF 混传`
  }
  return `已选 ${files.length} 张图片`
})

const canRunAuto = computed(
  () => hasArkApiKey.value && Boolean(props.state.examSessionJsonLabel) && hasSourceFiles.value && sourceKind.value !== 'mixed',
)

const model = computed(() => {
  if (!props.state.examSessionPayload) {
    return null
  }
  return buildTextbookVisualizerModel(props.state.examSessionPayload)
})

const examParts = computed(() => {
  const roots = Array.isArray(model.value?.roots) ? model.value.roots : []
  return roots
    .map((root) => ({
      chapterId: root.chapterId,
      title: root.title,
      totalQuestions: root.totalQuestions,
      groups: collectQuestionGroups(root),
    }))
    .filter((item) => item.groups.length > 0)
})

const questionTypeLabelMap = computed(() => {
  const map = new Map()
  ;(Array.isArray(props.state.examQuestionTypeOptions) ? props.state.examQuestionTypeOptions : []).forEach((item) => {
    map.set(item.value, item.label)
  })
  return map
})

const currentStructureLabel = computed(() => {
  return [String(props.state.examSessionCurrentMajor || '').trim(), String(props.state.examSessionCurrentMinor || '').trim()]
    .filter(Boolean)
    .join(' / ') || '尚未开始'
})

const examTypeLabel = computed(() => {
  if (props.state.examSessionExamType === 'quiz') return '小测'
  if (props.state.examSessionExamType === 'final') return '期末'
  return '期中'
})

const liveProgressLabel = computed(() => {
  const live = props.state.examAutoLive
  const summary = props.state.examAutoSummary
  if (live) {
    return `${live.currentIndex || 0}/${live.totalCount || 0}`
  }
  if (summary) {
    return `${summary.currentIndex || 0}/${summary.totalCount || 0}`
  }
  return '-'
})

const liveSuccessCount = computed(() => Number(props.state.examAutoLive?.successCount ?? props.state.examAutoSummary?.successCount ?? 0))
const liveFailedCount = computed(() => Number(props.state.examAutoLive?.failedCount ?? props.state.examAutoSummary?.failedCount ?? 0))
const liveStructureLabel = computed(() => {
  return String(props.state.examAutoLive?.structureLabel || props.state.examAutoSummary?.structureLabel || '').trim() || currentStructureLabel.value
})

function questionTypeLabel(value) {
  return questionTypeLabelMap.value.get(String(value || '').trim()) || String(value || '未分类')
}

function questionScore(question) {
  if (question?.nodeType === 'GROUP') {
    return (Array.isArray(question.children) ? question.children : []).reduce(
      (sum, child) => sum + Number(child?.defaultScore || 0),
      0,
    )
  }
  return Number(question?.defaultScore || 0)
}
</script>
