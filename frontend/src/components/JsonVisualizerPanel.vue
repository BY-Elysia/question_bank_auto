<template>
  <GlassPanel
    eyebrow="Visualizer"
    title="题库可视化"
    description="本地读取来源 JSON，按章节树或试卷结构筛选后查看单题内容，并支持在页面内直接修公式、补图、改题型和生成答案。"
    tone="mint"
    prominent
  >
    <div class="field-grid compact-grid">
      <div class="field field-span-2">
        <span>选择题库 JSON</span>
        <div class="action-row inline-row">
          <button class="secondary-button" @click="actions.chooseVisualizerJsonFile">选择 JSON 文件</button>
          <button
            class="ghost-button"
            :disabled="!state.visualizerFileHandle"
            @click="actions.reloadVisualizerJsonFile"
          >
            重新读取当前文件
          </button>
          <span class="glass-pill" :class="{ 'is-active': Boolean(state.visualizerFileName) }">
            {{ state.visualizerFileName || '尚未选择文件' }}
          </span>
        </div>
      </div>

      <label class="file-shell field-span-2">
        <span>普通上传入口</span>
        <input type="file" accept="application/json,.json" @change="actions.onVisualizerJsonChange" />
      </label>
    </div>

    <p v-if="state.visualizerStatus" class="panel-status" :class="{ 'is-error': state.visualizerError }">
      {{ state.visualizerStatus }}
    </p>

    <p
      v-if="state.visualizerRepairStatus"
      class="panel-status"
      :class="{ 'is-error': state.visualizerRepairError }"
    >
      {{ state.visualizerRepairStatus }}
    </p>

    <p
      v-if="state.visualizerAnswerStatus"
      class="panel-status"
      :class="{ 'is-error': state.visualizerAnswerError }"
    >
      {{ state.visualizerAnswerStatus }}
    </p>

    <div v-if="model" class="info-grid">
      <article class="info-card">
        <span class="info-label">{{ documentTypeLabel }}</span>
        <strong>{{ model.source.title || model.source.externalId || `未命名${documentTypeLabel}` }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">{{ structureCountLabel }}</span>
        <strong>{{ model.totalChapters }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">题目数</span>
        <strong>{{ model.totalQuestions }}</strong>
      </article>
      <article v-if="isExamDocument" class="info-card">
        <span class="info-label">考试类型</span>
        <strong>{{ examTypeLabel }}</strong>
      </article>
      <article v-if="isExamDocument" class="info-card">
        <span class="info-label">答案模式</span>
        <strong>{{ hasAnswerLabel }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">当前文件</span>
        <strong>{{ state.visualizerFileName || '-' }}</strong>
      </article>
    </div>

    <section v-if="model" class="subpanel">
      <div class="subpanel-head">
        <h3>模型解题配置</h3>
        <p>留空会使用服务端环境变量 `ARK_API_KEY`；也可以只在当前页面内临时填写一个 Key。补充要求会跟题目文字和题图一起发给模型。</p>
      </div>

      <div class="field-grid compact-grid">
        <label class="field">
          <span>火山 Ark API Key</span>
          <input
            v-model.trim="state.visualizerArkApiKey"
            class="glass-input"
            type="password"
            placeholder="可选，留空则使用后端环境变量"
          />
        </label>

        <label class="field field-span-2">
          <span>解题要求提示词</span>
          <textarea
            v-model="state.visualizerAnswerPrompt"
            class="glass-input assistant-input"
            rows="4"
            placeholder="例如：请尽量写得规范一些；如果是编程题，请给出思路、核心代码和复杂度。"
          />
        </label>
      </div>
    </section>

    <div v-if="model" class="visualizer-layout">
      <aside class="visualizer-sidebar">
        <div class="visualizer-sidebar__head">
          <strong>{{ sidebarTitle }}</strong>
          <span>{{ model.flatChapters.length }} 个节点</span>
        </div>

        <button
          v-for="chapter in model.flatChapters"
          :key="chapter.chapterId"
          class="visualizer-sidebar__item"
          :class="{ 'is-active': chapter.chapterId === selectedChapterId }"
          :style="{ paddingLeft: `${18 + chapter.depth * 18}px` }"
          @click="selectedChapterId = chapter.chapterId"
        >
          <strong>{{ chapter.title }}</strong>
          <span>{{ chapter.totalQuestions }} 题</span>
        </button>
      </aside>

      <section class="visualizer-detail">
        <header v-if="selectedChapter" class="visualizer-detail__head">
          <div>
            <p class="panel-eyebrow">{{ detailEyebrow }}</p>
            <h3 class="visualizer-detail__title">{{ selectedChapter.title }}</h3>
            <p class="visualizer-detail__meta">
              {{ selectedChapter.chapterId }} · 当前{{ isExamDocument ? '结构树' : '章节树' }}共有
              {{ flattenedQuestions.length }} 道题
            </p>
          </div>
        </header>

        <div v-if="flattenedQuestions.length" class="visualizer-filter-panel">
          <div class="field-grid compact-grid">
            <label class="field">
              <span>{{ sectionFilterLabel }}</span>
              <select v-model="selectedSectionId" class="glass-input">
                <option value="">{{ allSectionOptionLabel }}</option>
                <option v-for="group in questionGroups" :key="group.chapterId" :value="group.chapterId">
                  {{ group.title }}（{{ group.questions.length }} 题）
                </option>
              </select>
            </label>

            <label class="field">
              <span>关键词筛选</span>
              <input
                v-model.trim="keyword"
                class="glass-input"
                type="text"
                placeholder="题号、标题、题干、答案关键词"
              />
            </label>
          </div>

          <div class="field-grid compact-grid">
            <label class="field field-span-2">
              <span>选择题目</span>
              <select v-model="selectedQuestionKey" class="glass-input">
                <option v-for="item in filteredQuestions" :key="item.key" :value="item.key">
                  {{ item.label }}
                </option>
              </select>
            </label>
          </div>

          <div class="visualizer-toolbar">
            <span class="glass-pill is-active">{{ currentQuestionIndex + 1 }}/{{ filteredQuestions.length }} 题</span>
            <span class="glass-pill">{{ currentQuestionMeta?.groupTitle || unnamedGroupLabel }}</span>
            <button class="ghost-button" :disabled="currentQuestionIndex <= 0" @click="goPrevQuestion">
              上一题
            </button>
            <button
              class="ghost-button"
              :disabled="currentQuestionIndex < 0 || currentQuestionIndex >= filteredQuestions.length - 1"
              @click="goNextQuestion"
            >
              下一题
            </button>
          </div>
        </div>

        <QuestionPreviewCard
          v-if="currentQuestionMeta"
          :question="currentQuestionMeta.question"
          :repair-enabled="Boolean(state.visualizerServerJsonPath)"
          :repairing-target="state.visualizerRepairProcessing ? repairingTargetType : ''"
          :question-type-options="questionTypeOptions"
          :question-type-saving="state.visualizerQuestionTypeProcessing"
          :attach-enabled="Boolean(state.visualizerServerJsonPath)"
          :attach-processing="state.visualizerRepairProcessing"
          :has-pending-images="state.visualizerRepairImageFiles.length > 0"
          :answer-enabled="Boolean(state.visualizerServerJsonPath)"
          :answer-processing="state.visualizerAnswerProcessing"
          @repair-math-format="handleRepairMathFormat"
          @update-question-type="handleUpdateQuestionType"
          @attach-images="handleAttachImages"
          @generate-answer="handleGenerateAnswer"
        />

        <section v-if="currentQuestionMeta" class="subpanel visualizer-rewrite-panel">
          <div class="subpanel-head">
            <h3>当前题图片操作</h3>
            <p>上传后的图片可以直接用于“补图到当前题/当前小题”，也可以直接按图片重写当前题。</p>
          </div>

          <div class="visualizer-rewrite-meta">
            <article class="visualizer-rewrite-card">
              <span>当前题目</span>
              <strong>{{ currentQuestionMeta.question.title || currentQuestionMeta.question.questionId }}</strong>
            </article>
            <article class="visualizer-rewrite-card">
              <span>自动定位</span>
              <strong>{{ currentQuestionLocatorText }}</strong>
            </article>
          </div>

          <div class="visualizer-rewrite-upload-wrap">
            <label class="file-shell visualizer-rewrite-upload">
              <span>上传图片</span>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                @change="actions.onVisualizerRepairImageChange"
              />
            </label>
          </div>

          <div class="action-row inline-row visualizer-rewrite-actions">
            <span class="glass-pill" :class="{ 'is-active': state.visualizerRepairImageFiles.length > 0 }">
              {{
                state.visualizerRepairImageFiles.length
                  ? `已选择 ${state.visualizerRepairImageFiles.length} 张图片`
                  : '可选择多张连续页图片'
              }}
            </span>

            <button
              class="ghost-button"
              :disabled="state.visualizerRepairProcessing || !state.visualizerRepairImageFiles.length"
              @click="actions.clearVisualizerRepairImages"
            >
              清空图片
            </button>
          </div>

          <div class="action-row visualizer-rewrite-primary-actions">
            <button
              class="secondary-button"
              :disabled="state.visualizerRepairProcessing || !state.visualizerRepairImageFiles.length || !state.visualizerServerJsonPath"
              @click="handleAttachCurrentQuestion"
            >
              {{ state.visualizerRepairProcessing ? '处理中...' : '补图到当前题' }}
            </button>

            <button
              class="primary-button"
              :disabled="state.visualizerRepairProcessing || !state.visualizerRepairImageFiles.length || !state.visualizerServerJsonPath"
              @click="handleRewriteQuestion"
            >
              {{ state.visualizerRepairProcessing ? '重写中...' : '按图片重写当前题' }}
            </button>
          </div>

          <div v-if="state.visualizerRewriteResult" class="process-panel">
            <article class="process-card" :class="{ 'is-success': !state.visualizerRepairError }">
              <div class="process-card__header">
                <div>
                  <strong>
                    {{ state.visualizerRewriteResult.action === 'replaced' ? '当前题已覆盖重写' : '当前题已补入并写回' }}
                  </strong>
                  <p>
                    {{ state.visualizerRewriteResult.chapterTitle }} / {{ state.visualizerRewriteResult.sectionTitle }}
                  </p>
                </div>
                <span class="process-badge is-done">
                  {{ state.visualizerRewriteResult.action === 'replaced' ? '覆盖' : '补入' }}
                </span>
              </div>

              <div class="process-key-grid">
                <div>
                  <span>修复输出文件</span>
                  <strong>{{ state.visualizerRewriteResult.repairJsonFileName || '未生成' }}</strong>
                </div>
                <div>
                  <span>repair_json 路径</span>
                  <strong>{{ state.visualizerRewriteResult.repairJsonPath || '未生成' }}</strong>
                </div>
                <div>
                  <span>题目 ID</span>
                  <strong>{{ state.visualizerRewriteResult.questionId }}</strong>
                </div>
                <div>
                  <span>写入位置</span>
                  <strong>{{ state.visualizerRewriteResult.insertIndex }}</strong>
                </div>
                <div>
                  <span>上传图片数</span>
                  <strong>{{ state.visualizerRewriteResult.imageCount }}</strong>
                </div>
                <div>
                  <span>题库总量</span>
                  <strong>{{ state.visualizerRewriteResult.questionsCount }}</strong>
                </div>
              </div>

              <div v-if="state.visualizerRewriteResult.reason" class="process-reason-stack">
                <div class="process-reason">
                  <span>模型说明</span>
                  <p>{{ state.visualizerRewriteResult.reason }}</p>
                </div>
              </div>
            </article>
          </div>
        </section>

        <div v-else-if="flattenedQuestions.length" class="empty-state">
          <strong>当前筛选条件下没有题目</strong>
          <span>可以切换结构筛选，或者清空关键词后再看。</span>
        </div>

        <div v-else class="empty-state">
          <strong>{{ isExamDocument ? '当前结构下没有题目' : '当前章节下没有题目' }}</strong>
          <span>可以切换到下一级结构查看，或者检查 JSON 里的 `question.chapterId` 是否与结构树一致。</span>
        </div>
      </section>
    </div>

    <div v-else class="empty-state">
      <strong>还没有加载题库 JSON</strong>
      <span>选择一个已生成的来源 JSON 后，这里会按章节树或结构树筛选并单题展示内容。</span>
    </div>
  </GlassPanel>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GlassPanel from './GlassPanel.vue'
import QuestionPreviewCard from './QuestionPreviewCard.vue'
import { buildTextbookVisualizerModel, collectQuestionGroups } from '../utils/textbookVisualizer'

const FALLBACK_QUESTION_TYPE_OPTIONS = [
  { value: 'SHORT_ANSWER', label: '填空/简答题' },
  { value: 'PROOF', label: '证明题' },
  { value: 'CALCULATION', label: '计算题' },
  { value: 'PROGRAMMING', label: '编程题' },
  { value: 'SINGLE_CHOICE', label: '单选题' },
  { value: 'MULTI_CHOICE', label: '多选题' },
  { value: 'JUDGE', label: '判断题' },
]

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

const selectedChapterId = ref('')
const selectedSectionId = ref('')
const selectedQuestionKey = ref('')
const keyword = ref('')
const repairingTargetType = ref('')

const model = computed(() => {
  if (!props.state.visualizerPayload) {
    return null
  }
  return buildTextbookVisualizerModel(props.state.visualizerPayload)
})

const isExamDocument = computed(() => model.value?.documentType === 'exam')
const documentTypeLabel = computed(() => (isExamDocument.value ? '试卷' : '教材'))
const structureCountLabel = computed(() => (isExamDocument.value ? '结构节点数' : '章节数'))
const sidebarTitle = computed(() => (isExamDocument.value ? '结构目录' : '章节目录'))
const detailEyebrow = computed(() => (isExamDocument.value ? 'Structure' : 'Chapter'))
const sectionFilterLabel = computed(() => (isExamDocument.value ? '结构筛选' : '小节筛选'))
const allSectionOptionLabel = computed(() => (isExamDocument.value ? '全部结构' : '全部小节'))
const unnamedGroupLabel = computed(() => (isExamDocument.value ? '未命名结构' : '未命名小节'))
const questionTypeOptions = computed(() =>
  Array.isArray(props.state.examQuestionTypeOptions) && props.state.examQuestionTypeOptions.length
    ? props.state.examQuestionTypeOptions
    : FALLBACK_QUESTION_TYPE_OPTIONS,
)

const examTypeLabel = computed(() => {
  if (!isExamDocument.value) return ''
  const raw = String(model.value?.exam?.examType || '').trim()
  if (raw === 'quiz') return '小测'
  if (raw === 'final') return '期末'
  return '期中'
})

const hasAnswerLabel = computed(() => (model.value?.source?.hasAnswer === false ? '无答案' : '有答案'))

watch(
  model,
  (value) => {
    if (!value?.flatChapters?.length) {
      selectedChapterId.value = ''
      return
    }
    const stillExists = value.chapterMap.has(selectedChapterId.value)
    if (!stillExists) {
      const firstWithQuestions = value.flatChapters.find((chapter) => chapter.totalQuestions > 0)
      selectedChapterId.value = firstWithQuestions?.chapterId || value.flatChapters[0].chapterId
    }
  },
  { immediate: true },
)

const selectedChapter = computed(() => {
  if (!model.value || !selectedChapterId.value) {
    return null
  }
  return model.value.chapterMap.get(selectedChapterId.value) || null
})

const questionGroups = computed(() => collectQuestionGroups(selectedChapter.value))

watch(
  questionGroups,
  (groups) => {
    const validSectionIds = new Set(groups.map((item) => item.chapterId))
    if (selectedSectionId.value && !validSectionIds.has(selectedSectionId.value)) {
      selectedSectionId.value = ''
    }
  },
  { immediate: true },
)

function buildQuestionSearchText(question) {
  const parts = [question.questionId, question.title, question.questionType]
  if (question.nodeType === 'GROUP') {
    parts.push(question.stem?.text || '')
    for (const child of question.children || []) {
      parts.push(child.questionId, child.title, child.questionType, child.prompt?.text || '', child.standardAnswer?.text || '')
    }
  } else {
    parts.push(question.prompt?.text || '', question.standardAnswer?.text || '')
  }
  return parts.join('\n').toLowerCase()
}

function buildQuestionLabel(groupTitle, question) {
  return `${groupTitle} · ${question.title || question.questionId} · ${question.questionId}`
}

function parseQuestionIdParts(questionId) {
  const match = String(questionId || '').trim().match(/^q_(\d+)_(\d+)_(\d+)(?:_(\d+))?$/)
  if (!match) {
    return null
  }
  return {
    chapterNo: Number(match[1]),
    sectionNo: Number(match[2]),
    questionNo: Number(match[3]),
    childNo: match[4] ? Number(match[4]) : null,
  }
}

const flattenedQuestions = computed(() =>
  questionGroups.value.flatMap((group) =>
    group.questions.map((question) => ({
      key: question.questionId || `${group.chapterId}-${question.title}`,
      groupId: group.chapterId,
      groupTitle: group.title,
      question,
      label: buildQuestionLabel(group.title, question),
      searchText: buildQuestionSearchText(question),
    })),
  ),
)

const filteredQuestions = computed(() => {
  const keywordValue = keyword.value.trim().toLowerCase()
  return flattenedQuestions.value.filter((item) => {
    if (selectedSectionId.value && item.groupId !== selectedSectionId.value) {
      return false
    }
    if (keywordValue && !item.searchText.includes(keywordValue)) {
      return false
    }
    return true
  })
})

watch(
  filteredQuestions,
  (items) => {
    const exists = items.some((item) => item.key === selectedQuestionKey.value)
    if (!exists) {
      selectedQuestionKey.value = items[0]?.key || ''
    }
  },
  { immediate: true },
)

const currentQuestionIndex = computed(() =>
  filteredQuestions.value.findIndex((item) => item.key === selectedQuestionKey.value),
)

const currentQuestionMeta = computed(() => {
  if (currentQuestionIndex.value < 0) {
    return null
  }
  return filteredQuestions.value[currentQuestionIndex.value] || null
})

const currentQuestionParts = computed(() =>
  parseQuestionIdParts(currentQuestionMeta.value?.question?.questionId || ''),
)

const currentQuestionLocatorText = computed(() => {
  if (!currentQuestionMeta.value?.question) {
    return ''
  }
  if (isExamDocument.value) {
    return currentQuestionMeta.value.question.questionId
  }
  return currentQuestionParts.value
    ? `第 ${currentQuestionParts.value.chapterNo} 章 / 第 ${currentQuestionParts.value.sectionNo} 小节 / 第 ${currentQuestionParts.value.questionNo} 题`
    : currentQuestionMeta.value.question.questionId
})

function goPrevQuestion() {
  if (currentQuestionIndex.value <= 0) {
    return
  }
  selectedQuestionKey.value = filteredQuestions.value[currentQuestionIndex.value - 1].key
}

function goNextQuestion() {
  if (currentQuestionIndex.value < 0 || currentQuestionIndex.value >= filteredQuestions.value.length - 1) {
    return
  }
  selectedQuestionKey.value = filteredQuestions.value[currentQuestionIndex.value + 1].key
}

async function handleRepairMathFormat(payload) {
  repairingTargetType.value = String(payload?.targetType || '')
  try {
    await props.actions.repairMathFormatFromVisualizer(payload)
  } finally {
    repairingTargetType.value = ''
  }
}

async function handleUpdateQuestionType(payload) {
  await props.actions.updateQuestionTypeFromVisualizer(payload)
}

async function handleAttachImages(payload) {
  await props.actions.attachImagesFromVisualizer(payload)
}

async function handleGenerateAnswer(payload) {
  await props.actions.generateAnswerFromVisualizer(payload)
}

async function handleAttachCurrentQuestion() {
  const question = currentQuestionMeta.value?.question
  if (!question) {
    return
  }
  await props.actions.attachImagesFromVisualizer({
    questionId: question.questionId,
    questionTitle: question.title || question.questionId,
    childQuestionId: '',
    childNo: null,
    blockLabel: question.nodeType === 'GROUP' ? '当前题干' : '当前题目',
  })
}

async function handleRewriteQuestion() {
  const question = currentQuestionMeta.value?.question
  if (!question) {
    return
  }
  await props.actions.repairQuestionFromVisualizer({
    questionId: question.questionId,
    questionTitle: question.title || question.questionId,
  })
}
</script>
