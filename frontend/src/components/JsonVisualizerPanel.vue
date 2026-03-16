<template>
  <GlassPanel
    eyebrow="Visualizer"
    title="题库可视化"
    description="本地读取题库 JSON，按章节树筛选后单题查看题目与标准答案，并渲染 LaTeX 公式。"
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
        <span>普通上传兜底</span>
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

    <div v-if="model" class="info-grid">
      <article class="info-card">
        <span class="info-label">教材</span>
        <strong>{{ model.textbook.title || model.textbook.textbookId || '未命名教材' }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">章节数</span>
        <strong>{{ model.totalChapters }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">题目数</span>
        <strong>{{ model.totalQuestions }}</strong>
      </article>
      <article class="info-card">
        <span class="info-label">当前文件</span>
        <strong>{{ state.visualizerFileName || '-' }}</strong>
      </article>
    </div>

    <div v-if="model" class="visualizer-layout">
      <aside class="visualizer-sidebar">
        <div class="visualizer-sidebar__head">
          <strong>章节目录</strong>
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
            <p class="panel-eyebrow">Chapter</p>
            <h3 class="visualizer-detail__title">{{ selectedChapter.title }}</h3>
            <p class="visualizer-detail__meta">
              {{ selectedChapter.chapterId }} · 当前章节树共 {{ flattenedQuestions.length }} 道题
            </p>
          </div>
        </header>

        <div v-if="flattenedQuestions.length" class="visualizer-filter-panel">
          <div class="field-grid compact-grid">
            <label class="field">
              <span>小节筛选</span>
              <select v-model="selectedSectionId" class="glass-input">
                <option value="">全部小节</option>
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
            <span class="glass-pill is-active">
              {{ currentQuestionIndex + 1 }}/{{ filteredQuestions.length }} 题
            </span>
            <span class="glass-pill">
              {{ currentQuestionMeta?.groupTitle || '未命名小节' }}
            </span>
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
          @repair-math-format="handleRepairMathFormat"
        />

        <div v-else-if="flattenedQuestions.length" class="empty-state">
          <strong>当前筛选条件下没有题目</strong>
          <span>可以切换小节或清空关键词筛选。</span>
        </div>

        <div v-else class="empty-state">
          <strong>当前章节下没有题目</strong>
          <span>可以切换到下一级小节查看，或者检查 JSON 中 question.chapterId 是否与章节树一致。</span>
        </div>
      </section>
    </div>

    <div v-else class="empty-state">
      <strong>还没有加载题库 JSON</strong>
      <span>选择一个已生成的题库文件后，这里会按章节树筛选并单题展示题目和答案。</span>
    </div>
  </GlassPanel>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import GlassPanel from './GlassPanel.vue'
import QuestionPreviewCard from './QuestionPreviewCard.vue'
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

const selectedChapterId = ref('')
const selectedSectionId = ref('')
const selectedQuestionKey = ref('')
const keyword = ref('')

const model = computed(() => {
  if (!props.state.visualizerPayload) {
    return null
  }
  return buildTextbookVisualizerModel(props.state.visualizerPayload)
})

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
      parts.push(child.questionId, child.title, child.prompt?.text || '', child.standardAnswer?.text || '')
    }
  } else {
    parts.push(question.prompt?.text || '', question.standardAnswer?.text || '')
  }
  return parts.join('\n').toLowerCase()
}

function buildQuestionLabel(groupTitle, question) {
  return `${groupTitle} · ${question.title || question.questionId} · ${question.questionId}`
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

const repairingTargetType = ref('')

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
</script>
